'use strict';

/**
 * iSDLC Hook Test Utilities (CommonJS)
 * =====================================
 * Shared utilities for testing hook scripts that run as child processes.
 *
 * Hooks use CommonJS (require/module.exports) but the project package.json
 * has "type": "module". This file uses the .cjs extension to force CommonJS
 * mode regardless of the package type setting.
 *
 * Usage:
 *   const { setupTestEnv, cleanupTestEnv, runHook, writeState, readState } = require('./hook-test-utils.cjs');
 *
 * Version: 1.0.0
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let testDir = null;

// ---------------------------------------------------------------------------
// deepMerge
// ---------------------------------------------------------------------------

/**
 * Simple deep merge for plain objects. Arrays are replaced, not concatenated.
 * @param {object} target - Base object (will not be mutated)
 * @param {object} source - Overrides to apply
 * @returns {object} New merged object
 */
function deepMerge(target, source) {
    const result = Object.assign({}, target);
    for (const key of Object.keys(source)) {
        const srcVal = source[key];
        const tgtVal = target[key];
        if (
            srcVal !== null &&
            typeof srcVal === 'object' &&
            !Array.isArray(srcVal) &&
            tgtVal !== null &&
            typeof tgtVal === 'object' &&
            !Array.isArray(tgtVal)
        ) {
            result[key] = deepMerge(tgtVal, srcVal);
        } else {
            result[key] = srcVal;
        }
    }
    return result;
}

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

const DEFAULT_STATE = {
    skill_enforcement: {
        enabled: true,
        mode: 'observe',
        fail_behavior: 'allow',
        manifest_version: '4.0.0'
    },
    current_phase: '06-implementation',
    skill_usage_log: [],
    iteration_enforcement: { enabled: true },
    phases: {}
};

// ---------------------------------------------------------------------------
// setupTestEnv
// ---------------------------------------------------------------------------

/**
 * Creates an isolated temporary test environment.
 *
 * - Creates .isdlc/ and .claude/hooks/config/ directories
 * - Copies skills-manifest.json and iteration-requirements.json from the
 *   real config directory (resolved relative to this file)
 * - Writes state.json with defaults deep-merged with any provided overrides
 * - Sets process.env.CLAUDE_PROJECT_DIR to the temp directory
 *
 * @param {object} [stateOverrides] - Keys to deep-merge into the default state
 * @returns {string} The path to the temporary test directory
 */
function setupTestEnv(stateOverrides) {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'isdlc-hook-test-'));

    // Create required directory structure
    fs.mkdirSync(path.join(testDir, '.isdlc'), { recursive: true });
    fs.mkdirSync(path.join(testDir, '.claude', 'hooks', 'config'), { recursive: true });

    // REQ-GH-231: Copy config files from canonical src/isdlc/config/ location
    const canonicalConfigDir = path.resolve(__dirname, '..', '..', '..', 'isdlc', 'config');
    // Legacy fallback: hooks/config (pre-consolidation)
    const hooksConfigDir = path.resolve(__dirname, '..', 'config');

    const configFiles = ['skills-manifest.json', 'iteration-requirements.json'];
    for (const filename of configFiles) {
        const canonicalSrc = path.join(canonicalConfigDir, filename);
        const legacySrc = path.join(hooksConfigDir, filename);
        const src = fs.existsSync(canonicalSrc) ? canonicalSrc : legacySrc;
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, path.join(testDir, '.claude', 'hooks', 'config', filename));
        }
    }

    // Write state.json with defaults merged with overrides
    const state = stateOverrides ? deepMerge(DEFAULT_STATE, stateOverrides) : Object.assign({}, DEFAULT_STATE);
    fs.writeFileSync(
        path.join(testDir, '.isdlc', 'state.json'),
        JSON.stringify(state, null, 2)
    );

    // Point hooks at the test directory
    process.env.CLAUDE_PROJECT_DIR = testDir;

    return testDir;
}

// ---------------------------------------------------------------------------
// cleanupTestEnv
// ---------------------------------------------------------------------------

/**
 * Removes the temporary test directory and clears the module-level testDir variable.
 */
function cleanupTestEnv() {
    if (testDir && fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
    }
    testDir = null;
}

// ---------------------------------------------------------------------------
// getTestDir
// ---------------------------------------------------------------------------

/**
 * Returns the current test directory path, or null if no environment is active.
 * @returns {string|null}
 */
function getTestDir() {
    return testDir;
}

// ---------------------------------------------------------------------------
// writeState / readState
// ---------------------------------------------------------------------------

/**
 * Writes a complete state object to .isdlc/state.json in the test directory.
 * @param {object} state - The full state object to write
 */
function writeState(state) {
    if (!testDir) {
        throw new Error('writeState called before setupTestEnv');
    }
    fs.writeFileSync(
        path.join(testDir, '.isdlc', 'state.json'),
        JSON.stringify(state, null, 2)
    );
}

/**
 * Reads and parses .isdlc/state.json from the test directory.
 * @returns {object} The parsed state object
 */
function readState() {
    if (!testDir) {
        throw new Error('readState called before setupTestEnv');
    }
    return JSON.parse(
        fs.readFileSync(path.join(testDir, '.isdlc', 'state.json'), 'utf8')
    );
}

// ---------------------------------------------------------------------------
// writeConfig
// ---------------------------------------------------------------------------

/**
 * Writes a file to .claude/hooks/config/{filename} in the test directory.
 * If content is an object, it will be JSON-stringified with 2-space indentation.
 *
 * @param {string} filename - The config file name (e.g. 'skills-manifest.json')
 * @param {string|object} content - File content (string or auto-stringified object)
 */
function writeConfig(filename, content) {
    if (!testDir) {
        throw new Error('writeConfig called before setupTestEnv');
    }
    const data = typeof content === 'object' ? JSON.stringify(content, null, 2) : content;
    fs.writeFileSync(
        path.join(testDir, '.claude', 'hooks', 'config', filename),
        data
    );
}

// ---------------------------------------------------------------------------
// writeProviders
// ---------------------------------------------------------------------------

/**
 * Writes providers.yaml to .isdlc/ in the test directory.
 * @param {string} yamlContent - Raw YAML string
 */
function writeProviders(yamlContent) {
    if (!testDir) {
        throw new Error('writeProviders called before setupTestEnv');
    }
    fs.writeFileSync(
        path.join(testDir, '.isdlc', 'providers.yaml'),
        yamlContent
    );
}

// ---------------------------------------------------------------------------
// writeIterationRequirements
// ---------------------------------------------------------------------------

/**
 * Writes iteration-requirements.json to .claude/hooks/config/ in the test directory.
 * This is a convenience wrapper around writeConfig for the common case.
 *
 * @param {object} config - The iteration requirements configuration object
 */
function writeIterationRequirements(config) {
    writeConfig('iteration-requirements.json', config);
}

// ---------------------------------------------------------------------------
// prepareHook
// ---------------------------------------------------------------------------

/** Source hooks directory (resolved relative to this file) */
const HOOKS_SRC_DIR = path.resolve(__dirname, '..');

/**
 * Copies a hook and its lib/ dependencies to the test directory.
 *
 * Source hooks are now .cjs files natively, so no extension renaming or
 * require-path patching is needed — files are copied as-is.
 *
 * @param {string} hookPath - Absolute path to the original hook .cjs file
 * @returns {string} Absolute path to the prepared .cjs hook in the test dir
 */
function prepareHook(hookPath) {
    if (!testDir) {
        throw new Error('prepareHook called before setupTestEnv');
    }

    const hookBasename = path.basename(hookPath);
    const hookDest = path.join(testDir, hookBasename);

    // Ensure lib/ directory exists in test dir
    const libDir = path.join(testDir, 'lib');
    if (!fs.existsSync(libDir)) {
        fs.mkdirSync(libDir, { recursive: true });
    }

    // Copy lib files if not already done
    const libFiles = ['common.cjs', 'provider-utils.cjs', 'three-verb-utils.cjs', 'toon-encoder.cjs'];
    for (const libFile of libFiles) {
        const src = path.join(HOOKS_SRC_DIR, 'lib', libFile);
        const dest = path.join(libDir, libFile);
        if (fs.existsSync(src) && !fs.existsSync(dest)) {
            fs.copyFileSync(src, dest);
        }
    }

    // Copy hook file directly
    fs.copyFileSync(hookPath, hookDest);

    return hookDest;
}

// ---------------------------------------------------------------------------
// runHook
// ---------------------------------------------------------------------------

/** Default timeout for hook execution (10 seconds) */
const HOOK_TIMEOUT_MS = 10000;

/**
 * Spawns a hook script as a child process, pipes JSON input to stdin,
 * and returns the captured stdout, stderr, and exit code.
 *
 * @param {string} hookPath - Absolute path to the hook .js file
 * @param {object} input - JSON object to pipe to the hook's stdin
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
function runHook(hookPath, input) {
    return new Promise((resolve, reject) => {
        const child = spawn('node', [hookPath], {
            env: { ...process.env, CLAUDE_PROJECT_DIR: testDir },
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';
        let settled = false;

        // Timeout guard to prevent hanging tests
        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                child.kill('SIGKILL');
                reject(new Error(
                    `Hook timed out after ${HOOK_TIMEOUT_MS}ms: ${hookPath}`
                ));
            }
        }, HOOK_TIMEOUT_MS);

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve({
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    code
                });
            }
        });

        child.on('error', (err) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                reject(err);
            }
        });

        // Write JSON input to the hook's stdin
        child.stdin.write(JSON.stringify(input));
        child.stdin.end();
    });
}

// ---------------------------------------------------------------------------
// prepareDispatcher
// ---------------------------------------------------------------------------

/** Source dispatchers directory (resolved relative to this file) */
const DISPATCHERS_SRC_DIR = path.resolve(__dirname, '..', 'dispatchers');

/**
 * Copies a dispatcher and ALL hook .cjs files + lib/ dependencies to the test
 * directory. Dispatchers require hooks via `../hookname.cjs` so all hooks must
 * be present one level above the dispatchers/ subdirectory in the test env.
 *
 * @param {string} dispatcherFilename - The dispatcher filename (e.g. 'pre-task-dispatcher.cjs')
 * @returns {string} Absolute path to the prepared dispatcher in the test dir
 */
function prepareDispatcher(dispatcherFilename) {
    if (!testDir) {
        throw new Error('prepareDispatcher called before setupTestEnv');
    }

    // Create dispatchers/ dir in test env
    const dispatchersDir = path.join(testDir, 'dispatchers');
    if (!fs.existsSync(dispatchersDir)) {
        fs.mkdirSync(dispatchersDir, { recursive: true });
    }

    // Copy the dispatcher file
    const dispatcherSrc = path.join(DISPATCHERS_SRC_DIR, dispatcherFilename);
    const dispatcherDest = path.join(dispatchersDir, dispatcherFilename);
    fs.copyFileSync(dispatcherSrc, dispatcherDest);

    // Ensure lib/ directory exists in test dir
    const libDir = path.join(testDir, 'lib');
    if (!fs.existsSync(libDir)) {
        fs.mkdirSync(libDir, { recursive: true });
    }

    // Copy lib files
    const libFiles = ['common.cjs', 'provider-utils.cjs', 'three-verb-utils.cjs', 'toon-encoder.cjs'];
    for (const libFile of libFiles) {
        const src = path.join(HOOKS_SRC_DIR, 'lib', libFile);
        const dest = path.join(libDir, libFile);
        if (fs.existsSync(src) && !fs.existsSync(dest)) {
            fs.copyFileSync(src, dest);
        }
    }

    // Copy ALL hook .cjs files to test dir root (dispatchers require them via ../)
    const hookFiles = fs.readdirSync(HOOKS_SRC_DIR).filter(f =>
        f.endsWith('.cjs') && !f.startsWith('.')
    );
    for (const hookFile of hookFiles) {
        const src = path.join(HOOKS_SRC_DIR, hookFile);
        const dest = path.join(testDir, hookFile);
        if (!fs.existsSync(dest)) {
            fs.copyFileSync(src, dest);
        }
    }

    // REQ-GH-231: Copy config files from canonical src/isdlc/config/
    const configDir = path.join(testDir, '.claude', 'hooks', 'config');
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }
    const canonConfigDir = path.resolve(__dirname, '..', '..', '..', 'isdlc', 'config');
    const hooksConfigDir2 = path.resolve(__dirname, '..', 'config');
    const configFiles = ['skills-manifest.json', 'iteration-requirements.json', 'workflows.json'];
    for (const filename of configFiles) {
        const canonSrc = path.join(canonConfigDir, filename);
        const legacySrc = path.join(hooksConfigDir2, filename);
        const src = fs.existsSync(canonSrc) ? canonSrc : legacySrc;
        const dest = path.join(configDir, filename);
        if (fs.existsSync(src) && !fs.existsSync(dest)) {
            fs.copyFileSync(src, dest);
        }
    }

    return dispatcherDest;
}

/**
 * Runs a dispatcher as a child process, same interface as runHook.
 * @param {string} dispatcherPath - Absolute path to the dispatcher .cjs file
 * @param {object} input - JSON object to pipe to stdin
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
function runDispatcher(dispatcherPath, input) {
    return runHook(dispatcherPath, input);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
    setupTestEnv,
    cleanupTestEnv,
    getTestDir,
    writeState,
    readState,
    writeConfig,
    writeProviders,
    writeIterationRequirements,
    prepareHook,
    prepareDispatcher,
    runHook,
    runDispatcher,
    deepMerge
};

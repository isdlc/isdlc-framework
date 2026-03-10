/**
 * iSDLC User-Space Hooks Engine
 * ==============================
 * Discover, configure, execute, and log user-space hooks from .isdlc/hooks/
 *
 * Exit Code Protocol:
 *   0 = pass (continue normally)
 *   1 = warning (show output, continue)
 *   2 = block (report for retry, then escalate)
 *   3+ = warning (unknown codes are non-fatal)
 *  -1 = internal (timeout or crash)
 *
 * Version: 1.0.0
 * REQ-0055: User-Space Hooks
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// ---------------------------------------------------------------------------
// Phase Alias Map (FR-005)
// ---------------------------------------------------------------------------

/**
 * Maps friendly phase names to internal phase identifiers.
 * Exported for testing, not part of public API.
 */
const PHASE_ALIASES = {
    'quick-scan':       '00-quick-scan',
    'requirements':     '01-requirements',
    'impact-analysis':  '02-impact-analysis',
    'architecture':     '03-architecture',
    'design':           '04-design',
    'test-strategy':    '05-test-strategy',
    'implementation':   '06-implementation',
    'testing':          '07-testing',
    'code-review':      '08-code-review',
    'local-testing':    '11-local-testing',
    'upgrade-plan':     '15-upgrade-plan',
    'upgrade-execute':  '15-upgrade-execute',
    'quality-loop':     '16-quality-loop',
    'tracing':          '02-tracing'
};

/** Hook points that bypass phase alias resolution */
const NON_PHASE_HOOK_POINTS = ['pre-workflow', 'post-workflow', 'pre-gate'];

// ---------------------------------------------------------------------------
// Lightweight YAML Parser (FR-012)
// ---------------------------------------------------------------------------

/**
 * Minimal YAML parser for hook.yaml files. Handles flat key-value pairs
 * and a single level of nested objects (triggers block). No dependency needed.
 *
 * @param {string} raw - Raw YAML content
 * @returns {object|null} Parsed object or null on parse failure
 */
function parseYaml(raw) {
    try {
        const result = {};
        const lines = raw.split('\n');
        let currentObj = null;
        let currentKey = null;

        for (const line of lines) {
            // Skip comments and empty lines
            if (/^\s*#/.test(line) || /^\s*$/.test(line)) continue;

            // Nested key (indented, part of a mapping)
            const nestedMatch = line.match(/^(\s{2,})([a-z0-9_-]+)\s*:\s*(.*)$/);
            if (nestedMatch && currentKey) {
                if (!currentObj) currentObj = {};
                const val = nestedMatch[3].trim();
                currentObj[nestedMatch[2]] = parseYamlValue(val);
                continue;
            }

            // Top-level key
            const topMatch = line.match(/^([a-z0-9_-]+)\s*:\s*(.*)$/);
            if (topMatch) {
                // Save previous nested block
                if (currentKey && currentObj !== null) {
                    result[currentKey] = currentObj;
                    currentObj = null;
                }
                const key = topMatch[1];
                const val = topMatch[2].trim();
                if (val === '' || val === '|' || val === '>') {
                    // Start of a nested block
                    currentKey = key;
                    currentObj = {};
                } else {
                    currentKey = null;
                    currentObj = null;
                    result[key] = parseYamlValue(val);
                }
            }
        }
        // Save last nested block
        if (currentKey && currentObj !== null) {
            result[currentKey] = currentObj;
        }
        return result;
    } catch (e) {
        return null;
    }
}

/**
 * Parse a YAML scalar value into a JS type.
 * @param {string} val - Raw string value
 * @returns {*} Parsed value
 */
function parseYamlValue(val) {
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (val === 'null' || val === '~' || val === '') return null;
    if (/^-?\d+$/.test(val)) return parseInt(val, 10);
    if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);
    // Handle inline arrays: [item1, item2]
    if (val.startsWith('[') && val.endsWith(']')) {
        return val.slice(1, -1).split(',').map(s => parseYamlValue(s.trim())).filter(v => v !== null && v !== '');
    }
    // Strip quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        return val.slice(1, -1);
    }
    return val;
}

// ---------------------------------------------------------------------------
// Config Parsing (FR-012)
// ---------------------------------------------------------------------------

/**
 * Parse a hook.yaml file into a HookConfig object.
 *
 * @param {string} hookDir - Absolute path to hook subdirectory
 * @returns {HookConfig|null} Parsed config or null if hook.yaml missing/invalid
 *
 * @typedef {Object} HookConfig
 * @property {string} name - Hook name (subdirectory name)
 * @property {string} description - Human-readable description
 * @property {string} entryPoint - Script filename (default: 'hook.sh')
 * @property {string} dir - Absolute path to hook subdirectory
 * @property {Object<string, boolean>} triggers - Checklist of trigger points
 * @property {number} timeoutMs - Timeout in milliseconds (default: 60000)
 * @property {number} retryLimit - Max retries before escalation (default: 3)
 * @property {'minor'|'major'|'critical'} severity - Fix scope hint for agent
 * @property {string[]} outputs - Files the hook produces
 */
function parseHookConfig(hookDir) {
    const yamlPath = path.join(hookDir, 'hook.yaml');
    if (!fs.existsSync(yamlPath)) return null;

    let raw;
    try {
        raw = fs.readFileSync(yamlPath, 'utf8');
    } catch (e) {
        return null;
    }

    const config = parseYaml(raw);
    if (!config) return null;

    return {
        name: config.name || path.basename(hookDir),
        description: config.description || '',
        entryPoint: config.entry_point || 'hook.sh',
        dir: hookDir,
        triggers: config.triggers || {},
        timeoutMs: config.timeout_ms || 60000,
        retryLimit: config.retry_limit != null ? config.retry_limit : 3,
        severity: config.severity || 'minor',
        outputs: config.outputs || []
    };
}

// ---------------------------------------------------------------------------
// Hook Discovery (FR-001)
// ---------------------------------------------------------------------------

/**
 * Scan .isdlc/hooks/ for configured hook subdirectories.
 *
 * @param {string} projectRoot - Absolute path to project root
 * @returns {HookConfig[]} List of parsed hook configurations, sorted alphabetically
 */
function scanHooks(projectRoot) {
    const hooksDir = path.join(projectRoot, '.isdlc', 'hooks');
    if (!fs.existsSync(hooksDir)) return [];

    let entries;
    try {
        entries = fs.readdirSync(hooksDir, { withFileTypes: true });
    } catch (e) {
        return [];
    }

    const hooks = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const hookDir = path.join(hooksDir, entry.name);
        const config = parseHookConfig(hookDir);
        if (config) hooks.push(config);
    }

    // Sort alphabetically by subdirectory name for deterministic execution order
    hooks.sort((a, b) => path.basename(a.dir).localeCompare(path.basename(b.dir)));
    return hooks;
}

// ---------------------------------------------------------------------------
// Phase Alias Resolution (FR-005)
// ---------------------------------------------------------------------------

/**
 * Resolve a hook point name through the phase alias map.
 *
 * For non-phase hook points (pre-workflow, post-workflow, pre-gate): returns as-is.
 * For phase-based hook points: resolves friendly names to internal identifiers.
 *
 * @param {string} hookPoint - e.g., 'post-implementation', 'pre-gate'
 * @returns {string|null} Resolved hook point or null if unrecognized
 */
function resolveHookPoint(hookPoint) {
    if (!hookPoint) return null;

    // Non-phase hook points bypass resolution
    if (NON_PHASE_HOOK_POINTS.includes(hookPoint)) return hookPoint;

    // Extract prefix (pre-/post-) and phase portion
    const prefixMatch = hookPoint.match(/^(pre|post)-(.+)$/);
    if (!prefixMatch) return null;

    const prefix = prefixMatch[1];
    const phasePortion = prefixMatch[2];

    // Check if phase portion is already an internal identifier (e.g., '06-implementation')
    const internalValues = Object.values(PHASE_ALIASES);
    if (internalValues.includes(phasePortion)) {
        return `${prefix}-${phasePortion}`;
    }

    // Check if phase portion matches a friendly alias
    if (PHASE_ALIASES[phasePortion]) {
        return `${prefix}-${PHASE_ALIASES[phasePortion]}`;
    }

    // Unrecognized phase name
    return null;
}

// ---------------------------------------------------------------------------
// Trigger Matching (FR-001, FR-005)
// ---------------------------------------------------------------------------

/**
 * Filter scanned hooks to those matching the given trigger point.
 *
 * @param {string} hookPoint - e.g., 'pre-gate', 'post-implementation'
 * @param {HookConfig[]} hooks - List from scanHooks()
 * @returns {HookConfig[]} Hooks that have this trigger enabled
 */
function discoverHooksForTrigger(hookPoint, hooks) {
    const resolved = resolveHookPoint(hookPoint);
    if (!resolved) return [];

    return hooks.filter(hook => {
        const triggers = hook.triggers || {};
        // Check both the original hookPoint and the resolved form
        if (triggers[hookPoint] === true) return true;
        if (resolved !== hookPoint && triggers[resolved] === true) return true;
        // Also check the friendly form when the trigger uses internal names
        // e.g., trigger key 'post-06-implementation' matches hookPoint 'post-implementation'
        if (triggers[resolved] === true) return true;
        return false;
    });
}

// ---------------------------------------------------------------------------
// Context Building (FR-008)
// ---------------------------------------------------------------------------

/**
 * Build a HookContext from the current state.json content.
 *
 * @param {object} state - Parsed state.json content with active_workflow field
 * @returns {HookContext}
 *
 * @typedef {Object} HookContext
 * @property {string} phase - Current phase identifier
 * @property {string} workflowType - Workflow type
 * @property {string} slug - Workflow slug
 * @property {string} projectRoot - Absolute path to project root
 * @property {string} artifactFolder - Artifact folder path (relative, or empty string)
 * @property {string} hookPoint - The hook point being executed (set by executeHooks)
 */
function buildContext(state) {
    const aw = state && state.active_workflow ? state.active_workflow : {};
    let projectRoot = '';
    try {
        const common = require('./common.cjs');
        projectRoot = common.getProjectRoot();
    } catch (e) {
        // Fallback: use CLAUDE_PROJECT_DIR or cwd
        projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    }

    return {
        phase: aw.current_phase || '',
        workflowType: aw.type || '',
        slug: aw.slug || '',
        projectRoot,
        artifactFolder: aw.artifact_folder || '',
        hookPoint: ''
    };
}

// ---------------------------------------------------------------------------
// Hook Execution (FR-002, FR-003)
// ---------------------------------------------------------------------------

/**
 * Execute a single hook script and return the result.
 *
 * @param {HookConfig} hookConfig - Hook configuration
 * @param {HookContext} context - Workflow context for environment variable injection
 * @returns {HookEntry}
 *
 * @typedef {Object} HookEntry
 * @property {string} name - Hook subdirectory name
 * @property {number} exitCode - Process exit code
 * @property {string} stdout - Captured stdout
 * @property {string} stderr - Captured stderr
 * @property {number} durationMs - Execution duration
 * @property {'pass'|'warning'|'block'|'timeout'|'error'} status - Interpreted status
 * @property {'minor'|'major'|'critical'} severity - From hook.yaml
 */
function executeOneHook(hookConfig, context) {
    const timeoutMs = hookConfig.timeoutMs || 60000;
    const scriptPath = path.join(hookConfig.dir, hookConfig.entryPoint);
    const env = {
        ...process.env,
        ISDLC_PHASE: context.phase || '',
        ISDLC_WORKFLOW_TYPE: context.workflowType || '',
        ISDLC_SLUG: context.slug || '',
        ISDLC_PROJECT_ROOT: context.projectRoot || '',
        ISDLC_ARTIFACT_FOLDER: context.artifactFolder || '',
        ISDLC_HOOK_POINT: context.hookPoint || ''
    };

    try {
        const start = Date.now();
        const result = spawnSync('sh', [scriptPath], {
            cwd: context.projectRoot || process.cwd(),
            env,
            timeout: timeoutMs,
            maxBuffer: 1024 * 1024,  // 1MB stdout/stderr limit
            stdio: ['pipe', 'pipe', 'pipe']
        });
        const durationMs = Date.now() - start;

        if (result.error && result.error.code === 'ETIMEDOUT') {
            return {
                name: hookConfig.name,
                exitCode: -1,
                stdout: '',
                stderr: 'Hook timed out',
                durationMs,
                status: 'timeout',
                severity: hookConfig.severity
            };
        }

        if (result.error) {
            return {
                name: hookConfig.name,
                exitCode: -1,
                stdout: '',
                stderr: result.error.message || 'Hook execution error',
                durationMs,
                status: 'error',
                severity: hookConfig.severity
            };
        }

        const exitCode = result.status != null ? result.status : -1;
        let status;
        if (exitCode === 0) status = 'pass';
        else if (exitCode === 2) status = 'block';
        else if (exitCode === -1) status = 'error';
        else status = 'warning';

        return {
            name: hookConfig.name,
            exitCode,
            stdout: (result.stdout || '').toString().trim(),
            stderr: (result.stderr || '').toString().trim(),
            durationMs,
            status,
            severity: hookConfig.severity
        };
    } catch (err) {
        return {
            name: hookConfig.name,
            exitCode: -1,
            stdout: '',
            stderr: err.message,
            durationMs: 0,
            status: 'error',
            severity: hookConfig.severity
        };
    }
}

// ---------------------------------------------------------------------------
// Execution Logging (FR-011)
// ---------------------------------------------------------------------------

/**
 * Write execution log for a hook run.
 *
 * @param {HookConfig} hookConfig - Hook configuration
 * @param {HookEntry} entry - Execution result
 * @param {string} hookPoint - The hook point that triggered execution
 */
function writeHookLog(hookConfig, entry, hookPoint) {
    try {
        const logsDir = path.join(hookConfig.dir, 'logs');
        if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const logFile = path.join(logsDir, `${timestamp}.log`);
        const logContent = [
            `Hook: ${entry.name}`,
            `Timestamp: ${new Date().toISOString()}`,
            `Hook Point: ${hookPoint || 'unknown'}`,
            `Exit Code: ${entry.exitCode}`,
            `Status: ${entry.status}`,
            `Duration: ${entry.durationMs}ms`,
            `--- stdout ---`,
            entry.stdout || '(empty)',
            `--- stderr ---`,
            entry.stderr || '(empty)'
        ].join('\n');

        fs.writeFileSync(logFile, logContent, 'utf8');
    } catch (e) {
        // Logging failure is non-fatal -- fail silently
    }
}

// ---------------------------------------------------------------------------
// Main Entry Point (FR-001, FR-002, FR-003, FR-004)
// ---------------------------------------------------------------------------

/**
 * Execute all hooks configured for the given hook point.
 *
 * @param {string} hookPoint - Hook point identifier (e.g., 'pre-gate', 'post-implementation')
 * @param {HookContext} context - Workflow context for environment variable injection
 * @returns {HookResult} Aggregated execution results. Never throws.
 *
 * @typedef {Object} HookResult
 * @property {string} hookPoint - Resolved hook point name
 * @property {HookEntry[]} hooks - Results per hook
 * @property {boolean} blocked - True if any hook exited with code 2
 * @property {HookEntry[]} warnings - Hooks that exited with code 1 or 3+
 * @property {HookEntry|null} blockingHook - First hook that blocked (if any)
 */
function executeHooks(hookPoint, context) {
    const emptyResult = {
        hookPoint: hookPoint || '',
        hooks: [],
        blocked: false,
        warnings: [],
        blockingHook: null
    };

    try {
        const projectRoot = context.projectRoot || process.cwd();

        // Set hookPoint in context for env var injection
        const ctx = { ...context, hookPoint: hookPoint || '' };

        // Discover hooks
        const allHooks = scanHooks(projectRoot);
        if (allHooks.length === 0) return emptyResult;

        // Filter to matching triggers
        const matching = discoverHooksForTrigger(hookPoint, allHooks);
        if (matching.length === 0) return emptyResult;

        // Execute sequentially
        const results = [];
        let blocked = false;
        let blockingHook = null;
        const warnings = [];

        for (const hook of matching) {
            const entry = executeOneHook(hook, ctx);
            results.push(entry);

            // Write execution log
            writeHookLog(hook, entry, hookPoint);

            if (entry.status === 'block' && !blocked) {
                blocked = true;
                blockingHook = entry;
            }

            if (entry.status === 'warning' || entry.status === 'timeout' || entry.status === 'error') {
                warnings.push(entry);
            }

            // Stop on first block (don't run remaining hooks)
            if (blocked) break;
        }

        return {
            hookPoint: hookPoint || '',
            hooks: results,
            blocked,
            warnings,
            blockingHook
        };
    } catch (e) {
        // Never throw -- return empty result
        return emptyResult;
    }
}

// ---------------------------------------------------------------------------
// Misconfiguration Detection (FR-014)
// ---------------------------------------------------------------------------

/**
 * Check for misconfigured hooks and return warnings.
 *
 * @param {string} projectRoot - Absolute path to project root
 * @returns {HookWarning[]} List of misconfiguration warnings
 *
 * @typedef {Object} HookWarning
 * @property {string} hookName - Subdirectory name
 * @property {string} issue - Description of the misconfiguration
 * @property {string} suggestion - Actionable suggestion
 */
function validateHookConfigs(projectRoot) {
    const warnings = [];
    const hooksDir = path.join(projectRoot, '.isdlc', 'hooks');
    if (!fs.existsSync(hooksDir)) return warnings;

    let entries;
    try {
        entries = fs.readdirSync(hooksDir, { withFileTypes: true });
    } catch (e) {
        return warnings;
    }

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const hookName = entry.name;
        const hookDir = path.join(hooksDir, hookName);
        const yamlPath = path.join(hookDir, 'hook.yaml');

        // Check 1: Missing hook.yaml
        if (!fs.existsSync(yamlPath)) {
            warnings.push({
                hookName,
                issue: 'Missing hook.yaml configuration file',
                suggestion: `Copy hook-template.yaml to .isdlc/hooks/${hookName}/hook.yaml and configure triggers`
            });
            continue;
        }

        // Parse config
        const config = parseHookConfig(hookDir);
        if (!config) {
            warnings.push({
                hookName,
                issue: 'Invalid hook.yaml (could not parse YAML)',
                suggestion: `Check .isdlc/hooks/${hookName}/hook.yaml for YAML syntax errors`
            });
            continue;
        }

        // Check 2: No triggers set to true
        const triggers = config.triggers || {};
        const hasActiveTrigger = Object.values(triggers).some(v => v === true);
        if (!hasActiveTrigger) {
            warnings.push({
                hookName,
                issue: 'No triggers set to true -- hook will never fire',
                suggestion: `Edit .isdlc/hooks/${hookName}/hook.yaml and set at least one trigger to true`
            });
        }

        // Check 3: Triggers set but entry point missing
        if (hasActiveTrigger) {
            const scriptPath = path.join(hookDir, config.entryPoint);
            if (!fs.existsSync(scriptPath)) {
                warnings.push({
                    hookName,
                    issue: `Entry point script '${config.entryPoint}' not found`,
                    suggestion: `Create .isdlc/hooks/${hookName}/${config.entryPoint} or update entry_point in hook.yaml`
                });
            }
        }
    }

    return warnings;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
    executeHooks,
    scanHooks,
    discoverHooksForTrigger,
    buildContext,
    validateHookConfigs,
    // Internal -- exported for testing
    parseHookConfig,
    parseYaml,
    resolveHookPoint,
    executeOneHook,
    writeHookLog,
    PHASE_ALIASES,
    NON_PHASE_HOOK_POINTS
};

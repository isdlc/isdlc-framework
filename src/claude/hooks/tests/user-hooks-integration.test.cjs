'use strict';

/**
 * Integration Tests: user-hooks.cjs
 * ==================================
 * Real child process execution, real file I/O, multi-hook sequencing,
 * timeout enforcement, log file creation, environment variable passing.
 * Uses temp directory isolation per Article XIII.
 *
 * REQ-0055: User-Space Hooks
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

let testDir;

function setup() {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'isdlc-user-hooks-int-'));
    const libSrc = path.join(__dirname, '..', 'lib');
    const libDst = path.join(testDir, 'lib');
    fs.mkdirSync(libDst, { recursive: true });
    fs.copyFileSync(path.join(libSrc, 'user-hooks.cjs'), path.join(libDst, 'user-hooks.cjs'));
    fs.copyFileSync(path.join(libSrc, 'common.cjs'), path.join(libDst, 'common.cjs'));
    process.env.CLAUDE_PROJECT_DIR = testDir;
}

function cleanup() {
    if (testDir) {
        fs.rmSync(testDir, { recursive: true, force: true });
        testDir = null;
    }
    delete process.env.CLAUDE_PROJECT_DIR;
}

function loadModule() {
    const modPath = path.join(testDir, 'lib', 'user-hooks.cjs');
    delete require.cache[modPath];
    const commonPath = path.join(testDir, 'lib', 'common.cjs');
    delete require.cache[commonPath];
    return require(modPath);
}

function createHook(name, yamlContent, scriptContent) {
    const hookDir = path.join(testDir, '.isdlc', 'hooks', name);
    fs.mkdirSync(hookDir, { recursive: true });
    fs.writeFileSync(path.join(hookDir, 'hook.yaml'), yamlContent, 'utf8');
    if (scriptContent !== undefined) {
        fs.writeFileSync(path.join(hookDir, 'hook.sh'), scriptContent, 'utf8');
        fs.chmodSync(path.join(hookDir, 'hook.sh'), 0o755);
    }
}

function makeCtx(overrides) {
    return {
        phase: '06-implementation',
        workflowType: 'feature',
        slug: 'REQ-0055-test',
        projectRoot: testDir,
        artifactFolder: 'docs/requirements/REQ-0055-test',
        hookPoint: '',
        ...overrides
    };
}

// ---------------------------------------------------------------------------
// FR-001/FR-002: Hook Discovery + Execution (Integration)
// ---------------------------------------------------------------------------

describe('Integration: Hook Discovery and Execution', () => {
    beforeEach(setup);
    afterEach(cleanup);

    it('TC-009: executeHooks discovers and runs hooks matching trigger at a real hook point', () => {
        createHook('real-hook', 'name: real-hook\ndescription: Real\ntriggers:\n  pre-gate: true\n',
            '#!/bin/sh\necho "hook executed"\nexit 0\n');
        const mod = loadModule();
        const result = mod.executeHooks('pre-gate', makeCtx());
        assert.equal(result.hooks.length, 1);
        assert.equal(result.hooks[0].status, 'pass');
        assert.equal(result.hooks[0].stdout, 'hook executed');
    });

    it('TC-010: executeHooks returns empty result when .isdlc/hooks/ is absent', () => {
        const mod = loadModule();
        const result = mod.executeHooks('pre-gate', makeCtx());
        assert.equal(result.hooks.length, 0);
        assert.equal(result.blocked, false);
    });

    it('TC-011: executeOneHook runs a hook script and captures stdout in HookEntry', () => {
        createHook('stdout-hook', 'name: stdout-hook\ndescription: Stdout\ntriggers:\n  pre-gate: true\n',
            '#!/bin/sh\necho "line 1"\necho "line 2"\nexit 0\n');
        const mod = loadModule();
        const hookConfig = mod.scanHooks(testDir)[0];
        const entry = mod.executeOneHook(hookConfig, makeCtx({ hookPoint: 'pre-gate' }));
        assert.equal(entry.status, 'pass');
        assert.ok(entry.stdout.includes('line 1'));
        assert.ok(entry.stdout.includes('line 2'));
    });

    it('TC-012: executeOneHook captures stderr separately from stdout', () => {
        createHook('stderr-hook', 'name: stderr-hook\ndescription: Stderr\ntriggers:\n  pre-gate: true\n',
            '#!/bin/sh\necho "out" >&1\necho "err" >&2\nexit 0\n');
        const mod = loadModule();
        const hookConfig = mod.scanHooks(testDir)[0];
        const entry = mod.executeOneHook(hookConfig, makeCtx({ hookPoint: 'pre-gate' }));
        assert.equal(entry.stdout, 'out');
        assert.equal(entry.stderr, 'err');
    });

    it('TC-014: executeOneHook returns error status when hook script does not exist', () => {
        createHook('missing-script', 'name: missing-script\ndescription: Missing\nentry_point: nonexistent.sh\ntriggers:\n  pre-gate: true\n');
        const mod = loadModule();
        const hookConfig = mod.scanHooks(testDir)[0];
        const entry = mod.executeOneHook(hookConfig, makeCtx({ hookPoint: 'pre-gate' }));
        // Script not found — sh will error
        assert.ok(entry.exitCode !== 0);
    });

    it('TC-017: executeOneHook sets cwd to projectRoot for hook execution', () => {
        createHook('cwd-hook', 'name: cwd-hook\ndescription: CWD\ntriggers:\n  pre-gate: true\n',
            '#!/bin/sh\npwd\nexit 0\n');
        const mod = loadModule();
        const hookConfig = mod.scanHooks(testDir)[0];
        const ctx = makeCtx({ hookPoint: 'pre-gate' });
        const entry = mod.executeOneHook(hookConfig, ctx);
        // pwd output should match the testDir (project root)
        assert.ok(entry.stdout.includes(path.basename(testDir)));
    });

    it('TC-019: executeOneHook records durationMs accurately (within tolerance)', () => {
        createHook('duration-hook', 'name: duration-hook\ndescription: Duration\ntriggers:\n  pre-gate: true\n',
            '#!/bin/sh\nsleep 0.1\nexit 0\n');
        const mod = loadModule();
        const hookConfig = mod.scanHooks(testDir)[0];
        const entry = mod.executeOneHook(hookConfig, makeCtx({ hookPoint: 'pre-gate' }));
        assert.equal(typeof entry.durationMs, 'number');
        assert.ok(entry.durationMs >= 50, `Expected >=50ms, got ${entry.durationMs}ms`);
        assert.ok(entry.durationMs < 5000, `Expected <5000ms, got ${entry.durationMs}ms`);
    });
});

// ---------------------------------------------------------------------------
// FR-002: Multi-Hook Sequential Execution
// ---------------------------------------------------------------------------

describe('Integration: Multi-Hook Sequencing', () => {
    beforeEach(setup);
    afterEach(cleanup);

    it('TC-020: executeHooks runs multiple hooks sequentially (not in parallel)', () => {
        // Create three hooks; each writes a timestamp to a shared file
        createHook('01-first', 'name: 01-first\ndescription: First\ntriggers:\n  pre-gate: true\n',
            '#!/bin/sh\necho "first" >> "$ISDLC_PROJECT_ROOT/.isdlc/order.txt"\nexit 0\n');
        createHook('02-second', 'name: 02-second\ndescription: Second\ntriggers:\n  pre-gate: true\n',
            '#!/bin/sh\necho "second" >> "$ISDLC_PROJECT_ROOT/.isdlc/order.txt"\nexit 0\n');
        createHook('03-third', 'name: 03-third\ndescription: Third\ntriggers:\n  pre-gate: true\n',
            '#!/bin/sh\necho "third" >> "$ISDLC_PROJECT_ROOT/.isdlc/order.txt"\nexit 0\n');
        fs.mkdirSync(path.join(testDir, '.isdlc'), { recursive: true });
        const mod = loadModule();
        const result = mod.executeHooks('pre-gate', makeCtx());
        assert.equal(result.hooks.length, 3);
        const order = fs.readFileSync(path.join(testDir, '.isdlc', 'order.txt'), 'utf8').trim().split('\n');
        assert.deepEqual(order, ['first', 'second', 'third']);
    });

    it('TC-029: Real hook script exiting with code 2 produces blocked result', () => {
        createHook('blocker', 'name: blocker\ndescription: Blocker\ntriggers:\n  pre-gate: true\n',
            '#!/bin/sh\necho "BLOCK: Lint failed"\nexit 2\n');
        const mod = loadModule();
        const result = mod.executeHooks('pre-gate', makeCtx());
        assert.equal(result.blocked, true);
        assert.equal(result.blockingHook.name, 'blocker');
        assert.ok(result.blockingHook.stdout.includes('BLOCK: Lint failed'));
    });

    it('Blocking hook stops execution of subsequent hooks', () => {
        createHook('01-blocker', 'name: 01-blocker\ndescription: Blocks\ntriggers:\n  pre-gate: true\n',
            '#!/bin/sh\nexit 2\n');
        createHook('02-after', 'name: 02-after\ndescription: After\ntriggers:\n  pre-gate: true\n',
            '#!/bin/sh\necho "should not run"\nexit 0\n');
        const mod = loadModule();
        const result = mod.executeHooks('pre-gate', makeCtx());
        assert.equal(result.blocked, true);
        // Only 1 hook should have run (stopped on block)
        assert.equal(result.hooks.length, 1);
        assert.equal(result.hooks[0].name, '01-blocker');
    });
});

// ---------------------------------------------------------------------------
// FR-005: Phase Alias Resolution (Integration)
// ---------------------------------------------------------------------------

describe('Integration: Phase Alias Resolution', () => {
    beforeEach(setup);
    afterEach(cleanup);

    it('TC-045: Hook with trigger key post-implementation fires when called with post-implementation', () => {
        createHook('alias-hook', 'name: alias-hook\ndescription: Alias\ntriggers:\n  post-implementation: true\n',
            '#!/bin/sh\necho "alias fired"\nexit 0\n');
        const mod = loadModule();
        const result = mod.executeHooks('post-implementation', makeCtx());
        assert.equal(result.hooks.length, 1);
        assert.equal(result.hooks[0].stdout, 'alias fired');
    });

    it('TC-046: Hook with trigger key post-06-implementation fires when called with post-implementation', () => {
        createHook('internal-hook', 'name: internal-hook\ndescription: Internal\ntriggers:\n  post-06-implementation: true\n',
            '#!/bin/sh\necho "internal fired"\nexit 0\n');
        const mod = loadModule();
        const result = mod.executeHooks('post-implementation', makeCtx());
        assert.equal(result.hooks.length, 1);
        assert.equal(result.hooks[0].stdout, 'internal fired');
    });
});

// ---------------------------------------------------------------------------
// FR-007: Timeout Enforcement (Integration)
// ---------------------------------------------------------------------------

describe('Integration: Timeout Enforcement', () => {
    beforeEach(setup);
    afterEach(cleanup);

    it('TC-013/TC-055: Hook exceeding timeout_ms is killed and returns timeout status', () => {
        createHook('slow-hook', 'name: slow-hook\ndescription: Slow\ntimeout_ms: 500\ntriggers:\n  pre-gate: true\n',
            '#!/bin/sh\nsleep 10\nexit 0\n');
        const mod = loadModule();
        const hookConfig = mod.scanHooks(testDir)[0];
        const entry = mod.executeOneHook(hookConfig, makeCtx({ hookPoint: 'pre-gate' }));
        assert.equal(entry.status, 'timeout');
        assert.equal(entry.exitCode, -1);
    });

    it('TC-056: Hook with timeout_ms: 1000 completes if faster than timeout', () => {
        createHook('fast-hook', 'name: fast-hook\ndescription: Fast\ntimeout_ms: 5000\ntriggers:\n  pre-gate: true\n',
            '#!/bin/sh\necho "fast"\nexit 0\n');
        const mod = loadModule();
        const hookConfig = mod.scanHooks(testDir)[0];
        const entry = mod.executeOneHook(hookConfig, makeCtx({ hookPoint: 'pre-gate' }));
        assert.equal(entry.status, 'pass');
        assert.equal(entry.stdout, 'fast');
    });
});

// ---------------------------------------------------------------------------
// FR-008: Environment Variable Passing (Integration)
// ---------------------------------------------------------------------------

describe('Integration: Environment Variable Passing', () => {
    beforeEach(setup);
    afterEach(cleanup);

    it('TC-062: Hook script receives all ISDLC_ environment variables', () => {
        createHook('env-hook', 'name: env-hook\ndescription: Env\ntriggers:\n  pre-gate: true\n',
            '#!/bin/sh\necho "PHASE=$ISDLC_PHASE"\necho "TYPE=$ISDLC_WORKFLOW_TYPE"\necho "SLUG=$ISDLC_SLUG"\necho "ROOT=$ISDLC_PROJECT_ROOT"\necho "FOLDER=$ISDLC_ARTIFACT_FOLDER"\nexit 0\n');
        const mod = loadModule();
        const ctx = makeCtx({ hookPoint: 'pre-gate' });
        const result = mod.executeHooks('pre-gate', ctx);
        const out = result.hooks[0].stdout;
        assert.ok(out.includes('PHASE=06-implementation'), `Missing PHASE, got: ${out}`);
        assert.ok(out.includes('TYPE=feature'), `Missing TYPE, got: ${out}`);
        assert.ok(out.includes('SLUG=REQ-0055-test'), `Missing SLUG, got: ${out}`);
        assert.ok(out.includes(`ROOT=${testDir}`), `Missing ROOT, got: ${out}`);
        assert.ok(out.includes('FOLDER=docs/requirements/REQ-0055-test'), `Missing FOLDER, got: ${out}`);
    });

    it('TC-064: Hook script receives ISDLC_HOOK_POINT in environment', () => {
        createHook('hp-hook', 'name: hp-hook\ndescription: HP\ntriggers:\n  pre-gate: true\n',
            '#!/bin/sh\necho "HP=$ISDLC_HOOK_POINT"\nexit 0\n');
        const mod = loadModule();
        const result = mod.executeHooks('pre-gate', makeCtx());
        assert.ok(result.hooks[0].stdout.includes('HP=pre-gate'));
    });
});

// ---------------------------------------------------------------------------
// FR-011: Log File Creation (Integration)
// ---------------------------------------------------------------------------

describe('Integration: Log File Creation', () => {
    beforeEach(setup);
    afterEach(cleanup);

    it('TC-073: executeHooks creates log file in {hook-dir}/logs/', () => {
        createHook('log-hook', 'name: log-hook\ndescription: Log\ntriggers:\n  pre-gate: true\n',
            '#!/bin/sh\necho "logged output"\nexit 0\n');
        const mod = loadModule();
        mod.executeHooks('pre-gate', makeCtx());
        const logsDir = path.join(testDir, '.isdlc', 'hooks', 'log-hook', 'logs');
        assert.ok(fs.existsSync(logsDir), 'logs/ directory should exist');
        const files = fs.readdirSync(logsDir);
        assert.equal(files.length, 1);
        const content = fs.readFileSync(path.join(logsDir, files[0]), 'utf8');
        assert.ok(content.includes('logged output'));
        assert.ok(content.includes('Exit Code: 0'));
        assert.ok(content.includes('Hook Point: pre-gate'));
    });

    it('Multiple hook executions create separate log files', () => {
        createHook('multi-log', 'name: multi-log\ndescription: Multi\ntriggers:\n  pre-gate: true\n  pre-workflow: true\n',
            '#!/bin/sh\necho "run"\nexit 0\n');
        const mod = loadModule();
        mod.executeHooks('pre-gate', makeCtx());
        mod.executeHooks('pre-workflow', makeCtx());
        const logsDir = path.join(testDir, '.isdlc', 'hooks', 'multi-log', 'logs');
        const files = fs.readdirSync(logsDir);
        assert.equal(files.length, 2);
    });
});

// ---------------------------------------------------------------------------
// FR-012: YAML Parsing (Integration)
// ---------------------------------------------------------------------------

describe('Integration: YAML Parsing', () => {
    beforeEach(setup);
    afterEach(cleanup);

    it('parseYaml handles quoted string values', () => {
        const mod = loadModule();
        const result = mod.parseYaml('name: "my hook"\ndescription: \'quoted desc\'\n');
        assert.equal(result.name, 'my hook');
        assert.equal(result.description, 'quoted desc');
    });

    it('parseYaml handles inline array values', () => {
        const mod = loadModule();
        const result = mod.parseYaml('name: test\noutputs: [report.txt, summary.md]\n');
        assert.ok(Array.isArray(result.outputs));
        assert.equal(result.outputs.length, 2);
        assert.equal(result.outputs[0], 'report.txt');
    });

    it('parseYaml handles mixed nested block with true/false values', () => {
        const yaml = [
            'name: mixed',
            'triggers:',
            '  pre-gate: true',
            '  post-gate: false',
            '  pre-workflow: true'
        ].join('\n');
        const mod = loadModule();
        const result = mod.parseYaml(yaml);
        assert.equal(result.triggers['pre-gate'], true);
        assert.equal(result.triggers['post-gate'], false);
        assert.equal(result.triggers['pre-workflow'], true);
    });

    it('parseYaml skips comment lines', () => {
        const yaml = '# This is a comment\nname: test\n# Another comment\ndescription: desc\n';
        const mod = loadModule();
        const result = mod.parseYaml(yaml);
        assert.equal(result.name, 'test');
        assert.equal(result.description, 'desc');
    });
});

// ---------------------------------------------------------------------------
// FR-014: Misconfiguration Detection (Integration)
// ---------------------------------------------------------------------------

describe('Integration: Misconfiguration Detection', () => {
    beforeEach(setup);
    afterEach(cleanup);

    it('validateHookConfigs detects all misconfiguration types in one scan', () => {
        // Missing hook.yaml
        fs.mkdirSync(path.join(testDir, '.isdlc', 'hooks', 'no-yaml'), { recursive: true });
        // No triggers enabled
        createHook('no-triggers', 'name: no-triggers\ndescription: None\ntriggers:\n  pre-gate: false\n');
        // Missing script
        createHook('no-script', 'name: no-script\ndescription: No script\ntriggers:\n  pre-gate: true\n');
        // Properly configured (no warning)
        createHook('good-hook', 'name: good-hook\ndescription: Good\ntriggers:\n  pre-gate: true\n', '#!/bin/sh\nexit 0\n');

        const mod = loadModule();
        const warnings = mod.validateHookConfigs(testDir);
        // Should have exactly 3 warnings: missing yaml, no triggers, missing script
        assert.equal(warnings.length, 3);
        const issues = warnings.map(w => w.issue);
        assert.ok(issues.some(i => i.includes('Missing hook.yaml')));
        assert.ok(issues.some(i => i.includes('No triggers')));
        assert.ok(issues.some(i => i.includes('not found')));
    });
});

// ---------------------------------------------------------------------------
// E2E: Full Lifecycle
// ---------------------------------------------------------------------------

describe('E2E: Full Hook Lifecycle', () => {
    beforeEach(setup);
    afterEach(cleanup);

    it('TC-037: Full pre-workflow -> pre-gate -> post-phase -> post-workflow lifecycle', () => {
        // Create a hook that fires at multiple points and tracks invocations
        const trackScript = [
            '#!/bin/sh',
            'echo "$ISDLC_HOOK_POINT" >> "$ISDLC_PROJECT_ROOT/.isdlc/lifecycle.txt"',
            'exit 0'
        ].join('\n');

        createHook('lifecycle', [
            'name: lifecycle',
            'description: Lifecycle tracker',
            'triggers:',
            '  pre-workflow: true',
            '  pre-gate: true',
            '  post-implementation: true',
            '  post-workflow: true'
        ].join('\n'), trackScript);

        fs.mkdirSync(path.join(testDir, '.isdlc'), { recursive: true });
        const mod = loadModule();
        const ctx = makeCtx();

        // Simulate lifecycle
        mod.executeHooks('pre-workflow', ctx);
        mod.executeHooks('pre-gate', ctx);
        mod.executeHooks('post-implementation', ctx);
        mod.executeHooks('post-workflow', ctx);

        const invocations = fs.readFileSync(path.join(testDir, '.isdlc', 'lifecycle.txt'), 'utf8').trim().split('\n');
        assert.equal(invocations.length, 4);
        assert.equal(invocations[0], 'pre-workflow');
        assert.equal(invocations[1], 'pre-gate');
        assert.equal(invocations[2], 'post-implementation');
        assert.equal(invocations[3], 'post-workflow');
    });

    it('Warning hooks continue execution while block hooks stop it', () => {
        createHook('01-warn', 'name: 01-warn\ndescription: Warn\nseverity: minor\ntriggers:\n  pre-gate: true\n',
            '#!/bin/sh\necho "warning"\nexit 1\n');
        createHook('02-pass', 'name: 02-pass\ndescription: Pass\ntriggers:\n  pre-gate: true\n',
            '#!/bin/sh\necho "passed"\nexit 0\n');
        const mod = loadModule();
        const result = mod.executeHooks('pre-gate', makeCtx());
        // Both hooks should run (warning doesn't block)
        assert.equal(result.hooks.length, 2);
        assert.equal(result.blocked, false);
        assert.equal(result.warnings.length, 1);
        assert.equal(result.warnings[0].name, '01-warn');
    });
});

/**
 * TDD Tests: BUG 0.3 -- Null safety gap in checkVersionLock
 *            BUG 0.2 -- PHASE_STATUS_ORDINAL verification (already fixed)
 *
 * Tests that checkVersionLock() adds explicit null/type guards after
 * JSON.parse() and produces debug log messages instead of silently
 * catching TypeError via fail-open.
 *
 * TDD RED: Tests TC-03a, TC-03b, TC-03c, TC-03d, TC-03f FAIL against
 * current code because there is no type guard after JSON.parse().
 * For null input: TypeError is thrown and caught silently.
 * For primitive input: property access returns undefined (no TypeError)
 * but no explicit guard log is emitted.
 *
 * Tests TC-02a, TC-03e PASS (GREEN) -- verification and happy path.
 *
 * Traces to: AC-02a, AC-03a through AC-03g, NFR-01, NFR-02, NFR-03
 * File under test: src/claude/hooks/state-write-validator.cjs
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'state-write-validator.cjs');

// Also import check() directly for unit tests that do not need stderr inspection
const { check } = require('../state-write-validator.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupTestEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swv-null-safety-'));
    const isdlcDir = path.join(tmpDir, '.isdlc');
    fs.mkdirSync(isdlcDir, { recursive: true });
    return tmpDir;
}

function writeStateFile(tmpDir, content) {
    const statePath = path.join(tmpDir, '.isdlc', 'state.json');
    // content can be a string (raw JSON) or an object (will be stringified)
    const raw = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    fs.writeFileSync(statePath, raw);
    return statePath;
}

function cleanup(tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
}

/**
 * Run the hook via subprocess to capture stderr.
 * This is needed because checkVersionLock() uses debugLog() which writes to stderr.
 */
function runHook(tmpDir, stdinJson) {
    const stdinStr = typeof stdinJson === 'string'
        ? stdinJson
        : JSON.stringify(stdinJson);
    const result = spawnSync('node', [HOOK_PATH], {
        input: stdinStr,
        cwd: tmpDir,
        env: {
            ...process.env,
            CLAUDE_PROJECT_DIR: tmpDir,
            SKILL_VALIDATOR_DEBUG: 'true',
            PATH: process.env.PATH,
            HOME: process.env.HOME
        },
        encoding: 'utf8',
        timeout: 5000
    });
    return {
        stdout: (result.stdout || '').trim(),
        stderr: (result.stderr || '').trim(),
        exitCode: result.status || 0
    };
}

/**
 * Build a Write stdin input with custom content for state.json.
 * @param {string} filePath - Path to the state.json file
 * @param {string} content - Raw JSON string to use as tool_input.content
 */
function makeWriteStdinWithContent(filePath, content) {
    return {
        tool_name: 'Write',
        tool_input: {
            file_path: filePath,
            content: content
        }
    };
}

/**
 * Build a ctx object for direct check() calls.
 */
function buildCtx(input) {
    return {
        input: input,
        state: {},
        manifest: {},
        requirements: {},
        workflows: {}
    };
}

// ---------------------------------------------------------------------------
// Bug 0.2: PHASE_STATUS_ORDINAL verification (already fixed)
// ---------------------------------------------------------------------------

describe('BUG 0.2: PHASE_STATUS_ORDINAL verification', () => {

    // TC-02a: Verify constant is defined correctly
    // GREEN: Already fixed, this is verification only
    it('TC-02a [P1]: PHASE_STATUS_ORDINAL is defined with correct values (AC-02a)', () => {
        // Read the source file and check for the constant definition
        const sourceContent = fs.readFileSync(
            path.join(__dirname, '..', 'state-write-validator.cjs'),
            'utf8'
        );

        // Verify the constant is defined
        assert.ok(
            sourceContent.includes('const PHASE_STATUS_ORDINAL'),
            'PHASE_STATUS_ORDINAL should be defined in state-write-validator.cjs'
        );

        // Verify correct mapping values
        assert.ok(
            sourceContent.includes("'pending': 0"),
            'PHASE_STATUS_ORDINAL should map pending to 0'
        );
        assert.ok(
            sourceContent.includes("'in_progress': 1"),
            'PHASE_STATUS_ORDINAL should map in_progress to 1'
        );
        assert.ok(
            sourceContent.includes("'completed': 2"),
            'PHASE_STATUS_ORDINAL should map completed to 2'
        );
    });
});

// ---------------------------------------------------------------------------
// Bug 0.3: Null safety in checkVersionLock
// ---------------------------------------------------------------------------

describe('BUG 0.3: checkVersionLock null safety', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = setupTestEnv();
    });

    afterEach(() => {
        cleanup(tmpDir);
    });

    // TC-03a: null JSON content produces explicit guard, not TypeError
    // TDD RED: Current code throws TypeError at line 128 (null.state_version),
    // caught by outer try/catch, logged as "version check error"
    it('TC-03a [P0]: null JSON content triggers explicit guard with debug log (AC-03a, AC-03b)', () => {
        // Write a valid state file on disk so the hook proceeds to V7
        const statePath = writeStateFile(tmpDir, { state_version: 5, phases: {} });

        // Send a Write with content "null" (valid JSON that parses to null)
        const stdin = makeWriteStdinWithContent(statePath, 'null');
        const result = runHook(tmpDir, stdin);

        // After fix: stderr should contain the explicit guard message
        // "not an object" (or similar), NOT "version check error"
        assert.ok(
            result.stderr.includes('not an object'),
            'After fix, null input should trigger explicit guard log "not an object". ' +
            'BUG 0.3: current code throws TypeError caught as "version check error". ' +
            `Got stderr: ${result.stderr}`
        );
    });

    // TC-03b: numeric JSON content produces explicit guard
    // TDD RED: Current code does not emit "not an object" for numbers.
    // JSON.parse("42") returns 42. (42).state_version is undefined,
    // so it falls through to backward-compat check at line 131.
    // After fix, the type guard should catch this BEFORE property access.
    it('TC-03b [P0]: numeric JSON content triggers explicit guard (AC-03a, AC-03c)', () => {
        const statePath = writeStateFile(tmpDir, { state_version: 5, phases: {} });

        const stdin = makeWriteStdinWithContent(statePath, '42');
        const result = runHook(tmpDir, stdin);

        // After fix: type guard triggers before property access
        assert.ok(
            result.stderr.includes('not an object'),
            'After fix, numeric input should trigger explicit guard log "not an object". ' +
            'BUG 0.3: current code silently accesses .state_version on a number. ' +
            `Got stderr: ${result.stderr}`
        );
    });

    // TC-03c: boolean JSON content produces explicit guard
    // TDD RED: Same as TC-03b -- (true).state_version is undefined, no guard log
    it('TC-03c [P1]: boolean JSON content triggers explicit guard (AC-03c)', () => {
        const statePath = writeStateFile(tmpDir, { state_version: 5, phases: {} });

        const stdin = makeWriteStdinWithContent(statePath, 'true');
        const result = runHook(tmpDir, stdin);

        assert.ok(
            result.stderr.includes('not an object'),
            'After fix, boolean input should trigger explicit guard log "not an object". ' +
            `Got stderr: ${result.stderr}`
        );
    });

    // TC-03d: string JSON content produces explicit guard
    // TDD RED: "hello".state_version is undefined, no guard log
    it('TC-03d [P1]: string JSON content triggers explicit guard (AC-03c)', () => {
        const statePath = writeStateFile(tmpDir, { state_version: 5, phases: {} });

        const stdin = makeWriteStdinWithContent(statePath, '"hello"');
        const result = runHook(tmpDir, stdin);

        assert.ok(
            result.stderr.includes('not an object'),
            'After fix, string JSON input should trigger explicit guard log "not an object". ' +
            `Got stderr: ${result.stderr}`
        );
    });

    // TC-03e: Valid object content proceeds normally (regression)
    // GREEN: This test verifies the happy path is unchanged
    it('TC-03e [P0]: valid object content proceeds normally without guard log (AC-03d, AC-03e)', () => {
        // Write disk state with version 5
        const statePath = writeStateFile(tmpDir, { state_version: 5, phases: {} });

        // Send a Write with valid object content and matching version
        const stdin = makeWriteStdinWithContent(
            statePath,
            JSON.stringify({ state_version: 5, phases: {} })
        );
        const result = runHook(tmpDir, stdin);

        // Should NOT contain "not an object" -- it IS a valid object
        assert.ok(
            !result.stderr.includes('not an object'),
            'Valid object content should NOT trigger the null/type guard. ' +
            `Got stderr: ${result.stderr}`
        );

        // Should allow the write (no block)
        if (result.stdout) {
            const output = JSON.parse(result.stdout);
            assert.notEqual(
                output.decision,
                'block',
                'Valid object content with matching version should not be blocked'
            );
        }
        // If stdout is empty, that means allow (no output = allow)
    });

    // TC-03f: null JSON on disk side produces explicit guard
    // TDD RED: Current code parses disk "null" as null, then null.state_version
    // throws TypeError in inner try/catch at line 144
    it('TC-03f [P0]: null JSON on disk triggers explicit guard (AC-03f)', () => {
        // Write "null" as the disk state file content
        const statePath = path.join(tmpDir, '.isdlc', 'state.json');
        fs.writeFileSync(statePath, 'null');

        // Send a Write with valid object content that has a version
        const stdin = makeWriteStdinWithContent(
            statePath,
            JSON.stringify({ state_version: 5, phases: {} })
        );
        const result = runHook(tmpDir, stdin);

        // After fix: disk-side guard should emit "not an object" log
        assert.ok(
            result.stderr.includes('not an object'),
            'After fix, null disk state should trigger explicit guard log "not an object". ' +
            'BUG 0.3: current code throws TypeError in inner try/catch. ' +
            `Got stderr: ${result.stderr}`
        );
    });

    // TC-03g: Debug messages are descriptive (AC-03g)
    // This is covered by TC-03a through TC-03f -- the assertion checks for
    // "not an object" which is the expected descriptive message.
    // We add an explicit test for the message format.
    it('TC-03g [P1]: debug messages indicate why version check was skipped (AC-03g)', () => {
        const statePath = writeStateFile(tmpDir, { state_version: 5, phases: {} });

        // Use null content to trigger the guard
        const stdin = makeWriteStdinWithContent(statePath, 'null');
        const result = runHook(tmpDir, stdin);

        // After fix: message should be descriptive, mentioning "V7" and "not an object"
        const hasV7 = result.stderr.includes('V7');
        const hasNotObject = result.stderr.includes('not an object');

        assert.ok(
            hasV7 && hasNotObject,
            'Debug message should reference V7 rule and indicate "not an object". ' +
            `Got stderr: ${result.stderr}`
        );
    });
});

// ---------------------------------------------------------------------------
// NFR verification
// ---------------------------------------------------------------------------

describe('NFR verification for BUG-0007', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = setupTestEnv();
    });

    afterEach(() => {
        cleanup(tmpDir);
    });

    // NFR-01: Fail-open on infrastructure error
    it('NFR-01 [P0]: null/primitive inputs fail-open (allow), not fail-closed (block)', () => {
        const statePath = writeStateFile(tmpDir, { state_version: 5, phases: {} });

        // null content should not cause a block
        const stdin = makeWriteStdinWithContent(statePath, 'null');
        const result = runHook(tmpDir, stdin);

        // Should not block -- fail-open
        if (result.stdout) {
            const output = JSON.parse(result.stdout);
            assert.notEqual(
                output.decision,
                'block',
                'Null input should fail-open (allow), not block'
            );
        }
        // Empty stdout = allow
    });

    // NFR-03: CJS-only verification
    it('NFR-03 [P1]: test file uses CJS syntax (require/module.exports)', () => {
        // Read this test file and verify no ESM syntax
        const thisFile = fs.readFileSync(__filename, 'utf8');
        assert.ok(
            !thisFile.includes('import ') || thisFile.indexOf('import ') > thisFile.indexOf('*'),
            'Test file should use CJS require(), not ESM import'
        );
        assert.ok(
            thisFile.includes("require('node:test')"),
            'Test file should use CJS require for node:test'
        );
    });
});

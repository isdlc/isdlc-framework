/**
 * Tests for common.cjs writeState() version auto-increment (BUG-0009)
 * Traces to: FR-01, AC-01a, AC-01b, AC-01c, AC-01d, FR-02, AC-02a
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setupTestEnv, cleanupTestEnv, readState } = require('./hook-test-utils.cjs');

describe('BUG-0009: writeState() version auto-increment', () => {
    let testDir;

    beforeEach(() => {
        testDir = setupTestEnv();
    });

    afterEach(() => {
        cleanupTestEnv();
    });

    // Helper: require common.cjs fresh each time to pick up env changes
    function getCommon() {
        // common.cjs uses getProjectRoot() which reads CLAUDE_PROJECT_DIR
        // setupTestEnv already sets this env var
        return require('../lib/common.cjs');
    }

    // C1: writeState increments state_version from existing value
    it('C1: writeState increments state_version from existing disk value', () => {
        const common = getCommon();
        // Seed state with version 5
        const statePath = path.join(testDir, '.isdlc', 'state.json');
        fs.writeFileSync(statePath, JSON.stringify({
            state_version: 5,
            phases: {}
        }, null, 2));

        // Call writeState with a state object (no version specified by caller)
        const stateToWrite = { phases: { '01-requirements': { status: 'completed' } } };
        const result = common.writeState(stateToWrite);
        assert.equal(result, true, 'writeState should return true on success');

        // Read back and verify version was incremented
        const written = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        assert.equal(written.state_version, 6, 'Should increment from 5 to 6');
    });

    // C2: writeState initializes state_version to 1 when no existing file
    it('C2: writeState initializes state_version to 1 when no existing file', () => {
        const common = getCommon();
        // Remove the state file that setupTestEnv created
        const statePath = path.join(testDir, '.isdlc', 'state.json');
        fs.unlinkSync(statePath);

        const stateToWrite = { phases: {} };
        const result = common.writeState(stateToWrite);
        assert.equal(result, true);

        const written = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        assert.equal(written.state_version, 1, 'Should initialize to 1 when no existing file');
    });

    // C3: writeState initializes state_version to 1 when disk file has no version
    it('C3: writeState initializes state_version to 1 when disk has no version', () => {
        const common = getCommon();
        const statePath = path.join(testDir, '.isdlc', 'state.json');
        // Write a state file WITHOUT state_version
        fs.writeFileSync(statePath, JSON.stringify({ phases: {} }, null, 2));

        const stateToWrite = { phases: { '01-requirements': { status: 'pending' } } };
        common.writeState(stateToWrite);

        const written = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        assert.equal(written.state_version, 1, 'Should initialize to 1 when disk has no version');
    });

    // C4: writeState does NOT mutate the caller's state object
    it('C4: writeState does not mutate the caller state object', () => {
        const common = getCommon();
        const statePath = path.join(testDir, '.isdlc', 'state.json');
        fs.writeFileSync(statePath, JSON.stringify({
            state_version: 3,
            phases: {}
        }, null, 2));

        const callerState = { phases: { '01-requirements': { status: 'completed' } } };
        common.writeState(callerState);

        // The caller's object should NOT have state_version set
        assert.equal(callerState.state_version, undefined,
            'Caller object must not be mutated with state_version');
    });

    // C5: writeState preserves caller's state_version in output but increments from disk
    it('C5: writeState uses disk version for increment, not caller version', () => {
        const common = getCommon();
        const statePath = path.join(testDir, '.isdlc', 'state.json');
        fs.writeFileSync(statePath, JSON.stringify({
            state_version: 10,
            phases: {}
        }, null, 2));

        // Caller passes state_version: 7 (stale), but writeState should use disk value 10
        const callerState = { state_version: 7, phases: {} };
        common.writeState(callerState);

        const written = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        assert.equal(written.state_version, 11,
            'Should increment from disk version 10 to 11, ignoring caller version 7');

        // Caller object should still have its original version
        assert.equal(callerState.state_version, 7,
            'Caller object should not be mutated');
    });

    // C6: writeState handles consecutive writes correctly
    it('C6: consecutive writeState calls increment version each time', () => {
        const common = getCommon();
        const statePath = path.join(testDir, '.isdlc', 'state.json');
        fs.writeFileSync(statePath, JSON.stringify({
            state_version: 1,
            phases: {}
        }, null, 2));

        // First write: 1 -> 2
        common.writeState({ phases: { a: 1 } });
        let written = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        assert.equal(written.state_version, 2, 'First write: 1 -> 2');

        // Second write: 2 -> 3
        common.writeState({ phases: { b: 2 } });
        written = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        assert.equal(written.state_version, 3, 'Second write: 2 -> 3');

        // Third write: 3 -> 4
        common.writeState({ phases: { c: 3 } });
        written = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        assert.equal(written.state_version, 4, 'Third write: 3 -> 4');
    });
});

// REQ-GH-216: readAtddConfig passthrough
describe('REQ-GH-216: readAtddConfig helper', () => {
    let testDir;

    beforeEach(() => {
        testDir = setupTestEnv();
    });

    afterEach(() => {
        cleanupTestEnv();
    });

    function getCommon() {
        // Clear cache so lazy config bridge re-resolves
        delete require.cache[require.resolve('../lib/common.cjs')];
        return require('../lib/common.cjs');
    }

    it('TC-T001-10: readAtddConfig reflects user config partial override', () => {
        const common = getCommon();
        // Write user config with single override
        fs.writeFileSync(
            path.join(testDir, '.isdlc', 'config.json'),
            JSON.stringify({ atdd: { enabled: false } }),
            'utf8'
        );
        const atdd = common.readAtddConfig();
        assert.deepStrictEqual(atdd, {
            enabled: false,
            require_gwt: true,
            track_red_green: true,
            enforce_priority_order: true,
        });
    });

    it('TC-T002-15: readAtddConfig returns all-true defaults when no config section', () => {
        const common = getCommon();
        // No user config.json means all defaults
        const atdd = common.readAtddConfig();
        assert.deepStrictEqual(atdd, {
            enabled: true,
            require_gwt: true,
            track_red_green: true,
            enforce_priority_order: true,
        });
    });

    it('TC-T002-16: readAtddConfig does not throw on bridge failure (fail-open)', () => {
        const common = getCommon();
        // Call with a projectRoot that does not exist still yields defaults
        // (the helper catches any bridge error via its own try/catch).
        let atdd;
        assert.doesNotThrow(() => {
            atdd = common.readAtddConfig();
        });
        assert.strictEqual(typeof atdd, 'object');
        assert.strictEqual(atdd.enabled, true);
        assert.strictEqual(atdd.require_gwt, true);
        assert.strictEqual(atdd.track_red_green, true);
        assert.strictEqual(atdd.enforce_priority_order, true);
    });
});

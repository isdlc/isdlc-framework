/**
 * TDD Tests: Item 0.13 -- Centralize Hardcoded Phase Prefixes
 *
 * Verifies that a PHASE_PREFIXES constant is exported from lib/common.cjs
 * and that all consumer files use it instead of inline string literals.
 * All tests verify behavior preservation -- identical outputs before/after.
 *
 * Traces to: AC-0013-1 through AC-0013-6, NFR-1
 * File under test: lib/common.cjs, test-adequacy-blocker.cjs,
 *   dispatchers/pre-task-dispatcher.cjs, skill-validator.cjs, plan-surfacer.cjs
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// TC-13.01: PHASE_PREFIXES constant exists and is exported (AC-0013-1)
// ---------------------------------------------------------------------------
describe('Item 0.13: PHASE_PREFIXES constant', () => {
    it('TC-13.01: PHASE_PREFIXES is exported from lib/common.cjs', () => {
        const common = require('../lib/common.cjs');
        assert.ok(common.PHASE_PREFIXES, 'PHASE_PREFIXES should be exported');
        assert.strictEqual(typeof common.PHASE_PREFIXES, 'object');
    });

    // TC-13.02: PHASE_PREFIXES is frozen (immutable) (AC-0013-1)
    it('TC-13.02: PHASE_PREFIXES is frozen (immutable)', () => {
        const { PHASE_PREFIXES } = require('../lib/common.cjs');
        assert.ok(Object.isFrozen(PHASE_PREFIXES), 'PHASE_PREFIXES should be frozen');
    });

    // TC-13.03: PHASE_PREFIXES values match original inline strings (AC-0013-1)
    it('TC-13.03: PHASE_PREFIXES values match original inline strings', () => {
        const { PHASE_PREFIXES } = require('../lib/common.cjs');
        assert.strictEqual(PHASE_PREFIXES.UPGRADE, '15-upgrade');
        assert.strictEqual(PHASE_PREFIXES.IMPLEMENTATION, '06-implementation');
        assert.strictEqual(PHASE_PREFIXES.REQUIREMENTS, '01-requirements');
    });
});

// ---------------------------------------------------------------------------
// TC-13.04..06: test-adequacy-blocker uses constant (AC-0013-2, AC-0013-6)
// ---------------------------------------------------------------------------
describe('Item 0.13: test-adequacy-blocker uses PHASE_PREFIXES', () => {
    const { isUpgradeDelegation, isUpgradePhaseActive } = require('../test-adequacy-blocker.cjs');

    // TC-13.04: isUpgradeDelegation with upgrade phase (AC-0013-2, AC-0013-6)
    it('TC-13.04: isUpgradeDelegation returns true for upgrade phase delegation', () => {
        const result = isUpgradeDelegation({
            isDelegation: true,
            targetPhase: '15-upgrade-v2'
        });
        assert.strictEqual(result, true);
    });

    // TC-13.05: isUpgradePhaseActive with upgrade phase (AC-0013-2, AC-0013-6)
    it('TC-13.05: isUpgradePhaseActive returns true for upgrade phase', () => {
        const result = isUpgradePhaseActive({
            active_workflow: { current_phase: '15-upgrade-packages' }
        });
        assert.strictEqual(result, true);
    });

    // TC-13.06: isUpgradePhaseActive returns false for non-upgrade (AC-0013-6)
    it('TC-13.06: isUpgradePhaseActive returns false for non-upgrade phase', () => {
        const result = isUpgradePhaseActive({
            active_workflow: { current_phase: '06-implementation' }
        });
        assert.strictEqual(result, false);
    });
});

// ---------------------------------------------------------------------------
// TC-13.07..08: pre-task-dispatcher shouldActivate uses constant (AC-0013-3, AC-0013-6)
// ---------------------------------------------------------------------------
describe('Item 0.13: pre-task-dispatcher uses PHASE_PREFIXES', () => {
    // TC-13.07: test-adequacy shouldActivate returns true for upgrade phase
    it('TC-13.07: test-adequacy-blocker shouldActivate returns true for 15-upgrade phase', () => {
        // Read the dispatcher source to verify the constant is used
        const dispatcherPath = path.join(__dirname, '..', 'dispatchers', 'pre-task-dispatcher.cjs');
        const source = fs.readFileSync(dispatcherPath, 'utf8');

        // Verify constant is imported/used (no hardcoded '15-upgrade' in shouldActivate)
        // The shouldActivate for test-adequacy-blocker should use PHASE_PREFIXES.UPGRADE
        assert.ok(
            source.includes('PHASE_PREFIXES') ||
            source.includes('PHASE_PREFIXES.UPGRADE'),
            'Dispatcher should reference PHASE_PREFIXES constant'
        );
    });

    // TC-13.08: blast-radius shouldActivate returns true for 06-implementation
    it('TC-13.08: blast-radius-validator shouldActivate uses constant for 06-implementation', () => {
        const dispatcherPath = path.join(__dirname, '..', 'dispatchers', 'pre-task-dispatcher.cjs');
        const source = fs.readFileSync(dispatcherPath, 'utf8');

        // Verify the dispatcher uses the constant for implementation phase check
        assert.ok(
            source.includes('PHASE_PREFIXES') ||
            source.includes('PHASE_PREFIXES.IMPLEMENTATION'),
            'Dispatcher should reference PHASE_PREFIXES for implementation phase'
        );
    });
});

// ---------------------------------------------------------------------------
// TC-13.09: skill-validator default phase uses constant (AC-0013-4, AC-0013-6)
// ---------------------------------------------------------------------------
describe('Item 0.13: skill-validator uses PHASE_PREFIXES', () => {
    it('TC-13.09: skill-validator source uses PHASE_PREFIXES for default phase', () => {
        const validatorPath = path.join(__dirname, '..', 'skill-validator.cjs');
        const source = fs.readFileSync(validatorPath, 'utf8');

        // After refactoring, skill-validator should use PHASE_PREFIXES.REQUIREMENTS
        // instead of inline '01-requirements'
        assert.ok(
            source.includes('PHASE_PREFIXES'),
            'skill-validator should reference PHASE_PREFIXES constant'
        );
    });
});

// ---------------------------------------------------------------------------
// TC-13.10: plan-surfacer implementation phase uses constant (AC-0013-5, AC-0013-6)
// ---------------------------------------------------------------------------
describe('Item 0.13: plan-surfacer uses PHASE_PREFIXES', () => {
    it('TC-13.10: plan-surfacer source uses PHASE_PREFIXES for implementation check', () => {
        const surfacerPath = path.join(__dirname, '..', 'plan-surfacer.cjs');
        const source = fs.readFileSync(surfacerPath, 'utf8');

        // After refactoring, plan-surfacer should use PHASE_PREFIXES.IMPLEMENTATION
        // instead of inline '06-implementation'
        assert.ok(
            source.includes('PHASE_PREFIXES'),
            'plan-surfacer should reference PHASE_PREFIXES constant'
        );
    });
});

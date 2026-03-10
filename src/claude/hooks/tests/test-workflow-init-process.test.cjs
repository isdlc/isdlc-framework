'use strict';

/**
 * iSDLC Workflow Init Process Config - Test Suite (CJS)
 * =====================================================
 * Unit + integration tests for computePhaseArray(), printPhaseList(),
 * and PHASE_LIBRARY in workflow-init.cjs (REQ-0056)
 *
 * Run: node --test src/claude/hooks/tests/test-workflow-init-process.test.cjs
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// workflow-init.cjs now exports internals when require()'d (guarded main)
const {
    computePhaseArray,
    printPhaseList,
    PHASE_LIBRARY,
    WORKFLOW_PHASES
} = require('../../../antigravity/workflow-init.cjs');

// =============================================================================
// PHASE_LIBRARY validation
// =============================================================================

describe('PHASE_LIBRARY (REQ-0056 FR-006)', () => {
    it('T01: contains all 14 known phases', () => {
        assert.strictEqual(PHASE_LIBRARY.length, 14);
    });

    it('T02: includes all default feature phases', () => {
        for (const p of WORKFLOW_PHASES.feature) {
            assert.ok(PHASE_LIBRARY.includes(p), `Missing feature phase: ${p}`);
        }
    });

    it('T03: includes all default fix phases', () => {
        for (const p of WORKFLOW_PHASES.fix) {
            assert.ok(PHASE_LIBRARY.includes(p), `Missing fix phase: ${p}`);
        }
    });

    it('T04: includes all default upgrade phases', () => {
        for (const p of WORKFLOW_PHASES.upgrade) {
            assert.ok(PHASE_LIBRARY.includes(p), `Missing upgrade phase: ${p}`);
        }
    });
});

// =============================================================================
// computePhaseArray — unit tests
// =============================================================================

describe('computePhaseArray (REQ-0056)', () => {
    const FEATURE_DEFAULTS = [...WORKFLOW_PHASES.feature];
    const FIX_DEFAULTS = [...WORKFLOW_PHASES.fix];

    // ---- AC-001-02: null config → defaults unchanged ----

    it('T05: null configPhases returns defaults with all pending', () => {
        const result = computePhaseArray(null, FEATURE_DEFAULTS);
        assert.deepStrictEqual(result.phases, FEATURE_DEFAULTS);
        for (const p of FEATURE_DEFAULTS) {
            assert.strictEqual(result.phaseStatus[p], 'pending');
        }
        assert.deepStrictEqual(result.skippedReasons, {});
    });

    // ---- AC-001-01: Config override applies custom phases ----

    it('T06: config subset marks missing defaults as skipped', () => {
        const config = ['01-requirements', '06-implementation', '08-code-review'];
        const result = computePhaseArray(config, FEATURE_DEFAULTS);

        // All defaults should be in phases array
        assert.strictEqual(result.phases.length, FEATURE_DEFAULTS.length);

        // Active phases
        assert.strictEqual(result.phaseStatus['01-requirements'], 'pending');
        assert.strictEqual(result.phaseStatus['06-implementation'], 'pending');
        assert.strictEqual(result.phaseStatus['08-code-review'], 'pending');

        // Skipped phases
        assert.strictEqual(result.phaseStatus['00-quick-scan'], 'skipped');
        assert.strictEqual(result.phaseStatus['02-impact-analysis'], 'skipped');
        assert.strictEqual(result.phaseStatus['03-architecture'], 'skipped');
        assert.strictEqual(result.phaseStatus['04-design'], 'skipped');
        assert.strictEqual(result.phaseStatus['05-test-strategy'], 'skipped');
        assert.strictEqual(result.phaseStatus['16-quality-loop'], 'skipped');
    });

    // ---- AC-003-01: Skipped phases have status "skipped" with reason ----

    it('T07: skipped phases have reason field', () => {
        const config = ['01-requirements', '06-implementation'];
        const result = computePhaseArray(config, FEATURE_DEFAULTS);

        const skipped = Object.keys(result.skippedReasons);
        assert.ok(skipped.length > 0, 'Should have skipped phases');
        for (const p of skipped) {
            assert.strictEqual(result.skippedReasons[p], 'process.json override');
            assert.strictEqual(result.phaseStatus[p], 'skipped');
        }
    });

    // ---- AC-003-02: All skipped phases have reason field ----

    it('T08: every skipped phase has a corresponding reason', () => {
        const config = ['01-requirements'];
        const result = computePhaseArray(config, FEATURE_DEFAULTS);

        for (const p of result.phases) {
            if (result.phaseStatus[p] === 'skipped') {
                assert.ok(
                    result.skippedReasons[p],
                    `Skipped phase ${p} missing reason`
                );
            }
        }
    });

    it('T09: config exactly matching defaults → all pending, no skipped', () => {
        const result = computePhaseArray([...FEATURE_DEFAULTS], FEATURE_DEFAULTS);
        assert.deepStrictEqual(result.phases, FEATURE_DEFAULTS);
        for (const p of FEATURE_DEFAULTS) {
            assert.strictEqual(result.phaseStatus[p], 'pending');
        }
        assert.deepStrictEqual(result.skippedReasons, {});
    });

    // ---- AC-006-02: Unknown phase warned and ignored ----

    it('T10: all unknown phases → uses defaults', () => {
        const config = ['unknown-phase-1', 'bogus-phase-2'];
        const result = computePhaseArray(config, FEATURE_DEFAULTS);

        // Should fall back to defaults since all are invalid
        assert.deepStrictEqual(result.phases, FEATURE_DEFAULTS);
        for (const p of FEATURE_DEFAULTS) {
            assert.strictEqual(result.phaseStatus[p], 'pending');
        }
    });

    it('T11: mix of valid and unknown phases → only valid used', () => {
        const config = ['01-requirements', 'bogus-phase', '06-implementation'];
        const result = computePhaseArray(config, FEATURE_DEFAULTS);

        // 01-requirements and 06-implementation should be pending
        assert.strictEqual(result.phaseStatus['01-requirements'], 'pending');
        assert.strictEqual(result.phaseStatus['06-implementation'], 'pending');

        // Other defaults should be skipped
        assert.strictEqual(result.phaseStatus['00-quick-scan'], 'skipped');
    });

    // ---- AC-006-01: Add phase not in defaults (recomposition) ----

    it('T12: recomposition — config phase not in defaults is appended', () => {
        const config = ['01-requirements', '06-implementation', '07-testing'];
        const result = computePhaseArray(config, FEATURE_DEFAULTS);

        // 07-testing is not in feature defaults, should be appended
        assert.ok(result.phases.includes('07-testing'), 'Should include recomposed phase');
        assert.strictEqual(result.phaseStatus['07-testing'], 'pending');

        // Should appear after all defaults
        const testingIdx = result.phases.indexOf('07-testing');
        const lastDefaultIdx = result.phases.indexOf(FEATURE_DEFAULTS[FEATURE_DEFAULTS.length - 1]);
        assert.ok(testingIdx > lastDefaultIdx, 'Recomposed phase should be after defaults');
    });

    // ---- AC-002-01: Fix workflow with custom phases ----

    it('T13: fix workflow with custom phases', () => {
        const config = ['01-requirements', '06-implementation', '08-code-review'];
        const result = computePhaseArray(config, FIX_DEFAULTS);

        assert.strictEqual(result.phaseStatus['01-requirements'], 'pending');
        assert.strictEqual(result.phaseStatus['06-implementation'], 'pending');
        assert.strictEqual(result.phaseStatus['08-code-review'], 'pending');
        assert.strictEqual(result.phaseStatus['02-tracing'], 'skipped');
        assert.strictEqual(result.phaseStatus['05-test-strategy'], 'skipped');
        assert.strictEqual(result.phaseStatus['16-quality-loop'], 'skipped');
    });

    // ---- AC-002-02: Feature config doesn't affect fix ----

    it('T14: feature config array applied to fix defaults independently', () => {
        // If someone misconfigures by passing feature phases to fix,
        // phases not in fix defaults get recomposed
        const featureConfig = ['00-quick-scan', '01-requirements', '06-implementation'];
        const result = computePhaseArray(featureConfig, FIX_DEFAULTS);

        // 01-requirements and 06-implementation are in both
        assert.strictEqual(result.phaseStatus['01-requirements'], 'pending');
        assert.strictEqual(result.phaseStatus['06-implementation'], 'pending');

        // 00-quick-scan is NOT in fix defaults, so it's recomposed (appended)
        assert.ok(result.phases.includes('00-quick-scan'));
        assert.strictEqual(result.phaseStatus['00-quick-scan'], 'pending');
    });

    it('T15: empty config array after validation → uses defaults', () => {
        // Config with only invalid phases → empty after validation
        const config = ['invalid-1', 'invalid-2'];
        const result = computePhaseArray(config, FEATURE_DEFAULTS);

        assert.deepStrictEqual(result.phases, FEATURE_DEFAULTS);
        for (const p of FEATURE_DEFAULTS) {
            assert.strictEqual(result.phaseStatus[p], 'pending');
        }
    });

    it('T16: empty array → uses defaults', () => {
        const result = computePhaseArray([], FEATURE_DEFAULTS);

        assert.deepStrictEqual(result.phases, FEATURE_DEFAULTS);
        for (const p of FEATURE_DEFAULTS) {
            assert.strictEqual(result.phaseStatus[p], 'pending');
        }
    });

    it('T17: single-phase config → only that phase active, rest skipped', () => {
        const config = ['06-implementation'];
        const result = computePhaseArray(config, FEATURE_DEFAULTS);

        assert.strictEqual(result.phaseStatus['06-implementation'], 'pending');
        for (const p of FEATURE_DEFAULTS) {
            if (p !== '06-implementation') {
                assert.strictEqual(result.phaseStatus[p], 'skipped', `${p} should be skipped`);
            }
        }
    });

    it('T18: duplicate phases in config are handled gracefully', () => {
        const config = ['01-requirements', '01-requirements', '06-implementation'];
        const result = computePhaseArray(config, FEATURE_DEFAULTS);

        assert.strictEqual(result.phaseStatus['01-requirements'], 'pending');
        assert.strictEqual(result.phaseStatus['06-implementation'], 'pending');
        // No crash, no duplicate phases in output
        const reqCount = result.phases.filter(p => p === '01-requirements').length;
        assert.strictEqual(reqCount, 1, 'Should not duplicate phases');
    });
});

// =============================================================================
// printPhaseList — unit tests
// =============================================================================

describe('printPhaseList (REQ-0056 FR-004)', () => {
    // Capture stderr writes
    let stderrOutput;
    const originalWrite = process.stderr.write;

    function captureStderr() {
        stderrOutput = '';
        process.stderr.write = (chunk) => {
            stderrOutput += chunk;
            return true;
        };
    }

    function restoreStderr() {
        process.stderr.write = originalWrite;
    }

    // ---- AC-004-01: Visual output shows [x] for skipped phases ----

    it('T19: shows [x] for skipped phases with reason', () => {
        const phases = ['01-requirements', '03-architecture', '06-implementation'];
        const phaseStatus = {
            '01-requirements': 'pending',
            '03-architecture': 'skipped',
            '06-implementation': 'pending'
        };
        const skippedReasons = {
            '03-architecture': 'process.json override'
        };

        captureStderr();
        try {
            printPhaseList(phases, phaseStatus, skippedReasons);
        } finally {
            restoreStderr();
        }

        assert.ok(stderrOutput.includes('[x] 03-architecture'), 'Should show [x] for skipped');
        assert.ok(stderrOutput.includes('process.json override'), 'Should show skip reason');
    });

    // ---- AC-004-02: No skipped phases shows all [ ] ----

    it('T20: shows all [ ] when no phases are skipped', () => {
        const phases = ['01-requirements', '06-implementation'];
        const phaseStatus = {
            '01-requirements': 'pending',
            '06-implementation': 'pending'
        };

        captureStderr();
        try {
            printPhaseList(phases, phaseStatus, {});
        } finally {
            restoreStderr();
        }

        assert.ok(stderrOutput.includes('[ ] 01-requirements'), 'Should show [ ] for active');
        assert.ok(stderrOutput.includes('[ ] 06-implementation'), 'Should show [ ] for active');
        assert.ok(!stderrOutput.includes('[x]'), 'Should not have any [x]');
    });

    it('T21: mixed active and skipped phases', () => {
        const phases = ['00-quick-scan', '01-requirements', '03-architecture', '06-implementation'];
        const phaseStatus = {
            '00-quick-scan': 'skipped',
            '01-requirements': 'pending',
            '03-architecture': 'skipped',
            '06-implementation': 'pending'
        };
        const skippedReasons = {
            '00-quick-scan': 'process.json override',
            '03-architecture': 'process.json override'
        };

        captureStderr();
        try {
            printPhaseList(phases, phaseStatus, skippedReasons);
        } finally {
            restoreStderr();
        }

        assert.ok(stderrOutput.includes('[x] 00-quick-scan'), 'quick-scan should be [x]');
        assert.ok(stderrOutput.includes('[ ] 01-requirements'), 'requirements should be [ ]');
        assert.ok(stderrOutput.includes('[x] 03-architecture'), 'architecture should be [x]');
        assert.ok(stderrOutput.includes('[ ] 06-implementation'), 'implementation should be [ ]');
    });

    it('T22: output includes "Phase sequence:" header', () => {
        captureStderr();
        try {
            printPhaseList(['01-requirements'], { '01-requirements': 'pending' }, {});
        } finally {
            restoreStderr();
        }

        assert.ok(stderrOutput.includes('Phase sequence:'), 'Should have header');
    });
});

// =============================================================================
// WORKFLOW_PHASES defaults integrity
// =============================================================================

describe('WORKFLOW_PHASES defaults (REQ-0056)', () => {
    it('T23: feature defaults match expected phases', () => {
        assert.deepStrictEqual(WORKFLOW_PHASES.feature, [
            '00-quick-scan', '01-requirements', '02-impact-analysis',
            '03-architecture', '04-design', '05-test-strategy',
            '06-implementation', '16-quality-loop', '08-code-review'
        ]);
    });

    it('T24: fix defaults match expected phases', () => {
        assert.deepStrictEqual(WORKFLOW_PHASES.fix, [
            '01-requirements', '02-tracing', '05-test-strategy',
            '06-implementation', '16-quality-loop', '08-code-review'
        ]);
    });

    it('T25: upgrade defaults match expected phases', () => {
        assert.deepStrictEqual(WORKFLOW_PHASES.upgrade, [
            '15-upgrade-plan', '15-upgrade-execute', '08-code-review'
        ]);
    });

    it('T26: all 5 workflow types defined', () => {
        const types = Object.keys(WORKFLOW_PHASES);
        assert.ok(types.includes('feature'));
        assert.ok(types.includes('fix'));
        assert.ok(types.includes('upgrade'));
        assert.ok(types.includes('test-run'));
        assert.ok(types.includes('test-generate'));
    });
});

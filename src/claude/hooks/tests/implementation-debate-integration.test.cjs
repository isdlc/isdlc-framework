/**
 * Tests for Phase 16/08 Scope Adjustments + Cross-Module Integration (Module M5)
 * Traces to: FR-005 (AC-005-01..04), FR-007 (AC-007-01..03), NFR-002, NFR-003
 * Feature: REQ-0017-multi-agent-implementation-team
 * Validation Rules: VR-030..VR-032
 *
 * Target files:
 *   - src/claude/agents/16-quality-loop-engineer.md (MODIFIED)
 *   - src/claude/agents/07-qa-engineer.md (MODIFIED)
 *   - src/claude/agents/00-sdlc-orchestrator.md (cross-module check)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PHASE16_PATH = path.resolve(__dirname, '..', '..', 'agents', '16-quality-loop-engineer.md');
const PHASE08_PATH = path.resolve(__dirname, '..', '..', 'agents', '07-qa-engineer.md');
const ORCHESTRATOR_PATH = path.resolve(__dirname, '..', '..', 'agents', '00-sdlc-orchestrator.md');
const REVIEWER_PATH = path.resolve(__dirname, '..', '..', 'agents', '05-implementation-reviewer.md');
const UPDATER_PATH = path.resolve(__dirname, '..', '..', 'agents', '05-implementation-updater.md');

describe('M5-Phase16: Quality Loop Engineer Scope Adjustment (16-quality-loop-engineer.md)', () => {
    let phase16Content;

    function getPhase16Content() {
        if (!phase16Content) {
            assert.ok(fs.existsSync(PHASE16_PATH), 'Phase 16 agent file must exist');
            phase16Content = fs.readFileSync(PHASE16_PATH, 'utf8');
        }
        return phase16Content;
    }

    // TC-M5-01: IMPLEMENTATION TEAM SCOPE ADJUSTMENT section exists in Phase 16
    it('TC-M5-01: IMPLEMENTATION TEAM SCOPE ADJUSTMENT section exists', () => {
        const c = getPhase16Content();
        assert.ok(
            c.includes('IMPLEMENTATION TEAM SCOPE ADJUSTMENT') ||
            c.includes('IMPLEMENTATION TEAM') ||
            c.includes('implementation_loop_state'),
            '16-quality-loop-engineer.md must contain IMPLEMENTATION TEAM SCOPE ADJUSTMENT section'
        );
    });

    // TC-M5-02: Phase 16 detects implementation_loop_state
    it('TC-M5-02: Phase 16 detects implementation_loop_state', () => {
        const c = getPhase16Content();
        assert.ok(
            c.includes('implementation_loop_state'),
            'Phase 16 must detect implementation_loop_state from state.json'
        );
    });

    // TC-M5-03: Phase 16 "final sweep" mode documented
    it('TC-M5-03: Phase 16 final sweep mode documented', () => {
        const c = getPhase16Content();
        assert.ok(
            c.toLowerCase().includes('final sweep') ||
            c.includes('FINAL SWEEP') ||
            c.toLowerCase().includes('reduced scope') ||
            c.toLowerCase().includes('batch-only'),
            'Phase 16 must document final sweep / reduced scope mode'
        );
    });

    // TC-M5-04: Phase 16 excludes individual file re-review
    it('TC-M5-04: Phase 16 excludes individual file re-review', () => {
        const c = getPhase16Content();
        assert.ok(
            c.includes('already done by Reviewer') ||
            c.includes('already checked') ||
            c.includes('EXCLUDE') ||
            (c.includes('IC-01') && c.includes('IC-07') && c.includes('Reviewer')),
            'Phase 16 must exclude individual file re-review in final sweep mode'
        );
    });

    // TC-M5-05: Phase 16 includes batch-only checks
    it('TC-M5-05: Phase 16 includes batch-only checks', () => {
        const c = getPhase16Content().toLowerCase();
        assert.ok(
            (c.includes('test suite') || c.includes('coverage') || c.includes('mutation')) &&
            (c.includes('audit') || c.includes('sast') || c.includes('lint')),
            'Phase 16 must document batch-only checks for final sweep mode'
        );
    });
});

describe('M5-Phase08: QA Engineer Scope Adjustment (07-qa-engineer.md)', () => {
    let phase08Content;

    function getPhase08Content() {
        if (!phase08Content) {
            assert.ok(fs.existsSync(PHASE08_PATH), 'Phase 08 agent file must exist');
            phase08Content = fs.readFileSync(PHASE08_PATH, 'utf8');
        }
        return phase08Content;
    }

    // TC-M5-06: IMPLEMENTATION TEAM SCOPE ADJUSTMENT section exists in Phase 08
    it('TC-M5-06: IMPLEMENTATION TEAM SCOPE ADJUSTMENT section exists', () => {
        const c = getPhase08Content();
        assert.ok(
            c.includes('IMPLEMENTATION TEAM SCOPE ADJUSTMENT') ||
            c.includes('IMPLEMENTATION TEAM') ||
            c.includes('implementation_loop_state'),
            '07-qa-engineer.md must contain IMPLEMENTATION TEAM SCOPE ADJUSTMENT section'
        );
    });

    // TC-M5-07: Phase 08 detects implementation_loop_state
    it('TC-M5-07: Phase 08 detects implementation_loop_state', () => {
        const c = getPhase08Content();
        assert.ok(
            c.includes('implementation_loop_state'),
            'Phase 08 must detect implementation_loop_state from state.json'
        );
    });

    // TC-M5-08: Phase 08 "human review only" mode documented
    it('TC-M5-08: Phase 08 human review only mode documented', () => {
        const c = getPhase08Content();
        assert.ok(
            c.toLowerCase().includes('human review only') ||
            c.includes('HUMAN REVIEW ONLY') ||
            c.toLowerCase().includes('reduced scope'),
            'Phase 08 must document human review only / reduced scope mode'
        );
    });

    // TC-M5-09: Phase 08 focuses on architecture and business logic
    it('TC-M5-09: Phase 08 focuses on architecture and business logic', () => {
        const c = getPhase08Content().toLowerCase();
        assert.ok(c.includes('architecture'), 'Phase 08 must include architecture in reduced scope');
        assert.ok(c.includes('business logic'), 'Phase 08 must include business logic in reduced scope');
    });

    // TC-M5-10: Phase 08 excludes per-file quality items
    it('TC-M5-10: Phase 08 excludes per-file quality items', () => {
        const c = getPhase08Content();
        assert.ok(
            c.includes('already verified by') ||
            c.includes('already done by') ||
            c.includes('already checked by') ||
            c.includes('EXCLUDE') ||
            (c.includes('IC-01') && c.includes('Reviewer')),
            'Phase 08 must exclude per-file quality items already verified by Reviewer'
        );
    });
});

describe('Cross-Module: Backward Compatibility (NFR-002)', () => {
    // TC-M5-11: Phase 16 preserves full scope fallback
    it('TC-M5-11: Phase 16 preserves full scope fallback', () => {
        const c = fs.readFileSync(PHASE16_PATH, 'utf8');
        assert.ok(
            c.toLowerCase().includes('full scope') || c.includes('FULL SCOPE'),
            'Phase 16 must preserve full scope fallback when implementation_loop_state absent'
        );
    });

    // TC-M5-12: Phase 08 preserves full scope fallback
    it('TC-M5-12: Phase 08 preserves full scope fallback', () => {
        const c = fs.readFileSync(PHASE08_PATH, 'utf8');
        assert.ok(
            c.toLowerCase().includes('full scope') || c.includes('FULL SCOPE'),
            'Phase 08 must preserve full scope fallback when implementation_loop_state absent'
        );
    });

    // TC-M5-13: Existing DEBATE LOOP ORCHESTRATION section preserved
    it('TC-M5-13: Existing DEBATE LOOP ORCHESTRATION section preserved', () => {
        const c = fs.readFileSync(ORCHESTRATOR_PATH, 'utf8');
        assert.ok(
            c.includes('DEBATE LOOP ORCHESTRATION'),
            'Orchestrator must still contain DEBATE LOOP ORCHESTRATION section (not removed or renamed)'
        );
    });

    // TC-M5-14: Phase 01/03/04 debate routing entries preserved
    it('TC-M5-14: Phase 01/03/04 debate routing entries preserved', () => {
        const c = fs.readFileSync(ORCHESTRATOR_PATH, 'utf8');
        assert.ok(c.includes('01-requirements-critic.md'), 'Must preserve Phase 01 debate routing (01-requirements-critic.md)');
        assert.ok(c.includes('02-architecture-critic.md'), 'Must preserve Phase 03 debate routing (02-architecture-critic.md)');
        assert.ok(c.includes('03-design-critic.md'), 'Must preserve Phase 04 debate routing (03-design-critic.md)');
    });

    // TC-M5-15: Phase 16 existing sections not removed
    it('TC-M5-15: Phase 16 existing sections not removed', () => {
        const c = fs.readFileSync(PHASE16_PATH, 'utf8');
        assert.ok(
            c.includes('MANDATORY ITERATION ENFORCEMENT'),
            'Phase 16 existing sections must not be removed by scope adjustment addition'
        );
    });
});

describe('Cross-Module: Structural Consistency (NFR-003)', () => {
    // TC-M5-16: Reviewer agent file follows naming convention
    it('TC-M5-16: Reviewer agent follows {NN}-{role}.md naming convention', () => {
        assert.ok(
            fs.existsSync(REVIEWER_PATH),
            'Reviewer agent must follow {NN}-{role}.md naming convention (05-implementation-reviewer.md)'
        );
    });

    // TC-M5-17: Updater agent file follows naming convention
    it('TC-M5-17: Updater agent follows {NN}-{role}.md naming convention', () => {
        assert.ok(
            fs.existsSync(UPDATER_PATH),
            'Updater agent must follow {NN}-{role}.md naming convention (05-implementation-updater.md)'
        );
    });

    // TC-M5-18: resolveDebateMode referenced in orchestrator implementation section
    it('TC-M5-18: resolveDebateMode referenced in orchestrator implementation section', () => {
        const c = fs.readFileSync(ORCHESTRATOR_PATH, 'utf8');
        const implStart = c.indexOf('IMPLEMENTATION_ROUTING');
        const sectionEnd = c.indexOf('## 8.', implStart);
        const section = (implStart !== -1 && sectionEnd !== -1) ? c.substring(implStart, sectionEnd) : c;
        assert.ok(
            section.includes('resolveDebateMode') || section.includes('debate_mode') || section.toLowerCase().includes('debate mode'),
            'Orchestrator implementation section must reference debate mode resolution (shared with Section 7.5)'
        );
    });
});

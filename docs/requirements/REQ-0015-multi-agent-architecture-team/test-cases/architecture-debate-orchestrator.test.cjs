/**
 * Tests for Orchestrator Debate Loop Generalization (Module M1)
 * Traces to: FR-003, FR-005, AC-003-01..AC-003-05, AC-005-01..AC-005-04, AC-007-01..AC-007-03
 * Feature: REQ-0015-multi-agent-architecture-team
 * Validation Rules: M1-V01..M1-V20
 *
 * Target file: src/claude/agents/00-sdlc-orchestrator.md (MODIFIED)
 * Section: 7.5 DEBATE LOOP ORCHESTRATION (Multi-Phase)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ORCHESTRATOR_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'src', 'claude', 'agents', '00-sdlc-orchestrator.md');

describe('M1: Orchestrator Debate Loop Generalization (00-sdlc-orchestrator.md)', () => {
    let content;

    function getContent() {
        if (!content) {
            assert.ok(fs.existsSync(ORCHESTRATOR_PATH), 'Orchestrator agent file must exist');
            content = fs.readFileSync(ORCHESTRATOR_PATH, 'utf8');
        }
        return content;
    }

    // TC-M1-01: Section header is generalized to Multi-Phase [M1-V01] traces: AC-003-05
    it('TC-M1-01: Section header contains "Multi-Phase"', () => {
        const c = getContent();
        assert.ok(
            c.includes('Multi-Phase'),
            'Section 7.5 header must contain "Multi-Phase"'
        );
    });

    // TC-M1-02: Section header does NOT say "Phase 01 Only" [M1-V02] traces: AC-003-05
    it('TC-M1-02: Section header does NOT contain "Phase 01 Only"', () => {
        const c = getContent();
        assert.ok(
            !c.includes('Phase 01 Only'),
            'Section 7.5 header must NOT contain "Phase 01 Only"'
        );
    });

    // TC-M1-03: Routing table contains Phase 01 entry [M1-V03] traces: AC-005-01, AC-005-03
    it('TC-M1-03: Routing table contains Phase 01 entry (01-requirements)', () => {
        const c = getContent();
        assert.ok(
            c.includes('01-requirements'),
            'Routing table must contain 01-requirements phase entry'
        );
    });

    // TC-M1-04: Routing table contains Phase 03 entry [M1-V04] traces: AC-005-02, AC-005-04
    it('TC-M1-04: Routing table contains Phase 03 entry (03-architecture)', () => {
        const c = getContent();
        assert.ok(
            c.includes('03-architecture'),
            'Routing table must contain 03-architecture phase entry'
        );
    });

    // TC-M1-05: Phase 01 creator maps to requirements-analyst [M1-V05] traces: AC-005-01
    it('TC-M1-05: Phase 01 creator maps to 01-requirements-analyst.md', () => {
        const c = getContent();
        assert.ok(
            c.includes('01-requirements-analyst.md'),
            'Routing table must map Phase 01 creator to 01-requirements-analyst.md'
        );
    });

    // TC-M1-06: Phase 01 critic maps to requirements-critic [M1-V06] traces: AC-005-01
    it('TC-M1-06: Phase 01 critic maps to 01-requirements-critic.md', () => {
        const c = getContent();
        assert.ok(
            c.includes('01-requirements-critic.md'),
            'Routing table must map Phase 01 critic to 01-requirements-critic.md'
        );
    });

    // TC-M1-07: Phase 01 refiner maps to requirements-refiner [M1-V07] traces: AC-005-03
    it('TC-M1-07: Phase 01 refiner maps to 01-requirements-refiner.md', () => {
        const c = getContent();
        assert.ok(
            c.includes('01-requirements-refiner.md'),
            'Routing table must map Phase 01 refiner to 01-requirements-refiner.md'
        );
    });

    // TC-M1-08: Phase 03 creator maps to solution-architect [M1-V08] traces: AC-005-02
    it('TC-M1-08: Phase 03 creator maps to 02-solution-architect.md', () => {
        const c = getContent();
        assert.ok(
            c.includes('02-solution-architect.md'),
            'Routing table must map Phase 03 creator to 02-solution-architect.md'
        );
    });

    // TC-M1-09: Phase 03 critic maps to architecture-critic [M1-V09] traces: AC-005-02
    it('TC-M1-09: Phase 03 critic maps to 02-architecture-critic.md', () => {
        const c = getContent();
        assert.ok(
            c.includes('02-architecture-critic.md'),
            'Routing table must map Phase 03 critic to 02-architecture-critic.md'
        );
    });

    // TC-M1-10: Phase 03 refiner maps to architecture-refiner [M1-V10] traces: AC-005-04
    it('TC-M1-10: Phase 03 refiner maps to 02-architecture-refiner.md', () => {
        const c = getContent();
        assert.ok(
            c.includes('02-architecture-refiner.md'),
            'Routing table must map Phase 03 refiner to 02-architecture-refiner.md'
        );
    });

    // TC-M1-11: Flag precedence documents --no-debate [M1-V11] traces: AC-003-01
    it('TC-M1-11: Flag precedence documents --no-debate as highest priority', () => {
        const c = getContent();
        assert.ok(
            c.includes('--no-debate'),
            'Must document --no-debate flag in debate mode resolution'
        );
    });

    // TC-M1-12: Creator-Critic-Refiner loop pattern documented [M1-V12] traces: AC-003-02
    it('TC-M1-12: Creator-Critic-Refiner loop pattern documented', () => {
        const c = getContent();
        // All three roles must appear in the debate loop section
        const debateIdx = c.indexOf('DEBATE LOOP ORCHESTRATION');
        assert.ok(debateIdx !== -1, 'Must have DEBATE LOOP ORCHESTRATION section');
        const debateSection = c.substring(debateIdx);
        assert.ok(debateSection.includes('Creator'), 'Must contain Creator in debate loop');
        assert.ok(debateSection.includes('Critic'), 'Must contain Critic in debate loop');
        assert.ok(debateSection.includes('Refiner'), 'Must contain Refiner in debate loop');
    });

    // TC-M1-13: Convergence condition is zero BLOCKING [M1-V13] traces: AC-003-03
    it('TC-M1-13: Convergence condition references zero BLOCKING', () => {
        const c = getContent();
        const debateIdx = c.indexOf('DEBATE LOOP ORCHESTRATION');
        assert.ok(debateIdx !== -1, 'Must have DEBATE LOOP ORCHESTRATION section');
        const debateSection = c.substring(debateIdx);
        assert.ok(
            debateSection.includes('blocking') && debateSection.includes('0') ||
            debateSection.includes('BLOCKING') && debateSection.includes('== 0'),
            'Must contain convergence condition of zero BLOCKING'
        );
    });

    // TC-M1-14: Max rounds is 3 [M1-V14] traces: AC-003-04
    it('TC-M1-14: Max rounds value is 3', () => {
        const c = getContent();
        const debateIdx = c.indexOf('DEBATE LOOP ORCHESTRATION');
        assert.ok(debateIdx !== -1, 'Must have DEBATE LOOP ORCHESTRATION section');
        const debateSection = c.substring(debateIdx);
        assert.ok(
            debateSection.includes('max_rounds') && debateSection.includes('3'),
            'Must contain max_rounds with value 3'
        );
    });

    // TC-M1-15: Critical artifact check for Phase 03 [M1-V15] traces: AC-007-01
    it('TC-M1-15: architecture-overview.md is critical artifact for Phase 03', () => {
        const c = getContent();
        assert.ok(
            c.includes('architecture-overview.md'),
            'Must reference architecture-overview.md as critical artifact'
        );
    });

    // TC-M1-16: Malformed critique handling [M1-V16] traces: AC-007-02
    it('TC-M1-16: Malformed critique handling documented (fail-open)', () => {
        const c = getContent();
        const debateIdx = c.indexOf('DEBATE LOOP ORCHESTRATION');
        assert.ok(debateIdx !== -1, 'Must have DEBATE LOOP ORCHESTRATION section');
        const debateSection = c.substring(debateIdx);
        assert.ok(
            debateSection.includes('malformed') || debateSection.includes('fail-open') ||
            debateSection.includes('cannot parse'),
            'Must document malformed critique handling (fail-open)'
        );
    });

    // TC-M1-17: Unconverged warning handling [M1-V17] traces: AC-007-03
    it('TC-M1-17: Unconverged warning handling documented', () => {
        const c = getContent();
        const debateIdx = c.indexOf('DEBATE LOOP ORCHESTRATION');
        assert.ok(debateIdx !== -1, 'Must have DEBATE LOOP ORCHESTRATION section');
        const debateSection = c.substring(debateIdx);
        assert.ok(
            debateSection.includes('did not converge') || debateSection.includes('unconverged') ||
            debateSection.includes('UNCONVERGED'),
            'Must document unconverged warning handling'
        );
    });

    // TC-M1-18: Uses routing.creator (not hardcoded) [M1-V18] traces: FR-005
    it('TC-M1-18: Uses routing.creator in Step 3 (not hardcoded agent name)', () => {
        const c = getContent();
        assert.ok(
            c.includes('routing.creator'),
            'Step 3 must use routing.creator reference'
        );
    });

    // TC-M1-19: Uses routing.critic (not hardcoded) [M1-V19] traces: FR-005
    it('TC-M1-19: Uses routing.critic in Step 4a (not hardcoded agent name)', () => {
        const c = getContent();
        assert.ok(
            c.includes('routing.critic'),
            'Step 4a must use routing.critic reference'
        );
    });

    // TC-M1-20: Uses routing.refiner (not hardcoded) [M1-V20] traces: FR-005
    it('TC-M1-20: Uses routing.refiner in Step 4c (not hardcoded agent name)', () => {
        const c = getContent();
        assert.ok(
            c.includes('routing.refiner'),
            'Step 4c must use routing.refiner reference'
        );
    });

    // TC-M1-21: DEBATE_ROUTING table structure present traces: FR-005
    it('TC-M1-21: DEBATE_ROUTING table structure is present', () => {
        const c = getContent();
        assert.ok(
            c.includes('DEBATE_ROUTING'),
            'Must contain DEBATE_ROUTING table'
        );
    });

    // TC-M1-22: debate_state includes phase field traces: FR-003
    it('TC-M1-22: debate_state includes phase field', () => {
        const c = getContent();
        const debateIdx = c.indexOf('DEBATE LOOP ORCHESTRATION');
        assert.ok(debateIdx !== -1, 'Must have DEBATE LOOP ORCHESTRATION section');
        const debateSection = c.substring(debateIdx);
        assert.ok(
            debateSection.includes('"phase"') || debateSection.includes('phase'),
            'debate_state must include phase field'
        );
    });
});

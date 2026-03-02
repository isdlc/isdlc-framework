/**
 * Tests for Architecture Critic Agent (Module M2)
 * Traces to: FR-001, AC-001-01..AC-001-08, NFR-002, NFR-004, AC-006-01, AC-006-03
 * Feature: REQ-0015-multi-agent-architecture-team
 * Validation Rules: M2-V01..M2-V20
 *
 * Target file: src/claude/agents/02-architecture-critic.md (NEW)
 * Template: src/claude/agents/01-requirements-critic.md
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const CRITIC_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'src', 'claude', 'agents', '02-architecture-critic.md');

describe('M2: Architecture Critic Agent (02-architecture-critic.md)', () => {
    let content;

    function getContent() {
        if (!content) {
            assert.ok(fs.existsSync(CRITIC_PATH), 'Architecture critic agent file must exist at ' + CRITIC_PATH);
            content = fs.readFileSync(CRITIC_PATH, 'utf8');
        }
        return content;
    }

    // TC-M2-01: File exists [M2-V01 prerequisite]
    it('TC-M2-01: Architecture critic agent file exists', () => {
        assert.ok(fs.existsSync(CRITIC_PATH), 'Architecture critic agent file must exist');
    });

    // TC-M2-02: Agent name is architecture-critic [M2-V01] traces: NFR-002
    it('TC-M2-02: Agent frontmatter contains name: architecture-critic', () => {
        const c = getContent();
        assert.ok(
            c.includes('name: architecture-critic'),
            'Must contain name: architecture-critic in frontmatter'
        );
    });

    // TC-M2-03: Model is opus [M2-V02] traces: NFR-002
    it('TC-M2-03: Agent frontmatter contains model: opus', () => {
        const c = getContent();
        assert.ok(
            c.includes('model: opus'),
            'Must contain model: opus in frontmatter'
        );
    });

    // TC-M2-04: Agent is debate-only [M2-V03] traces: NFR-002
    it('TC-M2-04: Agent is invoked only by orchestrator during debate mode', () => {
        const c = getContent();
        assert.ok(
            c.includes('ONLY invoked by the orchestrator during debate mode'),
            'Must contain debate-only invocation constraint'
        );
    });

    // TC-M2-05: NFR alignment check (AC-01) [M2-V04] traces: AC-001-01
    it('TC-M2-05: NFR alignment check (AC-01) documented', () => {
        const c = getContent();
        assert.ok(c.includes('AC-01'), 'Must contain AC-01 check ID');
        assert.ok(c.includes('NFR'), 'Must reference NFR alignment');
    });

    // TC-M2-06: STRIDE threat model check (AC-02) [M2-V05] traces: AC-001-02
    it('TC-M2-06: STRIDE threat model check (AC-02) documented', () => {
        const c = getContent();
        assert.ok(c.includes('AC-02'), 'Must contain AC-02 check ID');
        assert.ok(c.includes('STRIDE'), 'Must reference STRIDE threat model');
    });

    // TC-M2-07: Database design check (AC-03) [M2-V06] traces: AC-001-03
    it('TC-M2-07: Database design check (AC-03) documented', () => {
        const c = getContent();
        assert.ok(c.includes('AC-03'), 'Must contain AC-03 check ID');
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('database') || lower.includes('index') || lower.includes('migration'),
            'Must reference database design concerns'
        );
    });

    // TC-M2-08: Tech stack justification check (AC-04) [M2-V07] traces: AC-001-04
    it('TC-M2-08: Tech stack justification check (AC-04) documented', () => {
        const c = getContent();
        assert.ok(c.includes('AC-04'), 'Must contain AC-04 check ID');
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('justification') || lower.includes('evaluation criteria') || lower.includes('alternatives'),
            'Must reference tech stack justification concerns'
        );
    });

    // TC-M2-09: Single points of failure check (AC-05) [M2-V08] traces: AC-001-05
    it('TC-M2-09: Single points of failure check (AC-05) documented', () => {
        const c = getContent();
        assert.ok(c.includes('AC-05'), 'Must contain AC-05 check ID');
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('single point') || lower.includes('spof') || lower.includes('redundancy'),
            'Must reference single points of failure'
        );
    });

    // TC-M2-10: Observability check (AC-06) [M2-V09] traces: AC-001-06
    it('TC-M2-10: Observability check (AC-06) documented', () => {
        const c = getContent();
        assert.ok(c.includes('AC-06'), 'Must contain AC-06 check ID');
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('observability') || lower.includes('monitoring') ||
            lower.includes('logging') || lower.includes('alerting'),
            'Must reference observability concerns'
        );
    });

    // TC-M2-11: Coupling contradictions check (AC-07) [M2-V10] traces: AC-001-07
    it('TC-M2-11: Coupling contradictions check (AC-07) documented', () => {
        const c = getContent();
        assert.ok(c.includes('AC-07'), 'Must contain AC-07 check ID');
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('coupling') || lower.includes('contradiction'),
            'Must reference coupling contradictions'
        );
    });

    // TC-M2-12: Cost implications check (AC-08) [M2-V11] traces: AC-001-08
    it('TC-M2-12: Cost implications check (AC-08) documented', () => {
        const c = getContent();
        assert.ok(c.includes('AC-08'), 'Must contain AC-08 check ID');
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('cost') || lower.includes('pricing'),
            'Must reference cost implications'
        );
    });

    // TC-M2-13: Output file is round-N-critique.md [M2-V12] traces: FR-001, AC-006-01
    it('TC-M2-13: Output file is round-N-critique.md', () => {
        const c = getContent();
        assert.ok(
            c.includes('round-') && c.includes('critique'),
            'Must reference round-N-critique.md output format'
        );
    });

    // TC-M2-14: BLOCKING and WARNING sections in output [M2-V13] traces: FR-001
    it('TC-M2-14: BLOCKING and WARNING sections in output format', () => {
        const c = getContent();
        assert.ok(c.includes('## BLOCKING Findings'), 'Must contain ## BLOCKING Findings section');
        assert.ok(c.includes('## WARNING Findings'), 'Must contain ## WARNING Findings section');
    });

    // TC-M2-15: Summary table with finding counts [M2-V14] traces: FR-001
    it('TC-M2-15: Summary table with finding counts', () => {
        const c = getContent();
        assert.ok(c.includes('Total Findings'), 'Must contain Total Findings in summary');
        assert.ok(c.includes('BLOCKING'), 'Must contain BLOCKING in summary');
        assert.ok(c.includes('WARNING'), 'Must contain WARNING in summary');
    });

    // TC-M2-16: ADR Count metric in summary [M2-V15] traces: AC-006-03
    it('TC-M2-16: ADR Count metric in summary', () => {
        const c = getContent();
        assert.ok(c.includes('ADR Count'), 'Must contain ADR Count metric');
    });

    // TC-M2-17: Threat Coverage metric in summary [M2-V16] traces: AC-006-03
    it('TC-M2-17: Threat Coverage metric in summary', () => {
        const c = getContent();
        assert.ok(c.includes('Threat Coverage'), 'Must contain Threat Coverage metric');
    });

    // TC-M2-18: NFR Alignment Score metric in summary [M2-V17] traces: AC-006-03
    it('TC-M2-18: NFR Alignment Score metric in summary', () => {
        const c = getContent();
        assert.ok(c.includes('NFR Alignment Score'), 'Must contain NFR Alignment Score metric');
    });

    // TC-M2-19: Rule: do not modify input artifacts [M2-V18] traces: FR-001
    it('TC-M2-19: Rule: do not modify input artifacts', () => {
        const c = getContent();
        assert.ok(
            c.includes('do not modify any input artifacts'),
            'Must contain rule about not modifying input artifacts'
        );
    });

    // TC-M2-20: Constitutional articles referenced [M2-V19] traces: NFR-004
    it('TC-M2-20: Constitutional articles referenced for compliance checks', () => {
        const c = getContent();
        assert.ok(
            c.includes('Article III') || c.includes('Article IV') || c.includes('Article V'),
            'Must reference constitutional articles for compliance checks'
        );
    });

    // TC-M2-21: Structural consistency with Phase 01 critic [M2-V20] traces: NFR-002
    it('TC-M2-21: Structural consistency with Phase 01 critic (matching sections)', () => {
        const c = getContent();
        assert.ok(c.includes('## IDENTITY'), 'Must have ## IDENTITY section');
        assert.ok(c.includes('## INPUT'), 'Must have ## INPUT section');
        assert.ok(c.includes('## CRITIQUE PROCESS'), 'Must have ## CRITIQUE PROCESS section');
        assert.ok(c.includes('## OUTPUT FORMAT'), 'Must have ## OUTPUT FORMAT section');
        assert.ok(c.includes('## RULES'), 'Must have ## RULES section');
    });

    // TC-M2-22: File size under 15KB [NFR-001]
    it('TC-M2-22: Agent file size is under 15KB (NFR-001)', () => {
        const stats = fs.statSync(CRITIC_PATH);
        assert.ok(
            stats.size < 15 * 1024,
            `File size ${stats.size} bytes exceeds 15KB limit (${15 * 1024} bytes)`
        );
    });
});

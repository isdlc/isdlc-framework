/**
 * Tests for Architecture Refiner Agent (Module M3)
 * Traces to: FR-002, AC-002-01..AC-002-08, NFR-002
 * Feature: REQ-0015-multi-agent-architecture-team
 * Validation Rules: M3-V01..M3-V16
 *
 * Target file: src/claude/agents/02-architecture-refiner.md (NEW)
 * Template: src/claude/agents/01-requirements-refiner.md
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REFINER_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'src', 'claude', 'agents', '02-architecture-refiner.md');

describe('M3: Architecture Refiner Agent (02-architecture-refiner.md)', () => {
    let content;

    function getContent() {
        if (!content) {
            assert.ok(fs.existsSync(REFINER_PATH), 'Architecture refiner agent file must exist at ' + REFINER_PATH);
            content = fs.readFileSync(REFINER_PATH, 'utf8');
        }
        return content;
    }

    // TC-M3-01: File exists [M3-V01 prerequisite]
    it('TC-M3-01: Architecture refiner agent file exists', () => {
        assert.ok(fs.existsSync(REFINER_PATH), 'Architecture refiner agent file must exist');
    });

    // TC-M3-02: Agent name is architecture-refiner [M3-V01] traces: NFR-002
    it('TC-M3-02: Agent frontmatter contains name: architecture-refiner', () => {
        const c = getContent();
        assert.ok(
            c.includes('name: architecture-refiner'),
            'Must contain name: architecture-refiner in frontmatter'
        );
    });

    // TC-M3-03: Model is opus [M3-V02] traces: NFR-002
    it('TC-M3-03: Agent frontmatter contains model: opus', () => {
        const c = getContent();
        assert.ok(
            c.includes('model: opus'),
            'Must contain model: opus in frontmatter'
        );
    });

    // TC-M3-04: Agent is debate-only [M3-V03] traces: NFR-002
    it('TC-M3-04: Agent is invoked only by orchestrator during debate mode', () => {
        const c = getContent();
        assert.ok(
            c.includes('ONLY invoked by the orchestrator during debate mode'),
            'Must contain debate-only invocation constraint'
        );
    });

    // TC-M3-05: ADR completion fix strategy [M3-V04] traces: AC-002-01
    it('TC-M3-05: ADR completion fix strategy documented', () => {
        const c = getContent();
        assert.ok(
            c.includes('ADR') &&
            (c.includes('trade-off') || c.includes('alternatives considered') || c.includes('complete')),
            'Must document ADR completion strategy with trade-off analysis or alternatives'
        );
    });

    // TC-M3-06: Security hardening fix strategy [M3-V05] traces: AC-002-02
    it('TC-M3-06: Security hardening fix strategy documented', () => {
        const c = getContent();
        assert.ok(
            c.includes('STRIDE') || c.includes('mitigation') ||
            c.includes('encryption') || c.includes('security hardening'),
            'Must document security hardening strategy'
        );
    });

    // TC-M3-07: HA/failover fix strategy [M3-V06] traces: AC-002-03
    it('TC-M3-07: HA/failover fix strategy documented', () => {
        const c = getContent();
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('redundancy') || lower.includes('failover') ||
            lower.includes('graceful degradation') || lower.includes('high-availability'),
            'Must document HA/failover fix strategy'
        );
    });

    // TC-M3-08: Cost optimization fix strategy [M3-V07] traces: AC-002-04
    it('TC-M3-08: Cost optimization fix strategy documented', () => {
        const c = getContent();
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('cost') && lower.includes('optimization'),
            'Must document cost optimization strategy'
        );
    });

    // TC-M3-09: Observability fix strategy [M3-V08] traces: AC-002-05
    it('TC-M3-09: Observability fix strategy documented', () => {
        const c = getContent();
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('monitoring') || lower.includes('logging') ||
            lower.includes('alerting') || lower.includes('tracing'),
            'Must document observability fix strategy'
        );
    });

    // TC-M3-10: WARNING findings handling [M3-V09] traces: AC-002-06
    it('TC-M3-10: WARNING findings handling documented (straightforward or NEEDS CLARIFICATION)', () => {
        const c = getContent();
        assert.ok(c.includes('WARNING'), 'Must reference WARNING findings');
        assert.ok(c.includes('NEEDS CLARIFICATION'), 'Must reference NEEDS CLARIFICATION for complex warnings');
    });

    // TC-M3-11: Never-remove rule [M3-V10] traces: AC-002-07
    it('TC-M3-11: Rule: NEVER remove existing architectural decisions', () => {
        const c = getContent();
        assert.ok(
            c.includes('NEVER remove existing architectural decisions'),
            'Must contain rule about never removing existing architectural decisions'
        );
    });

    // TC-M3-12: Change log format [M3-V11] traces: AC-002-08
    it('TC-M3-12: Change log format documented with required columns', () => {
        const c = getContent();
        assert.ok(c.includes('Changes in Round'), 'Must contain Changes in Round section header');
        assert.ok(c.includes('Finding'), 'Must contain Finding column in change log');
        assert.ok(c.includes('Severity'), 'Must contain Severity column in change log');
        assert.ok(c.includes('Action'), 'Must contain Action column in change log');
        assert.ok(c.includes('Target'), 'Must contain Target column in change log');
        assert.ok(c.includes('Description'), 'Must contain Description column in change log');
    });

    // TC-M3-13: Escalation with NEEDS CLARIFICATION [M3-V12] traces: AC-002-06
    it('TC-M3-13: Escalation with NEEDS CLARIFICATION documented', () => {
        const c = getContent();
        assert.ok(
            c.includes('NEEDS CLARIFICATION'),
            'Must contain NEEDS CLARIFICATION escalation marker'
        );
    });

    // TC-M3-14: Input includes critique file [M3-V13] traces: FR-002
    it('TC-M3-14: Input includes critique file reference', () => {
        const c = getContent();
        assert.ok(
            c.includes('round-') && c.includes('critique'),
            'Must reference round-N-critique.md as input'
        );
    });

    // TC-M3-15: Never-introduce-scope rule [M3-V14] traces: FR-002
    it('TC-M3-15: Rule: NEVER introduce new scope', () => {
        const c = getContent();
        assert.ok(
            c.includes('NEVER introduce new scope'),
            'Must contain rule about never introducing new scope'
        );
    });

    // TC-M3-16: Preserve ADR numbering rule [M3-V15] traces: FR-002
    it('TC-M3-16: Rule: Preserve ADR numbering', () => {
        const c = getContent();
        assert.ok(
            c.includes('preserve ADR numbering') || c.includes('ADR-0001 stays ADR-0001'),
            'Must contain rule about preserving ADR numbering'
        );
    });

    // TC-M3-17: Structural consistency with Phase 01 refiner [M3-V16] traces: NFR-002
    it('TC-M3-17: Structural consistency with Phase 01 refiner (matching sections)', () => {
        const c = getContent();
        assert.ok(c.includes('## IDENTITY'), 'Must have ## IDENTITY section');
        assert.ok(c.includes('## INPUT'), 'Must have ## INPUT section');
        assert.ok(c.includes('## REFINEMENT PROCESS'), 'Must have ## REFINEMENT PROCESS section');
        assert.ok(c.includes('## RULES'), 'Must have ## RULES section');
    });

    // TC-M3-18: File size under 15KB [NFR-001]
    it('TC-M3-18: Agent file size is under 15KB (NFR-001)', () => {
        const stats = fs.statSync(REFINER_PATH);
        assert.ok(
            stats.size < 15 * 1024,
            `File size ${stats.size} bytes exceeds 15KB limit (${15 * 1024} bytes)`
        );
    });
});

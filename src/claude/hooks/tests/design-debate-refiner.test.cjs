/**
 * Tests for Design Refiner Agent (Module M3)
 * Traces to: FR-002, AC-002-01..AC-002-09, NFR-002
 * Feature: REQ-0016-multi-agent-design-team
 * Validation Rules: M3-V01..M3-V17
 *
 * Target file: src/claude/agents/03-design-refiner.md (NEW)
 * Template: src/claude/agents/02-architecture-refiner.md
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REFINER_PATH = path.resolve(__dirname, '..', '..', 'agents', '03-design-refiner.md');

describe('M3: Design Refiner Agent (03-design-refiner.md)', () => {
    let content;

    function getContent() {
        if (!content) {
            assert.ok(fs.existsSync(REFINER_PATH), 'Design refiner agent file must exist at ' + REFINER_PATH);
            content = fs.readFileSync(REFINER_PATH, 'utf8');
        }
        return content;
    }

    // TC-M3-01: File exists [M3-V01 prerequisite]
    it('TC-M3-01: Design refiner agent file exists', () => {
        assert.ok(fs.existsSync(REFINER_PATH), 'Design refiner agent file must exist');
    });

    // TC-M3-02: Agent name is design-refiner [M3-V01] traces: NFR-002
    it('TC-M3-02: Agent frontmatter contains name: design-refiner', () => {
        const c = getContent();
        assert.ok(
            c.includes('name: design-refiner'),
            'Must contain name: design-refiner in frontmatter'
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

    // TC-M3-05: API completion fix strategy [M3-V04] traces: AC-002-01
    it('TC-M3-05: API completion fix strategy documented (DC-01)', () => {
        const c = getContent();
        assert.ok(
            c.includes('OpenAPI') ||
            c.includes('request/response') ||
            c.includes('schema'),
            'Must document API completion fix strategy with OpenAPI/request-response/schema'
        );
    });

    // TC-M3-06: Pattern unification fix strategy [M3-V05] traces: AC-002-02
    it('TC-M3-06: Pattern unification fix strategy documented (DC-02)', () => {
        const c = getContent();
        assert.ok(
            c.includes('Unify patterns') ||
            c.includes('consistent naming') ||
            c.includes('unified'),
            'Must document pattern unification fix strategy'
        );
    });

    // TC-M3-07: Module boundary fix strategy [M3-V06] traces: AC-002-03
    it('TC-M3-07: Module boundary fix strategy documented (DC-03)', () => {
        const c = getContent();
        assert.ok(
            c.includes('module boundaries') ||
            c.includes('responsibility declarations') ||
            c.includes('dependency direction'),
            'Must document module boundary fix strategy'
        );
    });

    // TC-M3-08: Validation gap fix strategy [M3-V07] traces: AC-002-04
    it('TC-M3-08: Validation gap fix strategy documented (DC-04)', () => {
        const c = getContent();
        assert.ok(c.includes('validation'), 'Must reference validation');
        assert.ok(c.includes('min/max'), 'Must reference min/max boundary validation');
    });

    // TC-M3-09: Idempotency fix strategy [M3-V08] traces: AC-002-05
    it('TC-M3-09: Idempotency fix strategy documented (DC-05)', () => {
        const c = getContent();
        assert.ok(c.includes('idempotency'), 'Must reference idempotency');
        assert.ok(c.includes('retry-safe'), 'Must reference retry-safe semantics');
    });

    // TC-M3-10: Error taxonomy fix strategy [M3-V09] traces: AC-002-06
    it('TC-M3-10: Error taxonomy fix strategy documented (DC-07)', () => {
        const c = getContent();
        assert.ok(
            c.includes('error taxonomy') ||
            c.includes('error code') ||
            c.includes('retry guidance'),
            'Must document error taxonomy fix strategy'
        );
    });

    // TC-M3-11: WARNING handling [M3-V10] traces: AC-002-07
    it('TC-M3-11: WARNING handling documented (straightforward or NEEDS CLARIFICATION)', () => {
        const c = getContent();
        assert.ok(c.includes('WARNING'), 'Must reference WARNING findings');
        assert.ok(c.includes('NEEDS CLARIFICATION'), 'Must reference NEEDS CLARIFICATION for complex warnings');
    });

    // TC-M3-12: Never-remove rule [M3-V11] traces: AC-002-08
    it('TC-M3-12: Rule: NEVER remove existing design decisions', () => {
        const c = getContent();
        assert.ok(
            c.includes('NEVER remove existing design decisions'),
            'Must contain rule about never removing existing design decisions'
        );
    });

    // TC-M3-13: Change log format [M3-V12] traces: AC-002-09
    it('TC-M3-13: Change log format documented with required columns', () => {
        const c = getContent();
        assert.ok(c.includes('Changes in Round'), 'Must contain Changes in Round section header');
        assert.ok(c.includes('Finding'), 'Must contain Finding column in change log');
        assert.ok(c.includes('Severity'), 'Must contain Severity column in change log');
        assert.ok(c.includes('Action'), 'Must contain Action column in change log');
        assert.ok(c.includes('Target'), 'Must contain Target column in change log');
        assert.ok(c.includes('Description'), 'Must contain Description column in change log');
    });

    // TC-M3-14: Escalation with NEEDS CLARIFICATION [M3-V13] traces: AC-002-07
    it('TC-M3-14: Escalation with NEEDS CLARIFICATION documented', () => {
        const c = getContent();
        assert.ok(
            c.includes('NEEDS CLARIFICATION'),
            'Must contain NEEDS CLARIFICATION escalation marker'
        );
    });

    // TC-M3-15: Input includes critique file [M3-V14] traces: FR-002
    it('TC-M3-15: Input includes critique file reference', () => {
        const c = getContent();
        assert.ok(
            c.includes('round-') && c.includes('critique'),
            'Must reference round-N-critique.md as input'
        );
    });

    // TC-M3-16: Never-introduce-scope rule [M3-V15] traces: FR-002
    it('TC-M3-16: Rule: NEVER introduce new scope', () => {
        const c = getContent();
        assert.ok(
            c.includes('NEVER introduce new scope'),
            'Must contain rule about never introducing new scope'
        );
    });

    // TC-M3-17: Preserve module names rule [M3-V16] traces: FR-002
    it('TC-M3-17: Rule: Preserve module names', () => {
        const c = getContent();
        assert.ok(
            c.includes('preserve module names') || c.includes('Module-A.md stays Module-A.md'),
            'Must contain rule about preserving module names'
        );
    });

    // TC-M3-18: Structural consistency with Phase 03 refiner [M3-V17] traces: NFR-002
    it('TC-M3-18: Structural consistency with Phase 03 refiner (matching sections)', () => {
        const c = getContent();
        assert.ok(c.includes('## IDENTITY'), 'Must have ## IDENTITY section');
        assert.ok(c.includes('## INPUT'), 'Must have ## INPUT section');
        assert.ok(c.includes('## REFINEMENT PROCESS'), 'Must have ## REFINEMENT PROCESS section');
        assert.ok(c.includes('## RULES'), 'Must have ## RULES section');
    });

    // TC-M3-19: File size under 15KB [NFR-001]
    it('TC-M3-19: Agent file size is under 15KB (NFR-001)', () => {
        const stats = fs.statSync(REFINER_PATH);
        assert.ok(
            stats.size < 15 * 1024,
            `File size ${stats.size} bytes exceeds 15KB limit (${15 * 1024} bytes)`
        );
    });
});

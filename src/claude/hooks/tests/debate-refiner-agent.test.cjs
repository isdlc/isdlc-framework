/**
 * Tests for Refiner Agent (Module M3)
 * Traces to: FR-003, AC-003-01..04, CON-003
 * Feature: REQ-0014-multi-agent-requirements-team
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REFINER_PATH = path.resolve(__dirname, '..', '..', 'agents', '01-requirements-refiner.md');

describe('M3: Refiner Agent (01-requirements-refiner.md)', () => {
    let content;

    function getContent() {
        if (!content) {
            assert.ok(fs.existsSync(REFINER_PATH), 'Refiner agent file must exist at ' + REFINER_PATH);
            content = fs.readFileSync(REFINER_PATH, 'utf8');
        }
        return content;
    }

    // TC-M3-01: Refiner agent file exists
    it('TC-M3-01: Refiner agent file exists', () => {
        assert.ok(fs.existsSync(REFINER_PATH), 'Refiner agent file must exist');
    });

    // TC-M3-02: Agent frontmatter contains correct name
    it('TC-M3-02: Agent frontmatter contains correct name', () => {
        const c = getContent();
        assert.ok(
            c.includes('name: requirements-refiner'),
            'Must contain name: requirements-refiner in frontmatter'
        );
    });

    // TC-M3-03: BLOCKING findings addressed (mandatory)
    it('TC-M3-03: BLOCKING findings addressed (mandatory)', () => {
        const c = getContent();
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('blocking') && lower.includes('mandatory'),
            'Must contain instructions to address all BLOCKING findings as mandatory'
        );
    });

    // TC-M3-04: Vague AC fix strategy (Given/When/Then)
    it('TC-M3-04: Vague AC fix strategy (Given/When/Then)', () => {
        const c = getContent();
        assert.ok(
            c.includes('Given/When/Then'),
            'Must contain Given/When/Then as fix strategy for vague ACs'
        );
    });

    // TC-M3-05: Unmeasured NFR fix strategy (quantified metric)
    it('TC-M3-05: Unmeasured NFR fix strategy (quantified metric)', () => {
        const c = getContent();
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('quantif') && lower.includes('metric'),
            'Must contain quantified metric fix strategy'
        );
    });

    // TC-M3-06: Escalation with NEEDS CLARIFICATION
    it('TC-M3-06: Escalation with NEEDS CLARIFICATION', () => {
        const c = getContent();
        assert.ok(
            c.includes('NEEDS CLARIFICATION'),
            'Must contain NEEDS CLARIFICATION escalation marker'
        );
        assert.ok(
            c.includes('Article IV'),
            'Must reference Article IV for escalation rationale'
        );
    });

    // TC-M3-07: Change log format present
    it('TC-M3-07: Change log format present', () => {
        const c = getContent();
        assert.ok(
            c.includes('Changes in Round'),
            'Must contain Changes in Round section format'
        );
    });

    // TC-M3-08: Rule: Never remove existing requirements
    it('TC-M3-08: Rule: Never remove existing requirements', () => {
        const c = getContent();
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('never remove') && lower.includes('requirement'),
            'Must contain rule about not removing existing requirements'
        );
    });

    // TC-M3-09: Rule: Never introduce new scope
    it('TC-M3-09: Rule: Never introduce new scope', () => {
        const c = getContent();
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('never introduce') && lower.includes('scope'),
            'Must contain rule about not introducing new scope'
        );
    });

    // TC-M3-10: Rule: Preserve requirement IDs
    it('TC-M3-10: Rule: Preserve requirement IDs', () => {
        const c = getContent();
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('preserve') && lower.includes('id'),
            'Must contain rule about preserving requirement IDs'
        );
    });
});

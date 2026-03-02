/**
 * Tests for Critic Agent (Module M2)
 * Traces to: FR-002, AC-002-01..05, CON-003
 * Feature: REQ-0014-multi-agent-requirements-team
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const CRITIC_PATH = path.resolve(__dirname, '..', '..', 'agents', '01-requirements-critic.md');

describe('M2: Critic Agent (01-requirements-critic.md)', () => {
    let content;

    function getContent() {
        if (!content) {
            assert.ok(fs.existsSync(CRITIC_PATH), 'Critic agent file must exist at ' + CRITIC_PATH);
            content = fs.readFileSync(CRITIC_PATH, 'utf8');
        }
        return content;
    }

    // TC-M2-01: Critic agent file exists
    it('TC-M2-01: Critic agent file exists', () => {
        assert.ok(fs.existsSync(CRITIC_PATH), 'Critic agent file must exist');
    });

    // TC-M2-02: Agent frontmatter contains correct name
    it('TC-M2-02: Agent frontmatter contains correct name', () => {
        const c = getContent();
        assert.ok(
            c.includes('name: requirements-critic'),
            'Must contain name: requirements-critic in frontmatter'
        );
    });

    // TC-M2-03: MC-01: Given/When/Then check present
    it('TC-M2-03: MC-01: Given/When/Then check present', () => {
        const c = getContent();
        assert.ok(c.includes('MC-01'), 'Must contain MC-01 check ID');
        assert.ok(c.includes('Given/When/Then'), 'Must reference Given/When/Then format');
    });

    // TC-M2-04: MC-02: Quantified NFRs check present
    it('TC-M2-04: MC-02: Quantified NFRs check present', () => {
        const c = getContent();
        assert.ok(c.includes('MC-02'), 'Must contain MC-02 check ID');
        const lower = c.toLowerCase();
        assert.ok(lower.includes('quantif'), 'Must reference quantified NFRs');
    });

    // TC-M2-05: MC-03: Orphan requirements check present
    it('TC-M2-05: MC-03: Orphan requirements check present', () => {
        const c = getContent();
        assert.ok(c.includes('MC-03'), 'Must contain MC-03 check ID');
        assert.ok(c.includes('Orphan'), 'Must reference Orphan requirements');
    });

    // TC-M2-06: MC-04: Contradictions check present
    it('TC-M2-06: MC-04: Contradictions check present', () => {
        const c = getContent();
        assert.ok(c.includes('MC-04'), 'Must contain MC-04 check ID');
        assert.ok(
            c.includes('Contradiction') || c.includes('contradiction'),
            'Must reference Contradictions'
        );
    });

    // TC-M2-07: MC-05: Missing compliance check present
    it('TC-M2-07: MC-05: Missing compliance check present', () => {
        const c = getContent();
        assert.ok(c.includes('MC-05'), 'Must contain MC-05 check ID');
        assert.ok(
            c.includes('Compliance') || c.includes('compliance'),
            'Must reference Compliance'
        );
    });

    // TC-M2-08: BLOCKING/WARNING severity classification
    it('TC-M2-08: BLOCKING/WARNING severity classification', () => {
        const c = getContent();
        assert.ok(c.includes('BLOCKING'), 'Must contain BLOCKING severity');
        assert.ok(c.includes('WARNING'), 'Must contain WARNING severity');
    });

    // TC-M2-09: Critique report output format
    it('TC-M2-09: Critique report output format', () => {
        const c = getContent();
        assert.ok(
            c.includes('round-') && c.includes('critique'),
            'Must reference round-N-critique.md output format'
        );
    });

    // TC-M2-10: Rule: Never produce zero findings on Round 1
    it('TC-M2-10: Rule: Never produce zero findings on Round 1', () => {
        const c = getContent();
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('never produce zero findings') ||
            lower.includes('never') && lower.includes('zero findings') && lower.includes('round 1'),
            'Must contain rule about not producing zero findings on Round 1'
        );
    });

    // TC-M2-11: Rule: Never inflate severity
    it('TC-M2-11: Rule: Never inflate severity', () => {
        const c = getContent();
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('never inflate severity') ||
            lower.includes('inflate') && lower.includes('severity'),
            'Must contain rule about not inflating severity'
        );
    });

    // TC-M2-12: Rule: Always reference specific IDs
    it('TC-M2-12: Rule: Always reference specific IDs', () => {
        const c = getContent();
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('always reference specific') ||
            lower.includes('reference') && lower.includes('specific') && lower.includes('id'),
            'Must contain rule about referencing specific IDs'
        );
    });

    // TC-M2-13: Discretionary checks DC-01..DC-07 present
    it('TC-M2-13: Discretionary checks DC-01..DC-07 present', () => {
        const c = getContent();
        assert.ok(c.includes('DC-01'), 'Must contain DC-01');
        assert.ok(c.includes('DC-02'), 'Must contain DC-02');
        assert.ok(c.includes('DC-03'), 'Must contain DC-03');
        assert.ok(c.includes('DC-04'), 'Must contain DC-04');
        assert.ok(c.includes('DC-05'), 'Must contain DC-05');
        assert.ok(c.includes('DC-06'), 'Must contain DC-06');
        assert.ok(c.includes('DC-07'), 'Must contain DC-07');
    });

    // TC-M2-14: Critique is read-only (does not modify artifacts)
    it('TC-M2-14: Critique is read-only (does not modify artifacts)', () => {
        const c = getContent();
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('only output') || lower.includes('do not modify'),
            'Must contain instruction that critique report is only output'
        );
    });
});

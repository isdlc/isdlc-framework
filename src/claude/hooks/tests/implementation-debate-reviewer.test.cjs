/**
 * Tests for Implementation Reviewer Agent (Module M1)
 * Traces to: FR-001, AC-001-01..AC-001-08, NFR-003
 * Feature: REQ-0017-multi-agent-implementation-team
 * Validation Rules: VR-001..VR-008
 *
 * Target file: src/claude/agents/05-implementation-reviewer.md (NEW)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REVIEWER_PATH = path.resolve(__dirname, '..', '..', 'agents', '05-implementation-reviewer.md');

describe('M1: Implementation Reviewer Agent (05-implementation-reviewer.md)', () => {
    let content;

    function getContent() {
        if (!content) {
            assert.ok(fs.existsSync(REVIEWER_PATH), 'Implementation reviewer agent file must exist at ' + REVIEWER_PATH);
            content = fs.readFileSync(REVIEWER_PATH, 'utf8');
        }
        return content;
    }

    // TC-M1-01: Agent file exists
    it('TC-M1-01: Implementation reviewer agent file exists', () => {
        assert.ok(fs.existsSync(REVIEWER_PATH), 'Implementation reviewer agent file must exist');
    });

    // TC-M1-02: Agent frontmatter contains correct name
    it('TC-M1-02: Agent frontmatter contains name: implementation-reviewer', () => {
        const c = getContent();
        assert.ok(
            c.includes('name: implementation-reviewer'),
            'Must contain name: implementation-reviewer in frontmatter'
        );
    });

    // TC-M1-03: Agent frontmatter contains model: opus
    it('TC-M1-03: Agent frontmatter contains model: opus', () => {
        const c = getContent();
        assert.ok(
            c.includes('model: opus'),
            'Must contain model: opus in frontmatter'
        );
    });

    // TC-M1-04: Agent is orchestrator-only (debate mode constraint)
    it('TC-M1-04: Agent is invoked only by orchestrator', () => {
        const c = getContent();
        assert.ok(
            c.includes('ONLY invoked by the orchestrator'),
            'Must contain orchestrator-only invocation constraint'
        );
    });

    // TC-M1-05: IC-01 Logic Correctness check documented
    it('TC-M1-05: IC-01 Logic Correctness check documented', () => {
        const c = getContent();
        assert.ok(c.includes('IC-01'), 'Must contain IC-01 check ID');
        assert.ok(
            c.toLowerCase().includes('logic'),
            'Must contain IC-01 Logic Correctness check category'
        );
    });

    // TC-M1-06: IC-02 Error Handling check documented
    it('TC-M1-06: IC-02 Error Handling check documented', () => {
        const c = getContent();
        assert.ok(c.includes('IC-02'), 'Must contain IC-02 check ID');
        assert.ok(
            c.includes('Error Handling'),
            'Must contain IC-02 Error Handling check category'
        );
    });

    // TC-M1-07: IC-03 Security check documented
    it('TC-M1-07: IC-03 Security check documented', () => {
        const c = getContent();
        assert.ok(c.includes('IC-03'), 'Must contain IC-03 check ID');
        assert.ok(
            c.includes('Security'),
            'Must contain IC-03 Security check category'
        );
    });

    // TC-M1-08: IC-04 Code Quality check documented
    it('TC-M1-08: IC-04 Code Quality check documented', () => {
        const c = getContent();
        assert.ok(c.includes('IC-04'), 'Must contain IC-04 check ID');
        assert.ok(
            c.includes('Code Quality'),
            'Must contain IC-04 Code Quality check category'
        );
    });

    // TC-M1-09: IC-05 Test Quality check documented
    it('TC-M1-09: IC-05 Test Quality check documented', () => {
        const c = getContent();
        assert.ok(c.includes('IC-05'), 'Must contain IC-05 check ID');
        assert.ok(
            c.includes('Test Quality'),
            'Must contain IC-05 Test Quality check category'
        );
    });

    // TC-M1-10: IC-06 Tech-Stack Alignment check documented
    it('TC-M1-10: IC-06 Tech-Stack Alignment check documented', () => {
        const c = getContent();
        assert.ok(c.includes('IC-06'), 'Must contain IC-06 check ID');
        assert.ok(
            c.toLowerCase().includes('tech-stack') || c.toLowerCase().includes('tech stack'),
            'Must contain IC-06 Tech-Stack Alignment check category'
        );
    });

    // TC-M1-11: IC-07 Constitutional Compliance check documented
    it('TC-M1-11: IC-07 Constitutional Compliance check documented', () => {
        const c = getContent();
        assert.ok(c.includes('IC-07'), 'Must contain IC-07 check ID');
        assert.ok(
            c.includes('Constitutional'),
            'Must contain IC-07 Constitutional Compliance check category'
        );
    });

    // TC-M1-12: IC-08 Structured Output self-check documented
    it('TC-M1-12: IC-08 Structured Output self-check documented', () => {
        const c = getContent();
        assert.ok(c.includes('IC-08'), 'Must contain IC-08 check ID');
        assert.ok(
            c.includes('Structured Output'),
            'Must contain IC-08 Structured Output self-check category'
        );
    });

    // TC-M1-13: All 8 IC categories present (completeness)
    it('TC-M1-13: All 8 IC check categories present', () => {
        const c = getContent();
        for (let i = 1; i <= 8; i++) {
            const id = `IC-0${i}`;
            assert.ok(c.includes(id), `Must contain ${id} check category identifier`);
        }
    });

    // TC-M1-14: Severity levels defined (BLOCKING, WARNING, INFO)
    it('TC-M1-14: Severity levels defined (BLOCKING, WARNING, INFO)', () => {
        const c = getContent();
        assert.ok(c.includes('BLOCKING'), 'Must define BLOCKING severity level');
        assert.ok(c.includes('WARNING'), 'Must define WARNING severity level');
        assert.ok(c.includes('INFO'), 'Must define INFO severity level');
    });

    // TC-M1-15: Verdict PASS/REVISE format defined
    it('TC-M1-15: Verdict PASS/REVISE format defined', () => {
        const c = getContent();
        assert.ok(c.includes('Verdict'), 'Must contain Verdict keyword');
        assert.ok(c.includes('PASS'), 'Must define PASS verdict value');
        assert.ok(c.includes('REVISE'), 'Must define REVISE verdict value');
    });

    // TC-M1-16: Convergence criteria (0 BLOCKING = PASS)
    it('TC-M1-16: Convergence criteria documented (0 BLOCKING = PASS)', () => {
        const c = getContent().toLowerCase();
        assert.ok(
            (c.includes('blocking') && c.includes('== 0') && c.includes('pass')) ||
            (c.includes('blocking findings') && c.includes('0') && c.includes('pass')),
            'Must define convergence: 0 BLOCKING findings = PASS verdict'
        );
    });

    // TC-M1-17: Structured output format specification
    it('TC-M1-17: Structured output format with required sections', () => {
        const c = getContent();
        assert.ok(c.includes('# Per-File Review'), 'Must contain # Per-File Review section');
        assert.ok(c.includes('## Summary'), 'Must contain ## Summary section');
        assert.ok(c.includes('## BLOCKING Findings'), 'Must contain ## BLOCKING Findings section');
        assert.ok(c.includes('## WARNING Findings'), 'Must contain ## WARNING Findings section');
    });

    // TC-M1-18: File-type applicability matrix
    it('TC-M1-18: File-type applicability matrix documented', () => {
        const c = getContent();
        assert.ok(
            c.toLowerCase().includes('applicability') ||
            (c.includes('Production') && c.includes('Test') && c.includes('Markdown')),
            'Must contain file-type applicability matrix for IC categories'
        );
    });

    // TC-M1-19: Line-reference protocol
    it('TC-M1-19: Line-reference protocol in findings format', () => {
        const c = getContent().toLowerCase();
        assert.ok(
            c.includes('line') && (c.includes('number') || c.includes('line:')),
            'Must contain line-reference protocol in findings format'
        );
    });

    // TC-M1-20: Read-only constraint (Reviewer never modifies files)
    it('TC-M1-20: Read-only constraint documented', () => {
        const c = getContent().toLowerCase();
        assert.ok(
            c.includes('never modify') || c.includes('read-only'),
            'Must contain read-only constraint -- Reviewer must not modify reviewed files'
        );
    });
});

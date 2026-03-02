/**
 * Tests for Creator Enhancements (Module M1)
 * Traces to: FR-001, FR-007, AC-001-01..03, AC-007-01..03, NFR-002
 * Feature: REQ-0014-multi-agent-requirements-team
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ANALYST_PATH = path.resolve(__dirname, '..', '..', 'agents', '01-requirements-analyst.md');

describe('M1: Creator Enhancements (requirements-analyst.md)', () => {
    let content;

    function getContent() {
        if (!content) {
            assert.ok(fs.existsSync(ANALYST_PATH), 'Requirements analyst agent file must exist');
            content = fs.readFileSync(ANALYST_PATH, 'utf8');
        }
        return content;
    }

    // TC-M1-01: DEBATE_CONTEXT detection section exists
    it('TC-M1-01: DEBATE_CONTEXT detection section exists', () => {
        const c = getContent();
        assert.ok(c.includes('DEBATE_CONTEXT'), 'Must contain DEBATE_CONTEXT reference');
        assert.ok(c.includes('Mode Detection'), 'Must contain Mode Detection section');
    });

    // TC-M1-02: Round labeling instructions present
    it('TC-M1-02: Round labeling instructions present', () => {
        const c = getContent();
        assert.ok(
            c.includes('Round') && c.includes('Draft'),
            'Must contain Round N Draft labeling instructions'
        );
    });

    // TC-M1-03: Skip final save menu in debate mode
    it('TC-M1-03: Skip final save menu in debate mode', () => {
        const c = getContent();
        assert.ok(
            c.includes('Skip Final Save Menu') || c.includes('skip') && c.includes('save menu'),
            'Must contain instruction to skip save menu when DEBATE_CONTEXT present'
        );
    });

    // TC-M1-04: Single-agent mode preserved
    it('TC-M1-04: Single-agent mode preserved', () => {
        const c = getContent();
        assert.ok(
            c.includes('NOT present') || c.includes('not present') || c.includes('is NOT present'),
            'Must contain absence-based fork for single-agent mode'
        );
    });

    // TC-M1-05: Conversational opening: reflect pattern
    it('TC-M1-05: Conversational opening: reflect pattern', () => {
        const c = getContent();
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('reflect') && lower.includes('summary'),
            'Must contain reflect-and-ask pattern with summary'
        );
    });

    // TC-M1-06: Conversational opening: targeted follow-up
    it('TC-M1-06: Conversational opening: targeted follow-up', () => {
        const c = getContent();
        assert.ok(
            c.includes('ONE targeted') || c.includes('one targeted') ||
            c.includes('focused question'),
            'Must contain targeted follow-up instead of 3 generic questions'
        );
    });

    // TC-M1-07: Discovery context integration
    it('TC-M1-07: Discovery context integration', () => {
        const c = getContent();
        assert.ok(
            c.includes('discovery_context'),
            'Must reference discovery_context for context-aware opening'
        );
    });

    // TC-M1-08: Organic 5 lenses
    it('TC-M1-08: Organic 5 lenses (not sequential stages)', () => {
        const c = getContent();
        assert.ok(
            c.includes('5') && c.includes('lenses') ||
            c.includes('Business') && c.includes('User') && c.includes('UX') && c.includes('Tech') && c.includes('Quality'),
            'Must reference 5 discovery lenses'
        );
        assert.ok(
            c.includes('organic') || c.includes('organically'),
            'Must instruct to use lenses organically'
        );
    });

    // TC-M1-09: Round > 1 behavior (no re-asking)
    it('TC-M1-09: Round > 1 behavior (no re-asking)', () => {
        const c = getContent();
        assert.ok(
            c.includes('Round > 1') || c.includes('round > 1'),
            'Must contain Round > 1 behavior section'
        );
        assert.ok(
            c.includes('not re-consult') || c.includes('NOT been re-consult') ||
            c.includes('do not ask opening questions again') || c.includes('not ask opening'),
            'Must instruct not to re-ask opening questions in Round > 1'
        );
    });

    // TC-M1-10: Explicit requirement IDs in debate output
    it('TC-M1-10: Explicit requirement IDs in debate output', () => {
        const c = getContent();
        assert.ok(
            c.includes('FR-NNN') || c.includes('FR-') && c.includes('AC-') && c.includes('NFR-'),
            'Must reference explicit requirement ID formats for debate output'
        );
    });

    // TC-M1-11: A/R/C menu pattern preserved
    it('TC-M1-11: A/R/C menu pattern preserved', () => {
        const c = getContent();
        assert.ok(c.includes('[A]') || c.includes('Adjust'), 'Must contain Adjust option');
        assert.ok(c.includes('[R]') || c.includes('Refine'), 'Must contain Refine option');
        assert.ok(c.includes('[C]') || c.includes('Continue'), 'Must contain Continue option');
    });

    // TC-M1-12: DEBATE MODE BEHAVIOR section exists
    it('TC-M1-12: DEBATE MODE BEHAVIOR section exists', () => {
        const c = getContent();
        assert.ok(
            c.includes('DEBATE MODE BEHAVIOR'),
            'Must contain DEBATE MODE BEHAVIOR heading'
        );
    });
});

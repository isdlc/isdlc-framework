/**
 * Tests for Validation Rules VR-001 through VR-062
 * Traces to: All VRs for REQ-0014
 * Feature: REQ-0014-multi-agent-requirements-team
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const VALIDATION_RULES_PATH = path.resolve(
    __dirname, '..', '..', '..', '..', 'docs', 'requirements',
    'REQ-0014-multi-agent-requirements-team', 'validation-rules.json'
);

describe('Debate Validation Rules', () => {
    let rules;

    function getRules() {
        if (!rules) {
            assert.ok(fs.existsSync(VALIDATION_RULES_PATH), 'validation-rules.json must exist');
            rules = JSON.parse(fs.readFileSync(VALIDATION_RULES_PATH, 'utf8'));
        }
        return rules;
    }

    // TC-VR-001: Flag precedence: --no-debate > --debate
    it('TC-VR-001: Flag precedence: --no-debate wins over --debate', () => {
        const r = getRules();
        const rule = r.rules.debate_mode_resolution['VR-001'];
        assert.ok(rule, 'VR-001 rule must exist');
        assert.equal(rule.input.no_debate, true, 'Input must have no_debate: true');
        assert.equal(rule.input.debate, true, 'Input must have debate: true');
        assert.equal(rule.expected_output, false, 'Expected output must be false (no-debate wins)');
    });

    // TC-VR-002: Flag precedence: --debate > -light
    it('TC-VR-002: Flag precedence: --debate overrides -light', () => {
        const r = getRules();
        const rule = r.rules.debate_mode_resolution['VR-002'];
        assert.ok(rule, 'VR-002 rule must exist');
        assert.equal(rule.input.debate, true, 'Input must have debate: true');
        assert.equal(rule.input.light, true, 'Input must have light: true');
        assert.equal(rule.expected_output, true, 'Expected output must be true (debate overrides light)');
    });

    // TC-VR-003: Light flag implies no debate
    it('TC-VR-003: Light flag implies no debate', () => {
        const r = getRules();
        const rule = r.rules.debate_mode_resolution['VR-003'];
        assert.ok(rule, 'VR-003 rule must exist');
        assert.equal(rule.input.light, true, 'Input must have light: true');
        assert.equal(rule.expected_output, false, 'Expected output must be false');
    });

    // TC-VR-004: Standard sizing defaults ON
    it('TC-VR-004: Standard sizing defaults to debate ON', () => {
        const r = getRules();
        const rule = r.rules.debate_mode_resolution['VR-004'];
        assert.ok(rule, 'VR-004 rule must exist');
        assert.equal(rule.input.sizing, 'standard', 'Input must have sizing: standard');
        assert.equal(rule.expected_output, true, 'Expected output must be true');
    });

    // TC-VR-005: Epic sizing defaults ON
    it('TC-VR-005: Epic sizing defaults to debate ON', () => {
        const r = getRules();
        const rule = r.rules.debate_mode_resolution['VR-005'];
        assert.ok(rule, 'VR-005 rule must exist');
        assert.equal(rule.input.sizing, 'epic', 'Input must have sizing: epic');
        assert.equal(rule.expected_output, true, 'Expected output must be true');
    });

    // TC-VR-006: No flags defaults ON
    it('TC-VR-006: No flags, no sizing defaults to debate ON', () => {
        const r = getRules();
        const rule = r.rules.debate_mode_resolution['VR-006'];
        assert.ok(rule, 'VR-006 rule must exist');
        assert.deepEqual(rule.input, {}, 'Input must be empty object');
        assert.equal(rule.expected_output, true, 'Expected output must be true');
    });

    // TC-VR-010: debate_state.round range 0-3
    it('TC-VR-010: debate_state.round must be integer 0-3', () => {
        const r = getRules();
        const rule = r.rules.debate_state_schema['VR-010'];
        assert.ok(rule, 'VR-010 rule must exist');
        assert.equal(rule.min, 0, 'Min must be 0');
        assert.equal(rule.max, 3, 'Max must be 3');
    });

    // TC-VR-011: debate_state.max_rounds fixed at 3
    it('TC-VR-011: debate_state.max_rounds must be 3', () => {
        const r = getRules();
        const rule = r.rules.debate_state_schema['VR-011'];
        assert.ok(rule, 'VR-011 rule must exist');
        assert.equal(rule.value, 3, 'Value must be 3');
    });

    // TC-VR-020: Critique report requires Summary section
    it('TC-VR-020: Critique report requires Summary section', () => {
        const r = getRules();
        const rule = r.rules.critique_report_format['VR-020'];
        assert.ok(rule, 'VR-020 rule must exist');
        assert.equal(rule.required_content, '## Summary', 'Required content must be ## Summary');
    });

    // TC-VR-021: Summary must have BLOCKING count
    it('TC-VR-021: Summary must contain BLOCKING count row', () => {
        const r = getRules();
        const rule = r.rules.critique_report_format['VR-021'];
        assert.ok(rule, 'VR-021 rule must exist');
        assert.ok(
            rule.required_pattern.includes('BLOCKING'),
            'Pattern must reference BLOCKING'
        );
    });

    // TC-VR-040: Critique filename pattern
    it('TC-VR-040: Critique files must follow round-N-critique.md pattern', () => {
        const r = getRules();
        const rule = r.rules.artifact_naming['VR-040'];
        assert.ok(rule, 'VR-040 rule must exist');

        const regex = new RegExp(rule.pattern);
        assert.ok(regex.test('round-1-critique.md'), 'Must match round-1-critique.md');
        assert.ok(regex.test('round-2-critique.md'), 'Must match round-2-critique.md');
        assert.ok(regex.test('round-3-critique.md'), 'Must match round-3-critique.md');
        assert.ok(!regex.test('round-0-critique.md'), 'Must NOT match round-0-critique.md');
        assert.ok(!regex.test('round-4-critique.md'), 'Must NOT match round-4-critique.md');
    });

    // TC-VR-041: debate-summary.md existence after loop
    it('TC-VR-041: debate-summary.md must exist after debate loop', () => {
        const r = getRules();
        const rule = r.rules.artifact_naming['VR-041'];
        assert.ok(rule, 'VR-041 rule must exist');
        assert.equal(rule.file, 'debate-summary.md', 'File must be debate-summary.md');
    });

    // TC-VR-050: DEBATE_CONTEXT mode field required
    it('TC-VR-050: DEBATE_CONTEXT must include mode field', () => {
        const r = getRules();
        const rule = r.rules.debate_context_block['VR-050'];
        assert.ok(rule, 'VR-050 rule must exist');
        assert.deepEqual(
            rule.allowed_values,
            ['creator', 'critic', 'refiner'],
            'Allowed values must be creator, critic, refiner'
        );
    });

    // TC-VR-060: Absent DEBATE_CONTEXT = single-agent
    it('TC-VR-060: Absent DEBATE_CONTEXT equals single-agent mode', () => {
        const r = getRules();
        const rule = r.rules.backward_compatibility['VR-060'];
        assert.ok(rule, 'VR-060 rule must exist');
        assert.ok(
            rule.description.includes('single-agent') || rule.description.includes('before this feature'),
            'Description must reference single-agent mode behavior'
        );
    });

    // TC-VR-062: Single-agent mode parity
    it('TC-VR-062: Single-agent mode must produce identical artifacts', () => {
        const r = getRules();
        const rule = r.rules.backward_compatibility['VR-062'];
        assert.ok(rule, 'VR-062 rule must exist');
        assert.ok(
            rule.description.includes('identical') || rule.description.includes('pre-feature'),
            'Description must reference identical output or pre-feature behavior'
        );
    });
});

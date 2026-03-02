/**
 * Tests for Creator Role Awareness in System Designer (Module M4)
 * Traces to: FR-004, AC-004-01, AC-004-02, NFR-003
 * Feature: REQ-0016-multi-agent-design-team
 * Validation Rules: M4-V01..M4-V06
 *
 * Target file: src/claude/agents/03-system-designer.md (MODIFIED)
 * Change: Add INVOCATION PROTOCOL and DEBATE MODE BEHAVIOR sections
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const DESIGNER_PATH = path.resolve(__dirname, '..', '..', 'agents', '03-system-designer.md');

describe('M4: Creator Role Awareness (03-system-designer.md)', () => {
    let content;

    function getContent() {
        if (!content) {
            assert.ok(fs.existsSync(DESIGNER_PATH), 'System designer agent file must exist at ' + DESIGNER_PATH);
            content = fs.readFileSync(DESIGNER_PATH, 'utf8');
        }
        return content;
    }

    // TC-M4-01: File exists [prerequisite]
    it('TC-M4-01: System designer agent file exists', () => {
        assert.ok(fs.existsSync(DESIGNER_PATH), 'System designer agent file must exist');
    });

    // TC-M4-02: DEBATE_CONTEXT mode detection documented [M4-V01] traces: AC-004-01
    it('TC-M4-02: DEBATE_CONTEXT mode detection documented', () => {
        const c = getContent();
        assert.ok(c.includes('DEBATE_CONTEXT'), 'Must contain DEBATE_CONTEXT reference');
        const lower = c.toLowerCase();
        assert.ok(lower.includes('creator'), 'Must reference creator role');
    });

    // TC-M4-03: Self-assessment section specified [M4-V02] traces: AC-004-01
    it('TC-M4-03: Self-assessment section with required subsections', () => {
        const c = getContent();
        assert.ok(c.includes('Self-Assessment'), 'Must contain Self-Assessment section');
        assert.ok(c.includes('Known Trade-offs'), 'Must contain Known Trade-offs subsection');
        assert.ok(c.includes('Areas of Uncertainty'), 'Must contain Areas of Uncertainty subsection');
        assert.ok(c.includes('Open Questions'), 'Must contain Open Questions subsection');
    });

    // TC-M4-04: No-debate fallback preserves behavior [M4-V03] traces: AC-004-02, NFR-003
    it('TC-M4-04: No-debate fallback preserves current behavior', () => {
        const c = getContent();
        assert.ok(
            c.includes('DEBATE_CONTEXT is NOT present'),
            'Must document DEBATE_CONTEXT absent case'
        );
        assert.ok(
            c.includes('current behavior preserved'),
            'Must state current behavior is preserved when no DEBATE_CONTEXT'
        );
    });

    // TC-M4-05: Round labeling documented [M4-V04] traces: FR-004
    it('TC-M4-05: Round labeling documented (Round N Draft)', () => {
        const c = getContent();
        assert.ok(
            c.includes('Round') && c.includes('Draft'),
            'Must contain Round N Draft labeling instructions'
        );
    });

    // TC-M4-06: Skip final menu documented [M4-V05] traces: FR-004
    it('TC-M4-06: Skip final menu documented', () => {
        const c = getContent();
        assert.ok(
            c.includes('DO NOT present the final') || c.includes('Skip Final Menu'),
            'Must contain instruction to skip final save/gate-validation menu'
        );
    });

    // TC-M4-07: Round > 1 behavior documented [M4-V06] traces: FR-004
    it('TC-M4-07: Round > 1 behavior documented (use Refiner output)', () => {
        const c = getContent();
        assert.ok(c.includes('Round > 1'), 'Must document Round > 1 behavior');
        assert.ok(c.includes('Refiner'), 'Must reference Refiner output as baseline for subsequent rounds');
    });

    // TC-M4-08: Backward compatibility -- existing agent name preserved [NFR-003]
    it('TC-M4-08: Backward compatibility -- agent name unchanged', () => {
        const c = getContent();
        assert.ok(
            c.includes('name: system-designer') || c.includes('system-designer'),
            'Agent name must remain system-designer (backward compatibility)'
        );
    });
});

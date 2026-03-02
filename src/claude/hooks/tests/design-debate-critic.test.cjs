/**
 * Tests for Design Critic Agent (Module M2)
 * Traces to: FR-001, AC-001-01..AC-001-08, FR-006, AC-006-01..AC-006-05, NFR-002, NFR-004, AC-007-04
 * Feature: REQ-0016-multi-agent-design-team
 * Validation Rules: M2-V01..M2-V28
 *
 * Target file: src/claude/agents/03-design-critic.md (NEW)
 * Template: src/claude/agents/02-architecture-critic.md
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const CRITIC_PATH = path.resolve(__dirname, '..', '..', 'agents', '03-design-critic.md');

describe('M2: Design Critic Agent (03-design-critic.md)', () => {
    let content;

    function getContent() {
        if (!content) {
            assert.ok(fs.existsSync(CRITIC_PATH), 'Design critic agent file must exist at ' + CRITIC_PATH);
            content = fs.readFileSync(CRITIC_PATH, 'utf8');
        }
        return content;
    }

    // TC-M2-01: File exists [M2-V01 prerequisite]
    it('TC-M2-01: Design critic agent file exists', () => {
        assert.ok(fs.existsSync(CRITIC_PATH), 'Design critic agent file must exist');
    });

    // TC-M2-02: Agent name is design-critic [M2-V01] traces: NFR-002
    it('TC-M2-02: Agent frontmatter contains name: design-critic', () => {
        const c = getContent();
        assert.ok(
            c.includes('name: design-critic'),
            'Must contain name: design-critic in frontmatter'
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

    // TC-M2-05: DC-01 Incomplete API specs check [M2-V04] traces: AC-001-01
    it('TC-M2-05: DC-01 Incomplete API specs check documented', () => {
        const c = getContent();
        assert.ok(c.includes('DC-01'), 'Must contain DC-01 check ID');
        assert.ok(c.includes('Incomplete API'), 'Must reference Incomplete API category');
    });

    // TC-M2-06: DC-02 Inconsistent patterns check [M2-V05] traces: AC-001-02
    it('TC-M2-06: DC-02 Inconsistent patterns check documented', () => {
        const c = getContent();
        assert.ok(c.includes('DC-02'), 'Must contain DC-02 check ID');
        assert.ok(c.includes('Inconsistent Patterns'), 'Must reference Inconsistent Patterns category');
    });

    // TC-M2-07: DC-03 Module overlap check [M2-V06] traces: AC-001-03
    it('TC-M2-07: DC-03 Module overlap check documented', () => {
        const c = getContent();
        assert.ok(c.includes('DC-03'), 'Must contain DC-03 check ID');
        assert.ok(c.includes('Module Overlap'), 'Must reference Module Overlap category');
    });

    // TC-M2-08: DC-04 Validation gaps check [M2-V07] traces: AC-001-04
    it('TC-M2-08: DC-04 Validation gaps check documented', () => {
        const c = getContent();
        assert.ok(c.includes('DC-04'), 'Must contain DC-04 check ID');
        assert.ok(c.includes('Validation Gaps'), 'Must reference Validation Gaps category');
    });

    // TC-M2-09: DC-05 Missing idempotency check [M2-V08] traces: AC-001-05
    it('TC-M2-09: DC-05 Missing idempotency check documented', () => {
        const c = getContent();
        assert.ok(c.includes('DC-05'), 'Must contain DC-05 check ID');
        assert.ok(c.includes('Idempotency'), 'Must reference Idempotency category');
    });

    // TC-M2-10: DC-06 Accessibility check [M2-V09] traces: AC-001-06
    it('TC-M2-10: DC-06 Accessibility check documented', () => {
        const c = getContent();
        assert.ok(c.includes('DC-06'), 'Must contain DC-06 check ID');
        assert.ok(c.includes('Accessibility'), 'Must reference Accessibility category');
    });

    // TC-M2-11: DC-07 Error taxonomy holes check [M2-V10] traces: AC-001-07
    it('TC-M2-11: DC-07 Error taxonomy holes check documented', () => {
        const c = getContent();
        assert.ok(c.includes('DC-07'), 'Must contain DC-07 check ID');
        assert.ok(c.includes('Error Taxonomy'), 'Must reference Error Taxonomy category');
    });

    // TC-M2-12: DC-08 Data flow bottlenecks check [M2-V11] traces: AC-001-08
    it('TC-M2-12: DC-08 Data flow bottlenecks check documented', () => {
        const c = getContent();
        assert.ok(c.includes('DC-08'), 'Must contain DC-08 check ID');
        assert.ok(c.includes('Data Flow'), 'Must reference Data Flow category');
    });

    // TC-M2-13: Output file is round-N-critique.md [M2-V12] traces: FR-001, AC-005-01
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

    // TC-M2-16: API Endpoint Count metric [M2-V15] traces: AC-005-03
    it('TC-M2-16: API Endpoint Count metric in summary', () => {
        const c = getContent();
        assert.ok(c.includes('API Endpoint Count'), 'Must contain API Endpoint Count metric');
    });

    // TC-M2-17: Validation Rule Count metric [M2-V16] traces: AC-005-03
    it('TC-M2-17: Validation Rule Count metric in summary', () => {
        const c = getContent();
        assert.ok(c.includes('Validation Rule Count'), 'Must contain Validation Rule Count metric');
    });

    // TC-M2-18: Error Code Count metric [M2-V17] traces: AC-005-03
    it('TC-M2-18: Error Code Count metric in summary', () => {
        const c = getContent();
        assert.ok(c.includes('Error Code Count'), 'Must contain Error Code Count metric');
    });

    // TC-M2-19: Module Count metric [M2-V18] traces: AC-005-03
    it('TC-M2-19: Module Count metric in summary', () => {
        const c = getContent();
        assert.ok(c.includes('Module Count'), 'Must contain Module Count metric');
    });

    // TC-M2-20: Pattern Consistency Score metric [M2-V19] traces: AC-005-03
    it('TC-M2-20: Pattern Consistency Score metric in summary', () => {
        const c = getContent();
        assert.ok(c.includes('Pattern Consistency Score'), 'Must contain Pattern Consistency Score metric');
    });

    // TC-M2-21: Rule: do not modify input artifacts [M2-V20] traces: FR-001
    it('TC-M2-21: Rule: do not modify input artifacts', () => {
        const c = getContent();
        assert.ok(
            c.includes('do not modify any input artifacts'),
            'Must contain rule about not modifying input artifacts'
        );
    });

    // TC-M2-22: Article I (Specification Primacy) check [M2-V21] traces: AC-006-01
    it('TC-M2-22: Article I (Specification Primacy) constitutional check documented', () => {
        const c = getContent();
        assert.ok(c.includes('Article I'), 'Must reference Article I');
        assert.ok(c.includes('Specification Primacy'), 'Must reference Specification Primacy');
    });

    // TC-M2-23: Article IV (Explicit Over Implicit) check [M2-V22] traces: AC-006-02
    it('TC-M2-23: Article IV (Explicit Over Implicit) constitutional check documented', () => {
        const c = getContent();
        assert.ok(c.includes('Article IV'), 'Must reference Article IV');
        assert.ok(c.includes('Explicit Over Implicit'), 'Must reference Explicit Over Implicit');
    });

    // TC-M2-24: Article V (Simplicity First) check [M2-V23] traces: AC-006-03
    it('TC-M2-24: Article V (Simplicity First) constitutional check documented', () => {
        const c = getContent();
        assert.ok(c.includes('Article V'), 'Must reference Article V');
        assert.ok(c.includes('Simplicity First'), 'Must reference Simplicity First');
    });

    // TC-M2-25: Article VII (Artifact Traceability) check [M2-V24] traces: AC-006-04
    it('TC-M2-25: Article VII (Artifact Traceability) constitutional check documented', () => {
        const c = getContent();
        assert.ok(c.includes('Article VII'), 'Must reference Article VII');
        assert.ok(c.includes('Artifact Traceability'), 'Must reference Artifact Traceability');
    });

    // TC-M2-26: Article IX (Quality Gate Integrity) check [M2-V25] traces: AC-006-05
    it('TC-M2-26: Article IX (Quality Gate Integrity) constitutional check documented', () => {
        const c = getContent();
        assert.ok(c.includes('Article IX'), 'Must reference Article IX');
        assert.ok(c.includes('Quality Gate Integrity'), 'Must reference Quality Gate Integrity');
    });

    // TC-M2-27: Structural consistency with Phase 03 critic [M2-V26] traces: NFR-002
    it('TC-M2-27: Structural consistency with Phase 03 critic (matching sections)', () => {
        const c = getContent();
        assert.ok(c.includes('## IDENTITY'), 'Must have ## IDENTITY section');
        assert.ok(c.includes('## INPUT'), 'Must have ## INPUT section');
        assert.ok(c.includes('## CRITIQUE PROCESS'), 'Must have ## CRITIQUE PROCESS section');
        assert.ok(c.includes('## OUTPUT FORMAT'), 'Must have ## OUTPUT FORMAT section');
        assert.ok(c.includes('## RULES'), 'Must have ## RULES section');
    });

    // TC-M2-28: Interface type detection documented [M2-V27] traces: AC-007-04
    it('TC-M2-28: Interface type detection documented for non-REST projects', () => {
        const c = getContent();
        assert.ok(c.includes('Interface Type'), 'Must contain Interface Type detection');
        assert.ok(c.includes('REST'), 'Must reference REST interface type');
        assert.ok(c.includes('CLI'), 'Must reference CLI interface type');
        assert.ok(c.includes('Library'), 'Must reference Library interface type');
    });

    // TC-M2-29: DC-06 skip for non-UI projects [M2-V28] traces: AC-007-04
    it('TC-M2-29: DC-06 skip documented for non-UI projects', () => {
        const c = getContent();
        assert.ok(
            c.includes('DC-06: Not applicable') ||
            c.includes('non-UI project') ||
            c.includes('skip DC-06'),
            'Must document DC-06 skip condition for non-UI projects'
        );
    });

    // TC-M2-30: File size under 15KB [NFR-001]
    it('TC-M2-30: Agent file size is under 15KB (NFR-001)', () => {
        const stats = fs.statSync(CRITIC_PATH);
        assert.ok(
            stats.size < 15 * 1024,
            `File size ${stats.size} bytes exceeds 15KB limit (${15 * 1024} bytes)`
        );
    });
});

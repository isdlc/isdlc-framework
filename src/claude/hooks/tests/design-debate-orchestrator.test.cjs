/**
 * Tests for Orchestrator DEBATE_ROUTING Extension for Phase 04 (Module M1)
 * Traces to: FR-003, AC-003-01..AC-003-04, NFR-003
 * Feature: REQ-0016-multi-agent-design-team
 * Validation Rules: M1-V01..M1-V10
 *
 * Target file: src/claude/agents/00-sdlc-orchestrator.md (MODIFIED)
 * Section: 7.5 DEBATE LOOP ORCHESTRATION (Multi-Phase)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ORCHESTRATOR_PATH = path.resolve(__dirname, '..', '..', 'agents', '00-sdlc-orchestrator.md');

describe('M1: Orchestrator DEBATE_ROUTING Extension for Phase 04 (00-sdlc-orchestrator.md)', () => {
    let content;

    function getContent() {
        if (!content) {
            assert.ok(fs.existsSync(ORCHESTRATOR_PATH), 'Orchestrator agent file must exist');
            content = fs.readFileSync(ORCHESTRATOR_PATH, 'utf8');
        }
        return content;
    }

    // TC-M1-01: Routing table contains Phase 04 entry [M1-V01] traces: AC-003-01
    it('TC-M1-01: Routing table contains Phase 04 entry (04-design)', () => {
        const c = getContent();
        assert.ok(
            c.includes('04-design'),
            'Routing table must contain 04-design phase entry'
        );
    });

    // TC-M1-02: Phase 04 creator maps to system-designer [M1-V02] traces: AC-003-01
    it('TC-M1-02: Phase 04 creator maps to 03-system-designer.md', () => {
        const c = getContent();
        assert.ok(
            c.includes('03-system-designer.md'),
            'Routing table must map Phase 04 creator to 03-system-designer.md'
        );
    });

    // TC-M1-03: Phase 04 critic maps to design-critic [M1-V03] traces: AC-003-01
    it('TC-M1-03: Phase 04 critic maps to 03-design-critic.md', () => {
        const c = getContent();
        assert.ok(
            c.includes('03-design-critic.md'),
            'Routing table must map Phase 04 critic to 03-design-critic.md'
        );
    });

    // TC-M1-04: Phase 04 refiner maps to design-refiner [M1-V04] traces: AC-003-01
    it('TC-M1-04: Phase 04 refiner maps to 03-design-refiner.md', () => {
        const c = getContent();
        assert.ok(
            c.includes('03-design-refiner.md'),
            'Routing table must map Phase 04 refiner to 03-design-refiner.md'
        );
    });

    // TC-M1-05: Phase 04 artifacts include interface-spec.yaml [M1-V05] traces: AC-003-02
    it('TC-M1-05: Phase 04 artifacts include interface-spec.yaml', () => {
        const c = getContent();
        assert.ok(
            c.includes('interface-spec.yaml'),
            'Routing table 04-design row must list interface-spec.yaml'
        );
    });

    // TC-M1-06: Phase 04 artifacts include module-designs/ [M1-V06] traces: AC-003-02
    it('TC-M1-06: Phase 04 artifacts include module-designs/', () => {
        const c = getContent();
        assert.ok(
            c.includes('module-designs/'),
            'Routing table 04-design row must list module-designs/'
        );
    });

    // TC-M1-07: Phase 04 artifacts include error-taxonomy.md [M1-V07] traces: AC-003-02
    it('TC-M1-07: Phase 04 artifacts include error-taxonomy.md', () => {
        const c = getContent();
        assert.ok(
            c.includes('error-taxonomy.md'),
            'Routing table 04-design row must list error-taxonomy.md'
        );
    });

    // TC-M1-08: Phase 04 artifacts include validation-rules.json [M1-V08] traces: AC-003-02
    it('TC-M1-08: Phase 04 artifacts include validation-rules.json', () => {
        const c = getContent();
        assert.ok(
            c.includes('validation-rules.json'),
            'Routing table 04-design row must list validation-rules.json'
        );
    });

    // TC-M1-09: Existing Phase 01 routing row preserved [M1-V09] traces: NFR-003
    it('TC-M1-09: Existing Phase 01 routing row preserved (01-requirements)', () => {
        const c = getContent();
        assert.ok(
            c.includes('01-requirements'),
            'Routing table must still contain 01-requirements entry (backward compatibility)'
        );
    });

    // TC-M1-10: Existing Phase 03 routing row preserved [M1-V10] traces: NFR-003
    it('TC-M1-10: Existing Phase 03 routing row preserved (03-architecture)', () => {
        const c = getContent();
        assert.ok(
            c.includes('03-architecture'),
            'Routing table must still contain 03-architecture entry (backward compatibility)'
        );
    });

    // TC-M1-11: Convergence logic still references zero BLOCKING [structural] traces: AC-003-04
    it('TC-M1-11: Convergence logic still references zero BLOCKING', () => {
        const c = getContent();
        const debateIdx = c.indexOf('DEBATE LOOP ORCHESTRATION');
        assert.ok(debateIdx !== -1, 'Must have DEBATE LOOP ORCHESTRATION section');
        const debateSection = c.substring(debateIdx);
        assert.ok(
            debateSection.includes('blocking') && debateSection.includes('0') ||
            debateSection.includes('BLOCKING') && debateSection.includes('== 0'),
            'Must contain convergence condition of zero BLOCKING'
        );
    });

    // TC-M1-12: Max rounds still set to 3 [structural] traces: AC-003-04
    it('TC-M1-12: Max rounds value is still 3', () => {
        const c = getContent();
        const debateIdx = c.indexOf('DEBATE LOOP ORCHESTRATION');
        assert.ok(debateIdx !== -1, 'Must have DEBATE LOOP ORCHESTRATION section');
        const debateSection = c.substring(debateIdx);
        assert.ok(
            debateSection.includes('max_rounds') && debateSection.includes('3'),
            'Must contain max_rounds with value 3'
        );
    });
});

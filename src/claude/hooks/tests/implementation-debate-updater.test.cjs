/**
 * Tests for Implementation Updater Agent (Module M2)
 * Traces to: FR-002, AC-002-01..AC-002-06, NFR-001, NFR-003
 * Feature: REQ-0017-multi-agent-implementation-team
 * Validation Rules: VR-009..VR-015
 *
 * Target file: src/claude/agents/05-implementation-updater.md (NEW)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const UPDATER_PATH = path.resolve(__dirname, '..', '..', 'agents', '05-implementation-updater.md');

describe('M2: Implementation Updater Agent (05-implementation-updater.md)', () => {
    let content;

    function getContent() {
        if (!content) {
            assert.ok(fs.existsSync(UPDATER_PATH), 'Implementation updater agent file must exist at ' + UPDATER_PATH);
            content = fs.readFileSync(UPDATER_PATH, 'utf8');
        }
        return content;
    }

    // TC-M2-01: Agent file exists
    it('TC-M2-01: Implementation updater agent file exists', () => {
        assert.ok(fs.existsSync(UPDATER_PATH), 'Implementation updater agent file must exist');
    });

    // TC-M2-02: Agent frontmatter contains correct name
    it('TC-M2-02: Agent frontmatter contains name: implementation-updater', () => {
        const c = getContent();
        assert.ok(
            c.includes('name: implementation-updater'),
            'Must contain name: implementation-updater in frontmatter'
        );
    });

    // TC-M2-03: Agent frontmatter contains model: opus
    it('TC-M2-03: Agent frontmatter contains model: opus', () => {
        const c = getContent();
        assert.ok(
            c.includes('model: opus'),
            'Must contain model: opus in frontmatter'
        );
    });

    // TC-M2-04: Agent is orchestrator-only (debate mode constraint)
    it('TC-M2-04: Agent is invoked only by orchestrator', () => {
        const c = getContent();
        assert.ok(
            c.includes('ONLY invoked by the orchestrator'),
            'Must contain orchestrator-only invocation constraint'
        );
    });

    // TC-M2-05: Targeted fix protocol -- address ALL BLOCKING findings
    it('TC-M2-05: Address ALL BLOCKING findings rule documented', () => {
        const c = getContent().toLowerCase();
        assert.ok(
            c.includes('all blocking'),
            'Must contain rule to address ALL BLOCKING findings'
        );
    });

    // TC-M2-06: WARNING finding triage (fixed/deferred)
    it('TC-M2-06: WARNING triage with DEFERRED option documented', () => {
        const c = getContent();
        assert.ok(
            c.includes('DEFERRED') || c.includes('[DEFERRED]'),
            'Must document DEFERRED option for WARNING findings'
        );
        assert.ok(
            c.includes('WARNING'),
            'Must reference WARNING severity in triage'
        );
    });

    // TC-M2-07: Test re-run requirement after fixes
    it('TC-M2-07: Test re-run requirement documented', () => {
        const c = getContent().toLowerCase();
        assert.ok(
            (c.includes('re-run') || c.includes('rerun')) && c.includes('test'),
            'Must contain test re-run requirement after modifications'
        );
    });

    // TC-M2-08: Update report format specification
    it('TC-M2-08: Update report format with required sections', () => {
        const c = getContent();
        assert.ok(c.includes('# Update Report'), 'Must contain # Update Report section');
        assert.ok(c.includes('## Findings Addressed'), 'Must contain ## Findings Addressed section');
        assert.ok(c.includes('## Test Results'), 'Must contain ## Test Results section');
    });

    // TC-M2-09: Update report contains finding disposition
    it('TC-M2-09: Finding disposition options documented (fixed, deferred, disputed)', () => {
        const c = getContent().toLowerCase();
        assert.ok(c.includes('fixed'), 'Must document fixed disposition');
        assert.ok(c.includes('deferred'), 'Must document deferred disposition');
        assert.ok(c.includes('disputed'), 'Must document disputed disposition');
    });

    // TC-M2-10: Dispute mechanism with rationale requirement
    it('TC-M2-10: Dispute mechanism with rationale requirement', () => {
        const c = getContent().toLowerCase();
        assert.ok(c.includes('dispute'), 'Must contain dispute mechanism');
        assert.ok(c.includes('rationale'), 'Must contain rationale requirement');
    });

    // TC-M2-11: Dispute rationale minimum 20 characters
    it('TC-M2-11: Dispute rationale minimum 20 characters specified', () => {
        const c = getContent();
        assert.ok(
            c.includes('20') && c.toLowerCase().includes('character'),
            'Must specify 20-character minimum for dispute rationale'
        );
    });

    // TC-M2-12: Minimality rule (smallest change)
    it('TC-M2-12: Minimality rule documented', () => {
        const c = getContent().toLowerCase();
        assert.ok(
            c.includes('minimal') || c.includes('minimality') || c.includes('smallest change'),
            'Must contain minimality rule for fixes'
        );
    });

    // TC-M2-13: No scope creep rule
    it('TC-M2-13: No scope creep rule documented', () => {
        const c = getContent().toLowerCase();
        assert.ok(
            c.includes('scope creep') ||
            (c.includes('never introduce new features') && c.includes('never remove existing')),
            'Must contain no-scope-creep rule'
        );
    });

    // TC-M2-14: Single-file constraint (only modify reviewed file)
    it('TC-M2-14: Single-file constraint documented', () => {
        const c = getContent().toLowerCase();
        assert.ok(
            c.includes('never modify files other than') ||
            c.includes('only modify') ||
            c.includes('single file'),
            'Must contain single-file constraint -- only modify the file under review'
        );
    });

    // TC-M2-15: Changes Made section in update report format
    it('TC-M2-15: ## Changes Made section in update report format', () => {
        const c = getContent();
        assert.ok(
            c.includes('## Changes Made'),
            'Must contain ## Changes Made section in update report format'
        );
    });

    // TC-M2-16: Agent file size under 15KB
    it('TC-M2-16: Agent file size under 15KB', () => {
        const stats = fs.statSync(UPDATER_PATH);
        assert.ok(
            stats.size < 15 * 1024,
            `File size ${stats.size} bytes exceeds 15KB limit (${15 * 1024} bytes)`
        );
    });
});

/**
 * Tests for Command Spec Update (Module M4)
 * Traces to: FR-005, FR-006, AC-004-01, AC-005-01, AC-005-02
 * Feature: REQ-0008-backlog-management-integration
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const COMMAND_SPEC_PATH = path.resolve(__dirname, '..', '..', 'commands', 'isdlc.md');

describe('M4: Command Spec (isdlc.md) Backlog Updates', () => {
    let content;

    function getContent() {
        if (!content) {
            assert.ok(fs.existsSync(COMMAND_SPEC_PATH), 'isdlc.md command spec file must exist');
            content = fs.readFileSync(COMMAND_SPEC_PATH, 'utf8');
        }
        return content;
    }

    it('TC-M4-01: BACKLOG.md scanning reference in no-description flow', () => {
        const c = getContent();
        // Find the no-description feature flow section
        const featureIdx = c.indexOf('No-description behavior');
        assert.ok(featureIdx !== -1, 'Must have No-description behavior section');
        // Check that it references BACKLOG.md
        const nearbyContent = c.substring(featureIdx, featureIdx + 500);
        assert.ok(
            nearbyContent.includes('BACKLOG.md'),
            'No-description flow must reference BACKLOG.md as the scan source'
        );
    });

    it('TC-M4-02: Jira status sync in STEP 4 FINALIZE', () => {
        const c = getContent();
        const finalizeIdx = c.indexOf('STEP 4');
        assert.ok(finalizeIdx !== -1, 'Must have STEP 4 section');
        const finalizeSection = c.substring(finalizeIdx, finalizeIdx + 1000);
        const lower = finalizeSection.toLowerCase();
        assert.ok(
            lower.includes('jira') && lower.includes('sync'),
            'STEP 4 FINALIZE must contain Jira sync documentation'
        );
    });

    it('TC-M4-03: jira_ticket_id reference in finalize', () => {
        const c = getContent();
        const finalizeIdx = c.indexOf('STEP 4');
        assert.ok(finalizeIdx !== -1, 'Must have STEP 4 section');
        const finalizeSection = c.substring(finalizeIdx, finalizeIdx + 1000);
        assert.ok(
            finalizeSection.includes('jira_ticket_id'),
            'Finalize section must reference jira_ticket_id field'
        );
    });

    it('TC-M4-04: Non-blocking sync language in finalize', () => {
        const c = getContent();
        const finalizeIdx = c.indexOf('STEP 4');
        assert.ok(finalizeIdx !== -1, 'Must have STEP 4 section');
        const finalizeSection = c.substring(finalizeIdx, finalizeIdx + 1000);
        const lower = finalizeSection.toLowerCase();
        assert.ok(
            lower.includes('non-blocking') || lower.includes('do not block') || lower.includes('never block'),
            'Finalize Jira sync must be described as non-blocking'
        );
    });
});

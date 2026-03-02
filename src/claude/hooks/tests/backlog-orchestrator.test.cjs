/**
 * Tests for Orchestrator Backlog Picker + Init + Sync (Module M2a/M2b/M2c)
 * Traces to: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, NFR-002, NFR-003, NFR-005
 * Feature: REQ-0008-backlog-management-integration
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ORCHESTRATOR_PATH = path.resolve(__dirname, '..', '..', 'agents', '00-sdlc-orchestrator.md');

describe('M2: Orchestrator Backlog Picker + Init + Sync', () => {
    let content;

    function getContent() {
        if (!content) {
            assert.ok(fs.existsSync(ORCHESTRATOR_PATH), 'Orchestrator agent file must exist');
            content = fs.readFileSync(ORCHESTRATOR_PATH, 'utf8');
        }
        return content;
    }

    // --- M2a: Backlog Picker ---

    describe('M2a: Backlog Picker', () => {
        it('TC-M2a-01: Backlog picker reads BACKLOG.md', () => {
            const c = getContent();
            // Find the BACKLOG PICKER section
            const pickerIdx = c.indexOf('BACKLOG PICKER');
            assert.ok(pickerIdx !== -1, 'Must have BACKLOG PICKER section');
            const pickerSection = c.substring(pickerIdx);

            assert.ok(
                pickerSection.includes('BACKLOG.md'),
                'Backlog picker section must reference BACKLOG.md as the scan source'
            );
        });

        it('TC-M2a-02: Open section scanning instruction', () => {
            const c = getContent();
            const pickerIdx = c.indexOf('BACKLOG PICKER');
            assert.ok(pickerIdx !== -1, 'Must have BACKLOG PICKER section');
            const pickerSection = c.substring(pickerIdx);

            assert.ok(
                pickerSection.includes('## Open') || pickerSection.includes('Open section'),
                'Must reference scanning the ## Open section'
            );
        });

        it('TC-M2a-03: Jira metadata parsing instructions present', () => {
            const c = getContent();
            const pickerIdx = c.indexOf('BACKLOG PICKER');
            assert.ok(pickerIdx !== -1, 'Must have BACKLOG PICKER section');
            const pickerSection = c.substring(pickerIdx);

            assert.ok(
                pickerSection.includes('**Jira:**'),
                'Must reference parsing **Jira:** sub-bullets'
            );
            assert.ok(
                pickerSection.includes('**Confluence:**'),
                'Must reference parsing **Confluence:** sub-bullets'
            );
        });

        it('TC-M2a-04: Jira tag display in picker options', () => {
            const c = getContent();
            const pickerIdx = c.indexOf('BACKLOG PICKER');
            assert.ok(pickerIdx !== -1, 'Must have BACKLOG PICKER section');
            const pickerSection = c.substring(pickerIdx);

            assert.ok(
                pickerSection.includes('[Jira:'),
                'Must contain [Jira: display format reference for picker options'
            );
        });

        it('TC-M2a-05: Backward compatibility fallback to CLAUDE.md', () => {
            const c = getContent();
            const pickerIdx = c.indexOf('BACKLOG PICKER');
            assert.ok(pickerIdx !== -1, 'Must have BACKLOG PICKER section');
            const pickerSection = c.substring(pickerIdx);

            assert.ok(
                (pickerSection.includes('fallback') || pickerSection.includes('fall back')) &&
                pickerSection.includes('CLAUDE.md'),
                'Must describe fallback to CLAUDE.md when BACKLOG.md is absent'
            );
        });

        it('TC-M2a-06: Item format regex reference', () => {
            const c = getContent();
            const pickerIdx = c.indexOf('BACKLOG PICKER');
            assert.ok(pickerIdx !== -1, 'Must have BACKLOG PICKER section');
            const pickerSection = c.substring(pickerIdx);

            // Must reference item number + checkbox + text pattern
            const lower = pickerSection.toLowerCase();
            assert.ok(
                (lower.includes('item number') || lower.includes('n.n') || lower.includes('\\d+')) &&
                (lower.includes('checkbox') || lower.includes('[ ]') || lower.includes('[x]')),
                'Must reference item number + checkbox pattern'
            );
        });
    });

    // --- M2b: Workflow Init ---

    describe('M2b: Workflow Init', () => {
        it('TC-M2b-01: jira_ticket_id field in active_workflow', () => {
            const c = getContent();
            assert.ok(
                c.includes('jira_ticket_id'),
                'Must contain jira_ticket_id field reference'
            );
        });

        it('TC-M2b-02: confluence_urls field in active_workflow', () => {
            const c = getContent();
            assert.ok(
                c.includes('confluence_urls'),
                'Must contain confluence_urls field reference'
            );
        });

        it('TC-M2b-03: Local-only items omit Jira fields', () => {
            const c = getContent();
            const lower = c.toLowerCase();
            assert.ok(
                lower.includes('omit') || lower.includes('absent') || lower.includes('not set'),
                'Must describe that Jira fields are omitted for local-only items'
            );
        });
    });

    // --- M2c: Finalize Sync ---

    describe('M2c: Finalize Sync', () => {
        it('TC-M2c-01: Non-blocking Jira sync step in finalize', () => {
            const c = getContent();
            const lower = c.toLowerCase();
            assert.ok(
                lower.includes('jira') && lower.includes('sync') && lower.includes('non-blocking'),
                'Must have non-blocking Jira sync step in finalize flow'
            );
        });

        it('TC-M2c-02: updateStatus call to transition to Done', () => {
            const c = getContent();
            assert.ok(
                c.includes('Done') || c.includes('done'),
                'Must reference transitioning Jira ticket to "Done" status'
            );
            const lower = c.toLowerCase();
            assert.ok(
                lower.includes('updatestatus') || lower.includes('transition'),
                'Must reference updateStatus or transition call'
            );
        });

        it('TC-M2c-03: jira_sync_status in workflow_history', () => {
            const c = getContent();
            assert.ok(
                c.includes('jira_sync_status'),
                'Must contain jira_sync_status field reference'
            );
            assert.ok(
                c.includes('synced') && c.includes('failed'),
                'Must document "synced" and "failed" jira_sync_status values'
            );
        });

        it('TC-M2c-04: Finalize never blocks on Jira failure', () => {
            const c = getContent();
            const lower = c.toLowerCase();
            // Find finalize-related content
            assert.ok(
                (lower.includes('non-blocking') || lower.includes('do not block') || lower.includes('never block')) &&
                (lower.includes('jira') || lower.includes('sync')),
                'Must explicitly state that Jira sync failure does NOT block workflow completion'
            );
        });

        it('TC-M2c-05: BACKLOG.md completion update in finalize', () => {
            const c = getContent();
            assert.ok(
                c.includes('[x]'),
                'Must reference marking item as [x]'
            );
            assert.ok(
                c.includes('Completed') && (c.includes('move') || c.includes('Move')),
                'Must reference moving item to Completed section'
            );
        });
    });
});

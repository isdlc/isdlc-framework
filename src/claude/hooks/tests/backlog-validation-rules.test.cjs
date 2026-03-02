/**
 * Tests for Validation Rules VR-001 through VR-018
 * Traces to: FR-001..FR-006, VR-001..VR-018
 * Feature: REQ-0008-backlog-management-integration
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const VALIDATION_RULES_PATH = path.resolve(
    __dirname, '..', '..', '..', '..', 'docs', 'requirements',
    'REQ-0008-backlog-management-integration', 'validation-rules.json'
);

// Also check the CLAUDE.md.template and orchestrator for documented content
const TEMPLATE_PATH = path.resolve(__dirname, '..', '..', 'CLAUDE.md.template');
const ORCHESTRATOR_PATH = path.resolve(__dirname, '..', '..', 'agents', '00-sdlc-orchestrator.md');

describe('Validation Rules (VR-001 through VR-018)', () => {
    let rules;

    function getRules() {
        if (!rules) {
            assert.ok(fs.existsSync(VALIDATION_RULES_PATH), 'validation-rules.json must exist');
            rules = JSON.parse(fs.readFileSync(VALIDATION_RULES_PATH, 'utf8'));
        }
        return rules;
    }

    // VR-001: BACKLOG.md item line regex
    it('TC-VR-001: BACKLOG.md item line regex matches valid and rejects invalid', () => {
        const r = getRules();
        const ruleObj = r.rules.backlog_item_format;
        assert.ok(ruleObj, 'VR-001 rule must exist');
        assert.equal(ruleObj.id, 'VR-001');

        const regex = new RegExp(ruleObj.regex);

        // Valid examples
        for (const valid of ruleObj.examples.valid) {
            assert.ok(regex.test(valid), `VR-001 regex must match valid: "${valid}"`);
        }

        // Invalid examples
        for (const invalid of ruleObj.examples.invalid) {
            assert.ok(!regex.test(invalid), `VR-001 regex must NOT match invalid: "${invalid}"`);
        }
    });

    // VR-002: Metadata sub-bullet regex
    it('TC-VR-002: Metadata sub-bullet regex matches valid and rejects invalid', () => {
        const r = getRules();
        const ruleObj = r.rules.metadata_sub_bullet_format;
        assert.ok(ruleObj, 'VR-002 rule must exist');
        assert.equal(ruleObj.id, 'VR-002');

        const regex = new RegExp(ruleObj.regex);

        for (const valid of ruleObj.examples.valid) {
            assert.ok(regex.test(valid), `VR-002 regex must match valid: "${valid}"`);
        }

        for (const invalid of ruleObj.examples.invalid) {
            assert.ok(!regex.test(invalid), `VR-002 regex must NOT match invalid: "${invalid}"`);
        }
    });

    // VR-003: Jira ticket ID regex
    it('TC-VR-003: Jira ticket ID regex matches valid and rejects invalid', () => {
        const r = getRules();
        const ruleObj = r.rules.jira_ticket_id_format;
        assert.ok(ruleObj, 'VR-003 rule must exist');
        assert.equal(ruleObj.id, 'VR-003');

        const regex = new RegExp(ruleObj.regex);

        for (const valid of ruleObj.examples.valid) {
            assert.ok(regex.test(valid), `VR-003 regex must match valid: "${valid}"`);
        }

        for (const invalid of ruleObj.examples.invalid) {
            assert.ok(!regex.test(invalid), `VR-003 regex must NOT match invalid: "${invalid}"`);
        }
    });

    // VR-004: Confluence URL format
    it('TC-VR-004: Confluence URL format matches valid and rejects invalid', () => {
        const r = getRules();
        const ruleObj = r.rules.confluence_url_format;
        assert.ok(ruleObj, 'VR-004 rule must exist');
        assert.equal(ruleObj.id, 'VR-004');

        const regex = new RegExp(ruleObj.regex);

        for (const valid of ruleObj.examples.valid) {
            assert.ok(regex.test(valid), `VR-004 regex must match valid: "${valid}"`);
        }

        for (const invalid of ruleObj.examples.invalid) {
            assert.ok(!regex.test(invalid), `VR-004 regex must NOT match invalid: "${invalid}"`);
        }
    });

    // VR-005: Priority enum values
    it('TC-VR-005: Priority enum values recognized', () => {
        const r = getRules();
        const ruleObj = r.rules.priority_enum;
        assert.ok(ruleObj, 'VR-005 rule must exist');
        assert.equal(ruleObj.id, 'VR-005');

        const expected = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];
        assert.deepEqual(ruleObj.allowed_values, expected, 'Must have all 5 priority values');
        assert.ok(
            ruleObj.behavior_on_unknown && ruleObj.behavior_on_unknown.toLowerCase().includes('accept'),
            'Unknown values must be accepted (Jira custom priorities)'
        );
    });

    // VR-006: Description truncation at 200 chars
    it('TC-VR-006: Description truncation at 200 chars', () => {
        const r = getRules();
        const ruleObj = r.rules.description_truncation;
        assert.ok(ruleObj, 'VR-006 rule must exist');
        assert.equal(ruleObj.id, 'VR-006');
        assert.equal(ruleObj.max_length, 200, 'Max length must be 200');
        assert.equal(ruleObj.truncation_suffix, '...', 'Truncation suffix must be "..."');

        // Test truncation logic
        const longDesc = 'A'.repeat(250);
        const truncated = longDesc.length > ruleObj.max_length
            ? longDesc.substring(0, ruleObj.max_length) + ruleObj.truncation_suffix
            : longDesc;
        assert.equal(truncated.length, 203, 'Truncated desc should be 200 + 3 (suffix)');

        const shortDesc = 'Short description';
        const notTruncated = shortDesc.length > ruleObj.max_length
            ? shortDesc.substring(0, ruleObj.max_length) + ruleObj.truncation_suffix
            : shortDesc;
        assert.equal(notTruncated, shortDesc, 'Short descriptions should not be truncated');
    });

    // VR-007: Confluence content truncation at 5000 chars
    it('TC-VR-007: Confluence content truncation at 5000 chars', () => {
        const r = getRules();
        const ruleObj = r.rules.confluence_content_truncation;
        assert.ok(ruleObj, 'VR-007 rule must exist');
        assert.equal(ruleObj.id, 'VR-007');
        assert.equal(ruleObj.max_length, 5000, 'Max length must be 5000');
        assert.equal(ruleObj.error_on_truncate, 'BLG-E022', 'Error on truncation must be BLG-E022');
    });

    // VR-008: Required section headers
    it('TC-VR-008: Required section headers (## Open and ## Completed)', () => {
        const r = getRules();
        const ruleObj = r.rules.section_headers_required;
        assert.ok(ruleObj, 'VR-008 rule must exist');
        assert.equal(ruleObj.id, 'VR-008');
        assert.deepEqual(ruleObj.required_sections, ['## Open', '## Completed']);
        assert.equal(ruleObj.error_on_missing_open, 'BLG-E031');
        assert.equal(ruleObj.error_on_missing_completed, 'BLG-E032');
    });

    // VR-009: Item number uniqueness
    it('TC-VR-009: Item number uniqueness check', () => {
        const r = getRules();
        const ruleObj = r.rules.item_number_uniqueness;
        assert.ok(ruleObj, 'VR-009 rule must exist');
        assert.equal(ruleObj.id, 'VR-009');
        assert.equal(ruleObj.error_on_duplicate, 'BLG-E035');
        assert.equal(ruleObj.severity, 'warning');
    });

    // VR-010: Jira-backed detection rule
    it('TC-VR-010: Jira-backed detection rule', () => {
        const r = getRules();
        const ruleObj = r.rules.jira_backed_detection;
        assert.ok(ruleObj, 'VR-010 rule must exist');
        assert.equal(ruleObj.id, 'VR-010');
        assert.equal(ruleObj.detection_key, 'Jira');

        // Test detection logic: item with **Jira:** sub-bullet is Jira-backed
        const jiraItem = '- 7.7 [ ] Title\n  - **Jira:** PROJ-1234';
        const localItem = '- 7.7 [ ] Title\n  - **Priority:** High';
        assert.ok(jiraItem.includes('**Jira:**'), 'Jira-backed item must have **Jira:** sub-bullet');
        assert.ok(!localItem.includes('**Jira:**'), 'Local item must not have **Jira:** sub-bullet');
    });

    // VR-011: state.json Jira fields optional
    it('TC-VR-011: state.json Jira fields are optional', () => {
        const r = getRules();
        const ruleObj = r.rules.state_json_jira_fields;
        assert.ok(ruleObj, 'VR-011 rule must exist');
        assert.equal(ruleObj.id, 'VR-011');
        assert.equal(ruleObj.fields.jira_ticket_id.required, false);
        assert.equal(ruleObj.fields.confluence_urls.required, false);

        // Test optional field semantics
        const withJira = { jira_ticket_id: 'PROJ-1234', confluence_urls: ['https://wiki.example.com'] };
        const withoutJira = {};
        assert.ok(withJira.jira_ticket_id != null, 'Jira-backed workflow has jira_ticket_id');
        assert.ok(withoutJira.jira_ticket_id == null, 'Local workflow has no jira_ticket_id');
    });

    // VR-012: jira_sync_status enum
    it('TC-VR-012: jira_sync_status enum values', () => {
        const r = getRules();
        const ruleObj = r.rules.jira_sync_status_enum;
        assert.ok(ruleObj, 'VR-012 rule must exist');
        assert.equal(ruleObj.id, 'VR-012');
        assert.deepEqual(ruleObj.allowed_values, ['synced', 'failed', null]);
    });

    // VR-013: Completed date ISO 8601 format
    it('TC-VR-013: Completed date ISO 8601 format', () => {
        const r = getRules();
        const ruleObj = r.rules.completed_date_format;
        assert.ok(ruleObj, 'VR-013 rule must exist');
        assert.equal(ruleObj.id, 'VR-013');

        const regex = new RegExp(ruleObj.regex);

        for (const valid of ruleObj.examples.valid) {
            assert.ok(regex.test(valid), `VR-013 must match valid date: "${valid}"`);
        }

        for (const invalid of ruleObj.examples.invalid) {
            assert.ok(!regex.test(invalid), `VR-013 must NOT match invalid date: "${invalid}"`);
        }
    });

    // VR-014: Max 15 items in backlog picker
    it('TC-VR-014: Max 15 items in backlog picker documented', () => {
        const r = getRules();
        const ruleObj = r.rules.max_backlog_items_in_picker;
        assert.ok(ruleObj, 'VR-014 rule must exist');
        assert.equal(ruleObj.id, 'VR-014');
        assert.equal(ruleObj.max_items, 15);

        // Also verify this is documented in the orchestrator
        assert.ok(fs.existsSync(ORCHESTRATOR_PATH), 'Orchestrator must exist');
        const orchContent = fs.readFileSync(ORCHESTRATOR_PATH, 'utf8');
        assert.ok(orchContent.includes('15'), 'Orchestrator must reference 15-item limit');
    });

    // VR-015: Completion move-to-section steps
    it('TC-VR-015: Completion move-to-section steps documented', () => {
        const r = getRules();
        const ruleObj = r.rules.completion_move_to_section;
        assert.ok(ruleObj, 'VR-015 rule must exist');
        assert.equal(ruleObj.id, 'VR-015');
        assert.ok(ruleObj.steps.length >= 3, 'Must have at least 3 completion steps');

        // Verify documented in orchestrator
        const orchContent = fs.readFileSync(ORCHESTRATOR_PATH, 'utf8');
        assert.ok(orchContent.includes('[x]'), 'Orchestrator must reference [x] marking');
    });

    // VR-016: Refresh conflict resolution
    it('TC-VR-016: Refresh conflict resolution documented', () => {
        const r = getRules();
        const ruleObj = r.rules.refresh_conflict_resolution;
        assert.ok(ruleObj, 'VR-016 rule must exist');
        assert.equal(ruleObj.id, 'VR-016');
        assert.equal(ruleObj.rules.title, 'Jira wins (overwrite local)');
        assert.equal(ruleObj.rules.ordering, 'Local wins (preserve)');
    });

    // VR-017: Reorder is local-only
    it('TC-VR-017: Reorder is local-only', () => {
        const r = getRules();
        const ruleObj = r.rules.reorder_local_only;
        assert.ok(ruleObj, 'VR-017 rule must exist');
        assert.equal(ruleObj.id, 'VR-017');
        assert.ok(
            ruleObj.description.toLowerCase().includes('local-only'),
            'Must describe reorder as local-only operation'
        );
    });

    // VR-018: Workflow type from Jira issue type
    it('TC-VR-018: Workflow type from Jira issue type', () => {
        const r = getRules();
        const ruleObj = r.rules.workflow_type_from_jira;
        assert.ok(ruleObj, 'VR-018 rule must exist');
        assert.equal(ruleObj.id, 'VR-018');
        assert.equal(ruleObj.rules.Bug, 'fix');
        assert.equal(ruleObj.rules.Story, 'feature');
        assert.equal(ruleObj.rules.Task, 'feature');
        assert.equal(ruleObj.rules.Epic, 'feature');
        assert.equal(ruleObj.rules.other, 'ask_user');
    });
});

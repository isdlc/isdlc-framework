/**
 * Tests for CLAUDE.md.template Backlog Management section (Module M1)
 * Traces to: FR-001, FR-007, FR-008, FR-009, AC-006-01, AC-006-02, AC-007-01, AC-007-02
 * Feature: REQ-0008-backlog-management-integration
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.resolve(__dirname, '..', '..', 'CLAUDE.md.template');

describe('M1: CLAUDE.md.template Backlog Management section', () => {
    let content;

    // Read file once before all tests
    it('TC-M1-00: CLAUDE.md.template file exists and is readable', () => {
        assert.ok(fs.existsSync(TEMPLATE_PATH), 'CLAUDE.md.template must exist');
        content = fs.readFileSync(TEMPLATE_PATH, 'utf8');
        assert.ok(content.length > 0, 'File must not be empty');
    });

    // Helper to ensure content is loaded
    function getContent() {
        if (!content) {
            content = fs.readFileSync(TEMPLATE_PATH, 'utf8');
        }
        return content;
    }

    it('TC-M1-01: Backlog Management section header exists', () => {
        const c = getContent();
        assert.ok(c.includes('## Backlog Management'), 'Must contain "## Backlog Management" section header');
    });

    it('TC-M1-02: BACKLOG.md format convention subsection exists', () => {
        const c = getContent();
        assert.ok(
            c.includes('### BACKLOG.md Format Convention') || c.includes('### BACKLOG.md Format'),
            'Must contain BACKLOG.md Format Convention subsection'
        );
    });

    it('TC-M1-03: Item line format documented with regex', () => {
        const c = getContent();
        // Should contain the item line regex or its human-readable description
        const hasRegex = c.includes('\\d+(?:\\.\\d+)*') || c.includes('N.N') || c.includes('item number');
        const hasCheckbox = c.includes('[ ]') || c.includes('[x]') || c.includes('[~]');
        assert.ok(hasRegex && hasCheckbox, 'Must document item line format with number + checkbox pattern');
    });

    it('TC-M1-04: Metadata sub-bullet format documented', () => {
        const c = getContent();
        // All four metadata key references must be present
        assert.ok(c.includes('**Jira:**'), 'Must document **Jira:** metadata key');
        assert.ok(c.includes('**Priority:**'), 'Must document **Priority:** metadata key');
        assert.ok(c.includes('**Confluence:**'), 'Must document **Confluence:** metadata key');
        assert.ok(c.includes('**Status:**'), 'Must document **Status:** metadata key');
    });

    it('TC-M1-05: Backlog Operations subsection with intent detection table', () => {
        const c = getContent();
        assert.ok(
            c.includes('### Backlog Operations') || c.includes('Backlog Operations'),
            'Must contain Backlog Operations subsection'
        );
        // Table should have at least 5 intent rows (add, refresh, reorder, work, view)
        const tableRows = c.match(/\|[^|]+\|[^|]+\|/g) || [];
        // Find rows within the Backlog Operations section
        const opsSection = c.substring(c.indexOf('Backlog Operations'));
        const intentPatterns = ['add', 'refresh', 'reorder', 'work', 'view'];
        let matchCount = 0;
        for (const pattern of intentPatterns) {
            if (opsSection.toLowerCase().includes(pattern)) matchCount++;
        }
        assert.ok(matchCount >= 5, `Must have at least 5 intent patterns documented, found ${matchCount}`);
    });

    it('TC-M1-06: backlog-add intent documented', () => {
        const c = getContent();
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('add') && (lower.includes('backlog') || lower.includes('import') || lower.includes('pull')),
            'Must document add/import intent pattern'
        );
        assert.ok(
            lower.includes('mcp') && lower.includes('backlog.md'),
            'Must reference MCP pull + append to BACKLOG.md behavior'
        );
    });

    it('TC-M1-07: backlog-refresh intent documented', () => {
        const c = getContent();
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('refresh') || lower.includes('sync'),
            'Must document refresh/sync intent pattern'
        );
    });

    it('TC-M1-08: backlog-reorder intent documented', () => {
        const c = getContent();
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('reorder') || lower.includes('move') || lower.includes('prioritize'),
            'Must document reorder/move/prioritize intent pattern'
        );
    });

    it('TC-M1-09: backlog-work intent documented', () => {
        const c = getContent();
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('work on') || lower.includes('start'),
            'Must document work/start intent pattern'
        );
    });

    it('TC-M1-10: MCP Prerequisite Check subsection exists', () => {
        const c = getContent();
        assert.ok(
            c.includes('MCP Prerequisite') || c.includes('MCP Check') || c.includes('MCP Prerequisites'),
            'Must contain MCP Prerequisite Check subsection'
        );
        const lower = c.toLowerCase();
        assert.ok(
            lower.includes('atlassian') && lower.includes('mcp'),
            'Must describe checking for Atlassian MCP server'
        );
    });

    it('TC-M1-11: MCP setup command documented', () => {
        const c = getContent();
        assert.ok(
            c.includes('claude mcp add') && c.includes('atlassian'),
            'Must contain the MCP setup command for Atlassian'
        );
    });

    it('TC-M1-12: Graceful degradation language present', () => {
        const c = getContent();
        const lower = c.toLowerCase();
        assert.ok(
            (lower.includes('local') && lower.includes('without mcp')) ||
            (lower.includes('graceful') && lower.includes('degradation')) ||
            (lower.includes('local') && lower.includes('still work')),
            'Must contain graceful degradation language for local operations without MCP'
        );
    });

    it('TC-M1-13: Adapter Interface subsection exists with three methods', () => {
        const c = getContent();
        assert.ok(
            c.includes('Adapter Interface') || c.includes('Adapter'),
            'Must contain Adapter Interface subsection'
        );
        assert.ok(c.includes('getTicket'), 'Must document getTicket method');
        assert.ok(c.includes('updateStatus'), 'Must document updateStatus method');
        assert.ok(c.includes('getLinkedDocument'), 'Must document getLinkedDocument method');
    });

    it('TC-M1-14: No new slash commands introduced', () => {
        const c = getContent();
        // Extract the Backlog Management section
        const startIdx = c.indexOf('## Backlog Management');
        assert.ok(startIdx !== -1, 'Backlog Management section must exist');

        // Find the next ## section header after Backlog Management
        const afterSection = c.substring(startIdx + 1);
        const nextSectionMatch = afterSection.match(/\n## [^\n]+/);
        const endIdx = nextSectionMatch ? startIdx + 1 + nextSectionMatch.index : c.length;
        const section = c.substring(startIdx, endIdx);

        assert.ok(!section.includes('user_invocable:'), 'Backlog section must not define slash commands');
        assert.ok(!section.includes('/backlog'), 'Must not introduce /backlog command');
        assert.ok(!section.includes('/jira'), 'Must not introduce /jira command');
    });

    it('TC-M1-15: Section placement is correct', () => {
        const c = getContent();
        const providerIdx = c.indexOf('## LLM Provider Configuration');
        const backlogIdx = c.indexOf('## Backlog Management');
        const agentIdx = c.indexOf('## Agent Framework Context');

        assert.ok(providerIdx !== -1, 'LLM Provider Configuration section must exist');
        assert.ok(backlogIdx !== -1, 'Backlog Management section must exist');
        assert.ok(agentIdx !== -1, 'Agent Framework Context section must exist');

        assert.ok(backlogIdx > providerIdx, 'Backlog Management must appear after LLM Provider Configuration');
        assert.ok(backlogIdx < agentIdx, 'Backlog Management must appear before Agent Framework Context');
    });

    it('TC-M1-16: No credential references in backlog section', () => {
        const c = getContent();
        const startIdx = c.indexOf('## Backlog Management');
        assert.ok(startIdx !== -1, 'Backlog Management section must exist');

        const afterSection = c.substring(startIdx + 1);
        const nextSectionMatch = afterSection.match(/\n## [^\n]+/);
        const endIdx = nextSectionMatch ? startIdx + 1 + nextSectionMatch.index : c.length;
        const section = c.substring(startIdx, endIdx).toLowerCase();

        // Check for credential-related instruction values (not just mentions in error handling context)
        const credentialPatterns = ['api_key=', 'token=', 'password=', 'secret='];
        for (const pattern of credentialPatterns) {
            assert.ok(!section.includes(pattern), `Backlog section must not contain credential instruction "${pattern}"`);
        }
    });
});

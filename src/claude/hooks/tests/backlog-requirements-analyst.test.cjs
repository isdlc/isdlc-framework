/**
 * Tests for Requirements Analyst Confluence Context section (Module M3)
 * Traces to: FR-005, AC-004-02, AC-004-03, NFR-003
 * Feature: REQ-0008-backlog-management-integration
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ANALYST_PATH = path.resolve(__dirname, '..', '..', 'agents', '01-requirements-analyst.md');

describe('M3: Requirements Analyst Confluence Context', () => {
    let content;

    function getContent() {
        if (!content) {
            assert.ok(fs.existsSync(ANALYST_PATH), 'Requirements analyst agent file must exist');
            content = fs.readFileSync(ANALYST_PATH, 'utf8');
        }
        return content;
    }

    it('TC-M3-01: Confluence Context section header exists', () => {
        const c = getContent();
        assert.ok(
            c.includes('CONFLUENCE CONTEXT') || c.includes('Confluence Context'),
            'Must contain a Confluence Context section header'
        );
    });

    it('TC-M3-02: confluence_urls check instruction present', () => {
        const c = getContent();
        assert.ok(
            c.includes('confluence_urls'),
            'Must reference active_workflow.confluence_urls check'
        );
    });

    it('TC-M3-03: MCP getLinkedDocument call instruction', () => {
        const c = getContent();
        const lower = c.toLowerCase();
        assert.ok(
            (lower.includes('mcp') || lower.includes('atlassian')) &&
            (lower.includes('confluence') && (lower.includes('page') || lower.includes('content'))),
            'Must describe MCP call to pull Confluence page content'
        );
    });

    it('TC-M3-04: 5000 character truncation documented', () => {
        const c = getContent();
        assert.ok(
            c.includes('5000'),
            'Must specify 5000 character truncation limit for Confluence content'
        );
    });

    it('TC-M3-05: Graceful degradation for missing Confluence', () => {
        const c = getContent();
        const lower = c.toLowerCase();
        assert.ok(
            (lower.includes('skip') || lower.includes('absent') || lower.includes('empty')) &&
            (lower.includes('confluence') || lower.includes('local')),
            'Must describe skipping Confluence context when URLs are absent/empty'
        );
    });

    it('TC-M3-06: Context mapping table present', () => {
        const c = getContent();
        const lower = c.toLowerCase();
        // Must have a mapping showing Confluence content -> requirements stages
        assert.ok(
            (lower.includes('spec') || lower.includes('prd') || lower.includes('design')) &&
            (lower.includes('stage') || lower.includes('context') || lower.includes('business')),
            'Must contain mapping of Confluence content to requirements stages'
        );
    });
});

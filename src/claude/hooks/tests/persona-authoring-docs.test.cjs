/**
 * Unit Tests: M6 Documentation Validation -- REQ-0050
 *
 * Tests structure and completeness of persona-authoring-guide.md.
 *
 * Traces: FR-007, AC-007-01 through AC-007-06
 * @module persona-authoring-docs.test
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const GUIDE_PATH = path.join(PROJECT_ROOT, 'docs', 'isdlc', 'persona-authoring-guide.md');

// ---------------------------------------------------------------------------
// Documentation Validation Tests
// Traces: AC-007-01 through AC-007-06
// ---------------------------------------------------------------------------

describe('M6: Documentation Validation -- REQ-0050', () => {
    it('TC-DOC-01: documentation covers creating from template', () => {
        // AC-007-01
        assert.ok(fs.existsSync(GUIDE_PATH), `Guide should exist at ${GUIDE_PATH}`);
        const content = fs.readFileSync(GUIDE_PATH, 'utf8').toLowerCase();
        assert.ok(
            content.includes('domain expert') || content.includes('template'),
            'Guide should cover creating from Domain Expert template'
        );
    });

    it('TC-DOC-02: documentation covers overriding built-in', () => {
        // AC-007-02
        const content = fs.readFileSync(GUIDE_PATH, 'utf8').toLowerCase();
        assert.ok(
            content.includes('.isdlc/personas') && (content.includes('override') || content.includes('copy')),
            'Guide should cover override-by-copy to .isdlc/personas/'
        );
    });

    it('TC-DOC-03: documentation covers disabling via config', () => {
        // AC-007-03
        const content = fs.readFileSync(GUIDE_PATH, 'utf8').toLowerCase();
        assert.ok(
            content.includes('roundtable.yaml') && content.includes('disabled'),
            'Guide should cover disabling personas via roundtable.yaml'
        );
    });

    it('TC-DOC-04: documentation covers four analysis modes', () => {
        // AC-007-04
        const content = fs.readFileSync(GUIDE_PATH, 'utf8').toLowerCase();
        assert.ok(content.includes('conversational'), 'Guide should mention conversational mode');
        assert.ok(content.includes('bulleted'), 'Guide should mention bulleted mode');
        assert.ok(content.includes('silent'), 'Guide should mention silent mode');
        assert.ok(
            content.includes('no-persona') || content.includes('no persona') || content.includes('straight analysis'),
            'Guide should mention no-persona/straight analysis mode'
        );
    });

    it('TC-DOC-05: documentation covers frontmatter schema', () => {
        // AC-007-05
        const content = fs.readFileSync(GUIDE_PATH, 'utf8').toLowerCase();
        const requiredFields = ['name', 'description', 'role_type', 'triggers', 'owned_skills', 'version'];
        for (const field of requiredFields) {
            assert.ok(
                content.includes(field),
                `Guide should document frontmatter field: ${field}`
            );
        }
    });

    it('TC-DOC-06: documentation is linked from discoverable location', () => {
        // AC-007-06
        const claudeMd = path.join(PROJECT_ROOT, 'CLAUDE.md');
        let linked = false;
        if (fs.existsSync(claudeMd)) {
            const content = fs.readFileSync(claudeMd, 'utf8');
            linked = content.includes('persona-authoring-guide');
        }
        const readmePath = path.join(PROJECT_ROOT, 'README.md');
        if (!linked && fs.existsSync(readmePath)) {
            const content = fs.readFileSync(readmePath, 'utf8');
            linked = content.includes('persona-authoring-guide');
        }
        assert.ok(linked, 'Guide should be linked from CLAUDE.md or README.md');
    });
});

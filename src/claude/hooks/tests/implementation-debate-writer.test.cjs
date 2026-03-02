/**
 * Tests for Writer Role Awareness in Software Developer (Module M4)
 * Traces to: FR-004, AC-004-01..AC-004-03
 * Feature: REQ-0017-multi-agent-implementation-team
 * Validation Rules: VR-027..VR-029
 *
 * Target file: src/claude/agents/05-software-developer.md (MODIFIED)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const WRITER_PATH = path.resolve(__dirname, '..', '..', 'agents', '05-software-developer.md');

describe('M4: Writer Role Awareness (05-software-developer.md)', () => {
    let content;

    function getContent() {
        if (!content) {
            assert.ok(fs.existsSync(WRITER_PATH), 'Software developer agent file must exist at ' + WRITER_PATH);
            content = fs.readFileSync(WRITER_PATH, 'utf8');
        }
        return content;
    }

    describe('WRITER_CONTEXT Detection', () => {
        // TC-M4-01: WRITER MODE DETECTION section exists
        it('TC-M4-01: WRITER MODE DETECTION section exists', () => {
            const c = getContent();
            assert.ok(
                c.includes('WRITER MODE DETECTION') || c.includes('WRITER_CONTEXT'),
                'Must contain WRITER MODE DETECTION section'
            );
        });

        // TC-M4-02: WRITER_CONTEXT conditional logic documented
        it('TC-M4-02: WRITER_CONTEXT conditional logic documented', () => {
            const c = getContent();
            assert.ok(c.includes('WRITER_CONTEXT'), 'Must reference WRITER_CONTEXT');
            assert.ok(
                c.includes('IF') && c.includes('WRITER_CONTEXT'),
                'Must document WRITER_CONTEXT conditional detection logic'
            );
        });

        // TC-M4-03: per_file_loop flag detection
        it('TC-M4-03: per_file_loop flag detection', () => {
            const c = getContent();
            assert.ok(
                c.includes('per_file_loop'),
                'Must detect per_file_loop flag in WRITER_CONTEXT'
            );
        });

        // TC-M4-04: mode: writer detection
        it('TC-M4-04: mode: writer detection', () => {
            const c = getContent();
            assert.ok(
                c.includes('mode') && (c.includes('"writer"') || c.includes('mode: writer') || c.includes('mode == "writer"')),
                'Must detect mode: writer in WRITER_CONTEXT'
            );
        });
    });

    describe('Writer Protocol', () => {
        // TC-M4-05: Sequential file production (one file at a time)
        it('TC-M4-05: Sequential file production -- one file at a time', () => {
            const c = getContent().toLowerCase();
            assert.ok(
                c.includes('one file') || c.includes('one file at a time') || c.includes('single file'),
                'Must document sequential file production -- one file at a time'
            );
        });

        // TC-M4-06: FILE_PRODUCED announcement format
        it('TC-M4-06: FILE_PRODUCED announcement format documented', () => {
            const c = getContent();
            assert.ok(
                c.includes('FILE_PRODUCED'),
                'Must document FILE_PRODUCED announcement format'
            );
        });

        // TC-M4-07: TDD file ordering (test file first)
        it('TC-M4-07: TDD file ordering -- test file before production', () => {
            const c = getContent();
            assert.ok(
                c.includes('tdd_ordering') || c.includes('TDD'),
                'Must reference TDD ordering'
            );
            const lower = c.toLowerCase();
            assert.ok(
                lower.includes('test file first') || lower.includes('test file') && lower.includes('first'),
                'Must document TDD file ordering -- test file produced before production file'
            );
        });

        // TC-M4-08: ALL_FILES_COMPLETE signal
        it('TC-M4-08: ALL_FILES_COMPLETE signal documented', () => {
            const c = getContent();
            assert.ok(
                c.includes('ALL_FILES_COMPLETE'),
                'Must document ALL_FILES_COMPLETE completion signal'
            );
        });
    });

    describe('Backward Compatibility', () => {
        // TC-M4-09: Standard mode unchanged without WRITER_CONTEXT
        it('TC-M4-09: Standard mode unchanged when WRITER_CONTEXT absent', () => {
            const c = getContent();
            assert.ok(
                c.includes('STANDARD MODE') || c.includes('standard mode') ||
                c.includes('Ignore this section entirely') || c.includes('unchanged'),
                'Must document standard mode preservation when WRITER_CONTEXT absent'
            );
        });

        // TC-M4-10: Existing sections preserved (no removals)
        it('TC-M4-10: Existing sections preserved (PHASE OVERVIEW, MANDATORY ITERATION ENFORCEMENT)', () => {
            const c = getContent();
            assert.ok(c.includes('PHASE OVERVIEW'), 'Must preserve existing PHASE OVERVIEW section');
            assert.ok(c.includes('MANDATORY ITERATION ENFORCEMENT'), 'Must preserve existing MANDATORY ITERATION ENFORCEMENT section');
            assert.ok(c.includes('CRITICAL'), 'Must preserve existing CRITICAL section');
        });
    });
});

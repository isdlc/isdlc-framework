/**
 * Tests for Orchestrator IMPLEMENTATION_ROUTING and Per-File Loop (Module M3)
 * Traces to: FR-003 (AC-003-01..07), FR-006 (AC-006-01..04), FR-007 (AC-007-01..03)
 * Feature: REQ-0017-multi-agent-implementation-team
 * Validation Rules: VR-016..VR-026
 *
 * Target file: src/claude/agents/00-sdlc-orchestrator.md (MODIFIED)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ORCHESTRATOR_PATH = path.resolve(__dirname, '..', '..', 'agents', '00-sdlc-orchestrator.md');

describe('M3: IMPLEMENTATION_ROUTING in Orchestrator (00-sdlc-orchestrator.md)', () => {
    let content;

    function getContent() {
        if (!content) {
            assert.ok(fs.existsSync(ORCHESTRATOR_PATH), 'Orchestrator file must exist at ' + ORCHESTRATOR_PATH);
            content = fs.readFileSync(ORCHESTRATOR_PATH, 'utf8');
        }
        return content;
    }

    /**
     * Helper: extract text from after IMPLEMENTATION_ROUTING to end of Section 7.6
     * (before Section 8).
     */
    function getImplementationSection() {
        const c = getContent();
        const implStart = c.indexOf('IMPLEMENTATION_ROUTING');
        const sectionEnd = c.indexOf('## 8.', implStart);
        if (implStart === -1 || sectionEnd === -1) return c;
        return c.substring(implStart, sectionEnd);
    }

    describe('IMPLEMENTATION_ROUTING Table', () => {
        // TC-M3-01: IMPLEMENTATION_ROUTING table exists in Section 7.6
        it('TC-M3-01: IMPLEMENTATION_ROUTING table exists in Section 7.6', () => {
            const c = getContent();
            assert.ok(c.includes('IMPLEMENTATION_ROUTING'), 'Must contain IMPLEMENTATION_ROUTING table');
            assert.ok(c.includes('7.6'), 'Must reference Section 7.6');
        });

        // TC-M3-02: Writer mapped to 05-software-developer.md
        it('TC-M3-02: Writer mapped to 05-software-developer.md', () => {
            const section = getImplementationSection();
            assert.ok(
                section.includes('05-software-developer.md'),
                'IMPLEMENTATION_ROUTING must map Writer to 05-software-developer.md'
            );
        });

        // TC-M3-03: Reviewer mapped to 05-implementation-reviewer.md
        it('TC-M3-03: Reviewer mapped to 05-implementation-reviewer.md', () => {
            const section = getImplementationSection();
            assert.ok(
                section.includes('05-implementation-reviewer.md'),
                'IMPLEMENTATION_ROUTING must map Reviewer to 05-implementation-reviewer.md'
            );
        });

        // TC-M3-04: Updater mapped to 05-implementation-updater.md
        it('TC-M3-04: Updater mapped to 05-implementation-updater.md', () => {
            const section = getImplementationSection();
            assert.ok(
                section.includes('05-implementation-updater.md'),
                'IMPLEMENTATION_ROUTING must map Updater to 05-implementation-updater.md'
            );
        });
    });

    describe('Per-File Loop Protocol', () => {
        // TC-M3-05: Per-file loop protocol documented
        it('TC-M3-05: Per-file loop protocol documented', () => {
            const c = getContent().toLowerCase();
            assert.ok(
                c.includes('per-file') && c.includes('loop'),
                'Must document per-file loop protocol'
            );
        });

        // TC-M3-06: Writer -> Reviewer -> Updater cycle documented
        it('TC-M3-06: Writer -> Reviewer -> Updater cycle documented', () => {
            const section = getImplementationSection();
            assert.ok(section.includes('Writer'), 'Must reference Writer in implementation loop');
            assert.ok(section.includes('Reviewer'), 'Must reference Reviewer in implementation loop');
            assert.ok(section.includes('Updater'), 'Must reference Updater in implementation loop');
        });

        // TC-M3-07: PASS verdict leads to next file
        it('TC-M3-07: PASS verdict leads to next file', () => {
            const section = getImplementationSection();
            assert.ok(
                section.includes('PASS') && (section.includes('next file') || section.includes('files_completed')),
                'Must document PASS verdict -> proceed to next file'
            );
        });

        // TC-M3-08: REVISE verdict leads to Updater delegation
        it('TC-M3-08: REVISE verdict leads to Updater delegation', () => {
            const section = getImplementationSection();
            assert.ok(
                section.includes('REVISE') && section.includes('Updater'),
                'Must document REVISE verdict -> delegate to Updater'
            );
        });

        // TC-M3-09: After Updater, re-review by Reviewer
        it('TC-M3-09: After Updater, re-review by Reviewer', () => {
            const section = getImplementationSection().toLowerCase();
            assert.ok(
                (section.includes('updater') && section.includes('reviewer') && section.includes('re-review')) ||
                (section.includes('back to reviewer') || section.includes('delegate back to reviewer')),
                'Must document re-review by Reviewer after Updater returns'
            );
        });

        // TC-M3-10: Max 3 iterations per file
        it('TC-M3-10: Max 3 iterations per file with MAX_ITERATIONS', () => {
            const section = getImplementationSection();
            assert.ok(
                section.includes('3') && section.includes('MAX_ITERATIONS'),
                'Must document max 3 iterations per file with MAX_ITERATIONS acceptance'
            );
        });

        // TC-M3-11: Per-file loop summary generation
        it('TC-M3-11: Per-file loop summary generation documented', () => {
            const section = getImplementationSection().toLowerCase();
            assert.ok(
                section.includes('summary') || section.includes('per-file-loop-summary'),
                'Must document per-file-loop-summary.md generation'
            );
        });

        // TC-M3-12: File ordering protocol
        it('TC-M3-12: File ordering protocol documented', () => {
            const section = getImplementationSection().toLowerCase();
            assert.ok(
                section.includes('ordering') || section.includes('task plan order') || section.includes('file order'),
                'Must document file ordering protocol'
            );
        });

        // TC-M3-13: WRITER_CONTEXT injection format
        it('TC-M3-13: WRITER_CONTEXT injection format documented', () => {
            const section = getImplementationSection();
            assert.ok(
                section.includes('WRITER_CONTEXT'),
                'Must document WRITER_CONTEXT injection format for Writer delegation'
            );
        });
    });

    describe('Implementation Loop State', () => {
        // TC-M3-14: implementation_loop_state creation
        it('TC-M3-14: implementation_loop_state creation documented', () => {
            const c = getContent();
            assert.ok(
                c.includes('implementation_loop_state'),
                'Must document implementation_loop_state creation in active_workflow'
            );
        });

        // TC-M3-15: Orchestrator maintains state (not sub-agents)
        it('TC-M3-15: Orchestrator owns implementation_loop_state (not sub-agents)', () => {
            const section = getImplementationSection().toLowerCase();
            assert.ok(
                (section.includes('orchestrator') && section.includes('owns')) ||
                section.includes('sub-agents do not write') ||
                section.includes('sub-agents do not') ||
                section.includes('orchestrator owns'),
                'Must document orchestrator as owner of implementation_loop_state'
            );
        });

        // TC-M3-16: implementation_loop_state update protocol
        it('TC-M3-16: implementation_loop_state update protocol with per_file_reviews', () => {
            const c = getContent();
            assert.ok(c.includes('per_file_reviews'), 'Must contain per_file_reviews in state tracking');
            assert.ok(
                c.includes('files_completed') || c.includes('files_remaining'),
                'Must contain files_completed or files_remaining in state tracking'
            );
        });
    });

    describe('Error Handling', () => {
        // TC-M3-17: Sub-agent error handling documented
        it('TC-M3-17: Sub-agent error handling documented', () => {
            const section = getImplementationSection().toLowerCase();
            assert.ok(
                section.includes('error') && (section.includes('fail-open') || section.includes('article x') || section.includes('warning')),
                'Must document sub-agent error handling in implementation loop'
            );
        });

        // TC-M3-18: Reviewer output unparseable handling
        it('TC-M3-18: Reviewer output unparseable handling documented', () => {
            const section = getImplementationSection().toLowerCase();
            assert.ok(
                (section.includes('unparseable') || section.includes('cannot extract verdict')) &&
                (section.includes('pass') || section.includes('fail-open')),
                'Must document handling for unparseable Reviewer output'
            );
        });

        // TC-M3-19: Task tool delegation for sub-agents
        it('TC-M3-19: Task tool delegation for separate sub-agent invocations', () => {
            const section = getImplementationSection();
            assert.ok(
                section.includes('Task tool') || section.includes('Task') && section.includes('invocation'),
                'Must document separate Task tool delegation for each sub-agent'
            );
        });
    });

    describe('Separation from DEBATE_ROUTING', () => {
        // TC-M3-20: Section 7.6 separate from Section 7.5
        it('TC-M3-20: Section 7.6 (IMPLEMENTATION) separate from Section 7.5 (DEBATE)', () => {
            const c = getContent();
            assert.ok(c.includes('7.6'), 'Must contain Section 7.6 marker');
            assert.ok(c.includes('IMPLEMENTATION'), 'Must contain IMPLEMENTATION section');
            // Verify they are distinct sections
            const idx75 = c.indexOf('7.5');
            const idx76 = c.indexOf('7.6');
            assert.ok(idx75 < idx76, 'Section 7.5 must come before Section 7.6');
        });

        // TC-M3-21: DEBATE_ROUTING does not contain Phase 06
        it('TC-M3-21: DEBATE_ROUTING does not contain 06-implementation', () => {
            const c = getContent();
            const debateStart = c.indexOf('DEBATE_ROUTING');
            const implStart = c.indexOf('IMPLEMENTATION_ROUTING');
            if (debateStart !== -1 && implStart !== -1 && debateStart < implStart) {
                const debateSection = c.substring(debateStart, implStart);
                assert.ok(
                    !debateSection.includes('06-implementation'),
                    'DEBATE_ROUTING must NOT contain 06-implementation -- it belongs in IMPLEMENTATION_ROUTING'
                );
            }
        });

        // TC-M3-22: No-debate fallback to single-agent
        it('TC-M3-22: No-debate fallback to single-agent delegation', () => {
            const section = getImplementationSection().toLowerCase();
            assert.ok(
                (section.includes('debate_mode') || section.includes('debate mode')) &&
                (section.includes('false') || section.includes('no-debate')) &&
                (section.includes('single') || section.includes('writer agent only')),
                'Must document no-debate fallback to single-agent delegation'
            );
        });
    });
});

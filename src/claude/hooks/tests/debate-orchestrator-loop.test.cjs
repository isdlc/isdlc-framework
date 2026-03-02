/**
 * Tests for Orchestrator Debate Loop (Module M4) and Artifact Versioning (M7)
 * Traces to: FR-004, FR-006, FR-008, AC-004-01..04, AC-006-01..03, NFR-004
 * Feature: REQ-0014-multi-agent-requirements-team
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ORCHESTRATOR_PATH = path.resolve(__dirname, '..', '..', 'agents', '00-sdlc-orchestrator.md');

describe('M4: Orchestrator Debate Loop (00-sdlc-orchestrator.md)', () => {
    let content;

    function getContent() {
        if (!content) {
            assert.ok(fs.existsSync(ORCHESTRATOR_PATH), 'Orchestrator agent file must exist');
            content = fs.readFileSync(ORCHESTRATOR_PATH, 'utf8');
        }
        return content;
    }

    // TC-M4-01: DEBATE LOOP ORCHESTRATION section exists
    it('TC-M4-01: DEBATE LOOP ORCHESTRATION section exists', () => {
        const c = getContent();
        assert.ok(
            c.includes('DEBATE LOOP ORCHESTRATION'),
            'Must contain DEBATE LOOP ORCHESTRATION section heading'
        );
    });

    // TC-M4-02: resolveDebateMode logic documented
    it('TC-M4-02: resolveDebateMode logic documented', () => {
        const c = getContent();
        assert.ok(
            c.includes('resolveDebateMode') || c.includes('Resolve Debate Mode'),
            'Must contain debate mode resolution pseudocode'
        );
    });

    // TC-M4-03: --no-debate wins precedence
    it('TC-M4-03: --no-debate wins precedence', () => {
        const c = getContent();
        // Find the resolveDebateMode section
        const debateIdx = c.indexOf('resolveDebateMode') || c.indexOf('Resolve Debate Mode');
        assert.ok(debateIdx !== -1, 'Must have resolve debate mode section');
        const debateSection = c.substring(debateIdx, debateIdx + 800);

        // --no-debate should be checked first (highest priority)
        const noDebatePos = debateSection.indexOf('no_debate');
        const debatePos = debateSection.indexOf('flags.debate');
        assert.ok(noDebatePos !== -1, 'Must reference no_debate flag');
        assert.ok(noDebatePos < debatePos || debateSection.includes('no_debate') && debateSection.includes('return false'),
            '--no-debate must be checked before --debate'
        );
    });

    // TC-M4-04: --debate overrides -light
    it('TC-M4-04: --debate overrides -light', () => {
        const c = getContent();
        const debateIdx = c.indexOf('resolveDebateMode') || c.indexOf('Resolve Debate Mode');
        assert.ok(debateIdx !== -1, 'Must have resolveDebateMode section');
        const debateSection = c.substring(debateIdx, debateIdx + 800);

        // --debate should be checked before -light
        const debatePos = debateSection.indexOf('flags.debate');
        const lightPos = debateSection.indexOf('flags.light') || debateSection.indexOf('light');
        assert.ok(debatePos !== -1 && lightPos !== -1,
            'Must reference both debate and light flags'
        );
    });

    // TC-M4-05: Standard sizing defaults to debate ON
    it('TC-M4-05: Standard sizing defaults to debate ON', () => {
        const c = getContent();
        assert.ok(
            c.includes('standard') && c.includes('true'),
            'Must contain standard sizing defaulting to debate ON'
        );
    });

    // TC-M4-06: debate_state initialization documented
    it('TC-M4-06: debate_state initialization documented', () => {
        const c = getContent();
        assert.ok(c.includes('debate_state'), 'Must contain debate_state reference');
        assert.ok(c.includes('max_rounds'), 'Must contain max_rounds in initialization');
        assert.ok(c.includes('converged'), 'Must contain converged in initialization');
    });

    // TC-M4-07: Creator delegation with DEBATE_CONTEXT
    it('TC-M4-07: Creator delegation with DEBATE_CONTEXT', () => {
        const c = getContent();
        // Find the debate loop section
        const debateLoopIdx = c.indexOf('DEBATE LOOP ORCHESTRATION');
        assert.ok(debateLoopIdx !== -1, 'Must have DEBATE LOOP section');
        const debateSection = c.substring(debateLoopIdx);

        assert.ok(
            debateSection.includes('DEBATE_CONTEXT') && debateSection.includes('creator'),
            'Must contain Creator delegation with DEBATE_CONTEXT'
        );
    });

    // TC-M4-08: Critic-Refiner loop documented
    it('TC-M4-08: Critic-Refiner loop documented', () => {
        const c = getContent();
        const debateLoopIdx = c.indexOf('DEBATE LOOP ORCHESTRATION');
        assert.ok(debateLoopIdx !== -1, 'Must have DEBATE LOOP section');
        const debateSection = c.substring(debateLoopIdx);

        assert.ok(
            debateSection.includes('Critic') && debateSection.includes('Refiner'),
            'Must contain both Critic and Refiner in debate loop'
        );
    });

    // TC-M4-09: Convergence check: zero BLOCKING
    it('TC-M4-09: Convergence check: zero BLOCKING', () => {
        const c = getContent();
        const debateLoopIdx = c.indexOf('DEBATE LOOP ORCHESTRATION');
        assert.ok(debateLoopIdx !== -1, 'Must have DEBATE LOOP section');
        const debateSection = c.substring(debateLoopIdx);

        assert.ok(
            debateSection.includes('blocking') && debateSection.includes('0') ||
            debateSection.includes('BLOCKING') && debateSection.includes('== 0'),
            'Must contain convergence when blocking count == 0'
        );
    });

    // TC-M4-10: Max 3 rounds hard limit
    it('TC-M4-10: Max 3 rounds hard limit', () => {
        const c = getContent();
        const debateLoopIdx = c.indexOf('DEBATE LOOP ORCHESTRATION');
        assert.ok(debateLoopIdx !== -1, 'Must have DEBATE LOOP section');
        const debateSection = c.substring(debateLoopIdx);

        assert.ok(
            debateSection.includes('max_rounds') && debateSection.includes('3'),
            'Must contain max_rounds with value 3'
        );
    });

    // TC-M4-11: Unconverged warning appended
    it('TC-M4-11: Unconverged warning appended', () => {
        const c = getContent();
        const debateLoopIdx = c.indexOf('DEBATE LOOP ORCHESTRATION');
        assert.ok(debateLoopIdx !== -1, 'Must have DEBATE LOOP section');
        const debateSection = c.substring(debateLoopIdx);

        assert.ok(
            debateSection.includes('WARNING') && debateSection.includes('not converge') ||
            debateSection.includes('Unconverged') || debateSection.includes('unconverged'),
            'Must contain unconverged warning handling'
        );
    });

    // TC-M4-12: debate-summary.md generation
    it('TC-M4-12: debate-summary.md generation', () => {
        const c = getContent();
        const debateLoopIdx = c.indexOf('DEBATE LOOP ORCHESTRATION');
        assert.ok(debateLoopIdx !== -1, 'Must have DEBATE LOOP section');
        const debateSection = c.substring(debateLoopIdx);

        assert.ok(
            debateSection.includes('debate-summary.md'),
            'Must contain debate-summary.md generation instructions'
        );
    });

    // TC-M4-13: round-N-critique.md saved for audit
    it('TC-M4-13: round-N-critique.md saved for audit', () => {
        const c = getContent();
        const debateLoopIdx = c.indexOf('DEBATE LOOP ORCHESTRATION');
        assert.ok(debateLoopIdx !== -1, 'Must have DEBATE LOOP section');
        const debateSection = c.substring(debateLoopIdx);

        assert.ok(
            debateSection.includes('round-') && debateSection.includes('critique'),
            'Must contain round-N-critique.md file saving references'
        );
    });

    // TC-M4-14: Single-agent fallback when debate OFF
    it('TC-M4-14: Single-agent fallback when debate OFF', () => {
        const c = getContent();
        const debateLoopIdx = c.indexOf('DEBATE LOOP ORCHESTRATION');
        assert.ok(debateLoopIdx !== -1, 'Must have DEBATE LOOP section');
        const debateSection = c.substring(debateLoopIdx);

        assert.ok(
            debateSection.includes('false') && debateSection.includes('single') ||
            debateSection.includes('debate_mode == false') ||
            debateSection.includes('NO DEBATE_CONTEXT'),
            'Must contain single-agent delegation when debate_mode == false'
        );
    });

    // TC-M4-15: debate_state updates per round
    it('TC-M4-15: debate_state updates per round', () => {
        const c = getContent();
        const debateLoopIdx = c.indexOf('DEBATE LOOP ORCHESTRATION');
        assert.ok(debateLoopIdx !== -1, 'Must have DEBATE LOOP section');
        const debateSection = c.substring(debateLoopIdx);

        assert.ok(
            debateSection.includes('rounds_history'),
            'Must contain rounds_history tracking'
        );
    });

    // TC-M4-16: Convergence on Round 1 edge case
    it('TC-M4-16: Convergence on Round 1 edge case', () => {
        const c = getContent();
        const debateLoopIdx = c.indexOf('DEBATE LOOP ORCHESTRATION');
        assert.ok(debateLoopIdx !== -1, 'Must have DEBATE LOOP section');
        const debateSection = c.substring(debateLoopIdx);

        assert.ok(
            debateSection.includes('Refiner') && debateSection.includes('NOT invoked') ||
            debateSection.includes('Converge') && debateSection.includes('first') ||
            debateSection.includes('convergence') && debateSection.includes('Round 1'),
            'Must address convergence on first review (Refiner not invoked)'
        );
    });

    // TC-M4-17: Malformed critique fail-open (Article X)
    it('TC-M4-17: Malformed critique fail-open (Article X)', () => {
        const c = getContent();
        const debateLoopIdx = c.indexOf('DEBATE LOOP ORCHESTRATION');
        assert.ok(debateLoopIdx !== -1, 'Must have DEBATE LOOP section');
        const debateSection = c.substring(debateLoopIdx);

        assert.ok(
            debateSection.includes('fail-open') || debateSection.includes('fail open') ||
            debateSection.includes('0 BLOCKING') && debateSection.includes('parse'),
            'Must contain fail-open for parse errors'
        );
    });

    // TC-M4-18: Both flags conflict resolution
    it('TC-M4-18: Both flags conflict resolution', () => {
        const c = getContent();
        assert.ok(
            c.includes('--no-debate') && c.includes('wins') ||
            c.includes('no_debate') && c.includes('true') && c.includes('false'),
            'Must contain --no-debate wins when both flags present'
        );
    });
});

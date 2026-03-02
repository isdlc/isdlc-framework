/**
 * Integration Tests for Multi-Agent Debate Loop (Cross-Module)
 * Traces to: FR-001, FR-002, FR-003, FR-004, FR-005, FR-008, NFR-002
 * Feature: REQ-0014-multi-agent-requirements-team
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ANALYST_PATH = path.resolve(__dirname, '..', '..', 'agents', '01-requirements-analyst.md');
const CRITIC_PATH = path.resolve(__dirname, '..', '..', 'agents', '01-requirements-critic.md');
const REFINER_PATH = path.resolve(__dirname, '..', '..', 'agents', '01-requirements-refiner.md');
const ORCHESTRATOR_PATH = path.resolve(__dirname, '..', '..', 'agents', '00-sdlc-orchestrator.md');
const ISDLC_CMD_PATH = path.resolve(__dirname, '..', '..', 'commands', 'isdlc.md');

describe('Cross-Module Integration Tests', () => {
    function readFile(filePath) {
        assert.ok(fs.existsSync(filePath), 'File must exist: ' + filePath);
        return fs.readFileSync(filePath, 'utf8');
    }

    // TC-INT-01: Creator and Critic both reference DEBATE_CONTEXT
    it('TC-INT-01: Creator and Critic both reference DEBATE_CONTEXT', () => {
        const analyst = readFile(ANALYST_PATH);
        const critic = readFile(CRITIC_PATH);

        assert.ok(
            analyst.includes('DEBATE_CONTEXT'),
            'Creator (analyst) must reference DEBATE_CONTEXT'
        );
        assert.ok(
            critic.includes('DEBATE_CONTEXT'),
            'Critic must reference DEBATE_CONTEXT'
        );
    });

    // TC-INT-02: Critic output format matches orchestrator parsing
    it('TC-INT-02: Critic output format matches orchestrator parsing', () => {
        const critic = readFile(CRITIC_PATH);
        const orchestrator = readFile(ORCHESTRATOR_PATH);

        // Critic must produce a Summary section with BLOCKING count
        assert.ok(
            critic.includes('BLOCKING') && critic.includes('Summary'),
            'Critic must reference BLOCKING count in Summary format'
        );

        // Orchestrator must parse BLOCKING count from Summary
        const debateLoopIdx = orchestrator.indexOf('DEBATE LOOP ORCHESTRATION');
        assert.ok(debateLoopIdx !== -1, 'Orchestrator must have DEBATE LOOP section');
        const debateSection = orchestrator.substring(debateLoopIdx);
        assert.ok(
            debateSection.includes('BLOCKING') && debateSection.includes('parse') ||
            debateSection.includes('blocking') && debateSection.includes('count'),
            'Orchestrator must reference parsing BLOCKING count'
        );
    });

    // TC-INT-03: Refiner references critique file naming
    it('TC-INT-03: Refiner references critique file naming', () => {
        const refiner = readFile(REFINER_PATH);
        assert.ok(
            refiner.includes('round-') && refiner.includes('critique'),
            'Refiner must reference round-N-critique.md pattern'
        );
    });

    // TC-INT-04: Orchestrator delegates to all three agents
    it('TC-INT-04: Orchestrator delegates to all three agents', () => {
        const orchestrator = readFile(ORCHESTRATOR_PATH);
        const debateLoopIdx = orchestrator.indexOf('DEBATE LOOP ORCHESTRATION');
        assert.ok(debateLoopIdx !== -1, 'Must have DEBATE LOOP section');
        const debateSection = orchestrator.substring(debateLoopIdx);

        assert.ok(
            debateSection.includes('requirements-analyst') || debateSection.includes('Creator'),
            'Orchestrator must delegate to requirements-analyst/Creator'
        );
        assert.ok(
            debateSection.includes('requirements-critic') || debateSection.includes('Critic'),
            'Orchestrator must delegate to requirements-critic/Critic'
        );
        assert.ok(
            debateSection.includes('requirements-refiner') || debateSection.includes('Refiner'),
            'Orchestrator must delegate to requirements-refiner/Refiner'
        );
    });

    // TC-INT-05: Flag parsing and orchestrator consistent
    it('TC-INT-05: Flag parsing and orchestrator consistent', () => {
        const isdlcCmd = readFile(ISDLC_CMD_PATH);
        const orchestrator = readFile(ORCHESTRATOR_PATH);

        // Both must reference --debate and --no-debate
        assert.ok(
            isdlcCmd.includes('--debate') && isdlcCmd.includes('--no-debate'),
            'isdlc.md must document --debate and --no-debate'
        );
        assert.ok(
            orchestrator.includes('debate') && orchestrator.includes('no_debate'),
            'Orchestrator must reference debate and no_debate'
        );
    });

    // TC-INT-06: Backward compat: all debate agents check for DEBATE_CONTEXT absence
    it('TC-INT-06: Backward compat: analyst has absence-based fork', () => {
        const analyst = readFile(ANALYST_PATH);

        // Analyst must have an absence-based fork (single-agent mode)
        assert.ok(
            analyst.includes('NOT present') || analyst.includes('not present'),
            'Analyst must check for DEBATE_CONTEXT absence'
        );
    });

    // TC-INT-07: Error handling patterns align with error taxonomy
    it('TC-INT-07: Error codes from error-taxonomy referenced in orchestrator', () => {
        const orchestrator = readFile(ORCHESTRATOR_PATH);
        const debateLoopIdx = orchestrator.indexOf('DEBATE LOOP ORCHESTRATION');
        assert.ok(debateLoopIdx !== -1, 'Must have DEBATE LOOP section');
        const debateSection = orchestrator.substring(debateLoopIdx);

        // The orchestrator should handle key failure modes from the error taxonomy:
        // - Critique parse failure (fail-open)
        // - Max rounds reached
        // - Artifact missing
        assert.ok(
            debateSection.includes('fail-open') || debateSection.includes('fail open'),
            'Must handle critique parse failures with fail-open'
        );
        assert.ok(
            debateSection.includes('max_rounds') || debateSection.includes('max-rounds'),
            'Must handle max rounds reached'
        );
    });
});

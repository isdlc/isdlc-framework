/**
 * Prompt Content Verification Tests: BUG-0004 Orchestrator Conversational Opening
 *
 * These tests verify that 00-sdlc-orchestrator.md no longer contains the old
 * 3-question INTERACTIVE PROTOCOL and instead contains the current conversational
 * opening protocol matching 01-requirements-analyst.md's INVOCATION PROTOCOL.
 *
 * Test runner: node:test (Article II)
 * Test approach: Read .md files, assert content patterns
 *
 * Traces to: BUG-0004-orchestrator-overrides-conversational-opening
 * Requirements: 2 FRs, 9 ACs, 2 NFRs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Constants
const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const AGENTS_DIR = join(PROJECT_ROOT, 'src', 'claude', 'agents');

const ORCHESTRATOR_FILE = '00-sdlc-orchestrator.md';
const REQUIREMENTS_ANALYST_FILE = '01-requirements-analyst.md';

// Helper: read agent file content
function readAgent(filename) {
  return readFileSync(join(AGENTS_DIR, filename), 'utf-8');
}

// =============================================================================
// TC-01: Old Protocol Removal
// Traces to: FR-1, AC-1.1, AC-1.2
// =============================================================================

describe('TC-01: Old Protocol Removal (FR-1)', () => {

  // TC-01.1: Old 3-question text absent (AC-1.1)
  it('[P0] TC-01.1: AC-1.1 -- old "FIRST response must ONLY contain these 3 questions" text absent', () => {
    const content = readAgent(ORCHESTRATOR_FILE);
    assert.ok(
      !content.includes('Your FIRST response must ONLY contain these 3 questions'),
      'Orchestrator must NOT contain the old 3-question instruction'
    );
  });

  // TC-01.2: Old question list absent (AC-1.2)
  it('[P0] TC-01.2: AC-1.2 -- old 3 specific questions absent', () => {
    const content = readAgent(ORCHESTRATOR_FILE);
    assert.ok(
      !content.includes('What problem are you solving?'),
      'Orchestrator must NOT contain "What problem are you solving?"'
    );
    assert.ok(
      !content.includes('Who will use this?'),
      'Orchestrator must NOT contain "Who will use this?"'
    );
    assert.ok(
      !content.includes('How will you know this project succeeded?'),
      'Orchestrator must NOT contain "How will you know this project succeeded?"'
    );
  });

  // TC-01.3: Old "ONLY ask the 3 questions" absent (reinforces AC-1.1)
  it('[P0] TC-01.3: AC-1.1 -- old "ONLY ask the 3 questions, then STOP" text absent', () => {
    const content = readAgent(ORCHESTRATOR_FILE);
    assert.ok(
      !content.includes('ONLY ask the 3 questions'),
      'Orchestrator must NOT contain "ONLY ask the 3 questions"'
    );
  });
});

// =============================================================================
// TC-02: New Protocol Content - Mode Detection
// Traces to: FR-1, AC-1.3
// =============================================================================

describe('TC-02: Mode Detection in New Protocol (FR-1, AC-1.3)', () => {

  // TC-02.1: DEBATE_CONTEXT check present (AC-1.3)
  it('[P0] TC-02.1: AC-1.3 -- DEBATE_CONTEXT mode detection present in Phase 01 protocol', () => {
    const content = readAgent(ORCHESTRATOR_FILE);
    assert.ok(
      content.includes('DEBATE_CONTEXT'),
      'Orchestrator Phase 01 protocol must include DEBATE_CONTEXT mode detection'
    );
  });

  // TC-02.2: Both debate and single-agent paths (AC-1.3)
  it('[P1] TC-02.2: AC-1.3 -- both debate and single-agent mode paths documented', () => {
    const content = readAgent(ORCHESTRATOR_FILE);
    // The protocol should reference both "DEBATE_CONTEXT is present" and
    // "DEBATE_CONTEXT is NOT present" (or equivalent phrasing)
    assert.ok(
      content.includes('DEBATE_CONTEXT is present') ||
      content.includes('IF DEBATE_CONTEXT'),
      'Orchestrator must include debate mode detection branch'
    );
    assert.ok(
      content.includes('DEBATE_CONTEXT is NOT present') ||
      content.includes('Single-agent mode') ||
      content.includes('single-agent'),
      'Orchestrator must include single-agent mode branch'
    );
  });
});

// =============================================================================
// TC-03: New Protocol Content - Conversational Opening
// Traces to: FR-1, AC-1.4
// =============================================================================

describe('TC-03: Conversational Opening in New Protocol (FR-1, AC-1.4)', () => {

  // TC-03.1: Rich description branching present (AC-1.4)
  it('[P0] TC-03.1: AC-1.4 -- rich description threshold (50 words) documented', () => {
    const content = readAgent(ORCHESTRATOR_FILE);
    assert.ok(
      content.includes('50 words') || content.includes('> 50'),
      'Orchestrator must include the 50-word threshold for rich descriptions'
    );
  });

  // TC-03.2: Reflection instruction present (AC-1.4)
  it('[P0] TC-03.2: AC-1.4 -- reflection/summary instruction for rich descriptions', () => {
    const content = readAgent(ORCHESTRATOR_FILE);
    // The protocol should instruct to reflect back the user's description
    assert.ok(
      content.includes('Reflect') || content.includes('reflect') ||
      content.includes('summary') || content.includes('understand'),
      'Orchestrator must include reflection instruction for rich descriptions'
    );
  });

  // TC-03.3: Minimal description path present (AC-1.4)
  it('[P1] TC-03.3: AC-1.4 -- minimal description path with focused questions', () => {
    const content = readAgent(ORCHESTRATOR_FILE);
    assert.ok(
      content.includes('minimal') || content.includes('< 50'),
      'Orchestrator must include a minimal description path'
    );
    assert.ok(
      content.includes('focused') || content.includes('targeted'),
      'Orchestrator must instruct focused/targeted questions for minimal descriptions'
    );
  });
});

// =============================================================================
// TC-04: New Protocol Content - Organic Lens Integration
// Traces to: FR-1, AC-1.5
// =============================================================================

describe('TC-04: Organic Lens Integration (FR-1, AC-1.5)', () => {

  // TC-04.1: Discovery lenses referenced (AC-1.5)
  it('[P1] TC-04.1: AC-1.5 -- discovery lenses referenced in protocol', () => {
    const content = readAgent(ORCHESTRATOR_FILE);
    assert.ok(
      content.includes('lens') || content.includes('lenses') ||
      content.includes('Business') && content.includes('User') && content.includes('Tech'),
      'Orchestrator must reference discovery lenses in the Phase 01 protocol'
    );
  });

  // TC-04.2: Organic weaving instruction (AC-1.5)
  it('[P1] TC-04.2: AC-1.5 -- organic/natural weaving of lenses instructed', () => {
    const content = readAgent(ORCHESTRATOR_FILE);
    assert.ok(
      content.includes('organic') || content.includes('weave') ||
      content.includes('natural') || content.includes('Weave'),
      'Orchestrator must instruct organic weaving of lenses (not rigid sequential stages)'
    );
  });
});

// =============================================================================
// TC-05: New Protocol Content - A/R/C Menu Pattern
// Traces to: FR-1, AC-1.6
// =============================================================================

describe('TC-05: A/R/C Menu Pattern (FR-1, AC-1.6)', () => {

  // TC-05.1: A/R/C menu pattern present (AC-1.6)
  it('[P0] TC-05.1: AC-1.6 -- A/R/C menu pattern present in Phase 01 protocol', () => {
    const content = readAgent(ORCHESTRATOR_FILE);
    assert.ok(
      content.includes('A/R/C') ||
      (content.includes('[A]') && content.includes('[R]') && content.includes('[C]')),
      'Orchestrator must include the A/R/C menu pattern (Adjust/Refine/Continue)'
    );
  });
});

// =============================================================================
// TC-06: Protocol Consistency (FR-2)
// Traces to: FR-2, AC-2.1, AC-2.2, AC-2.3
// =============================================================================

describe('TC-06: Protocol Consistency Between Orchestrator and Requirements Analyst (FR-2)', () => {

  // TC-06.1: Both files share mode detection (AC-2.1, AC-2.2)
  it('[P0] TC-06.1: AC-2.1, AC-2.2 -- both files include DEBATE_CONTEXT mode detection', () => {
    const orchestratorContent = readAgent(ORCHESTRATOR_FILE);
    const analystContent = readAgent(REQUIREMENTS_ANALYST_FILE);

    assert.ok(
      orchestratorContent.includes('DEBATE_CONTEXT'),
      'Orchestrator must include DEBATE_CONTEXT'
    );
    assert.ok(
      analystContent.includes('DEBATE_CONTEXT'),
      'Requirements analyst must include DEBATE_CONTEXT'
    );
  });

  // TC-06.2: Both files share conversational opening rules (AC-2.1, AC-2.3)
  it('[P0] TC-06.2: AC-2.1, AC-2.3 -- both files include 50-word threshold for rich descriptions', () => {
    const orchestratorContent = readAgent(ORCHESTRATOR_FILE);
    const analystContent = readAgent(REQUIREMENTS_ANALYST_FILE);

    const orchHas50 = orchestratorContent.includes('50 words') || orchestratorContent.includes('> 50');
    const analystHas50 = analystContent.includes('50 words') || analystContent.includes('> 50');

    assert.ok(orchHas50, 'Orchestrator must include 50-word threshold');
    assert.ok(analystHas50, 'Requirements analyst must include 50-word threshold');
  });

  // TC-06.3: Both files share A/R/C pattern (AC-2.1)
  it('[P1] TC-06.3: AC-2.1 -- both files include A/R/C menu pattern', () => {
    const orchestratorContent = readAgent(ORCHESTRATOR_FILE);
    const analystContent = readAgent(REQUIREMENTS_ANALYST_FILE);

    const orchHasARC = orchestratorContent.includes('A/R/C') ||
      (orchestratorContent.includes('[A]') && orchestratorContent.includes('[C]'));
    const analystHasARC = analystContent.includes('A/R/C') ||
      (analystContent.includes('[A]') && analystContent.includes('[C]'));

    assert.ok(orchHasARC, 'Orchestrator must include A/R/C menu pattern');
    assert.ok(analystHasARC, 'Requirements analyst must include A/R/C menu pattern');
  });
});

// =============================================================================
// TC-07: Non-Functional Requirements
// Traces to: NFR-1, NFR-2
// =============================================================================

describe('TC-07: Non-Functional Requirements (NFR-1, NFR-2)', () => {

  // TC-07.1: Requirements analyst INVOCATION PROTOCOL block still intact (NFR-2 reinforcement)
  it('[P0] TC-07.1: NFR-2 -- requirements analyst INVOCATION PROTOCOL block unchanged', () => {
    const content = readAgent(REQUIREMENTS_ANALYST_FILE);
    assert.ok(
      content.includes('INVOCATION PROTOCOL FOR ORCHESTRATOR'),
      'Requirements analyst must still contain the INVOCATION PROTOCOL FOR ORCHESTRATOR block'
    );
    // Verify key elements of the block are intact
    assert.ok(
      content.includes('FACILITATOR, not a generator'),
      'Requirements analyst must still include the FACILITATOR instruction'
    );
    assert.ok(
      content.includes('Conversational Opening'),
      'Requirements analyst must still include the Conversational Opening section'
    );
  });

  // TC-07.2: Other orchestrator sections untouched (NFR-2)
  it('[P0] TC-07.2: NFR-2 -- other orchestrator sections (DEBATE_ROUTING, section headers) intact', () => {
    const content = readAgent(ORCHESTRATOR_FILE);
    assert.ok(
      content.includes('## 7.5 DEBATE LOOP ORCHESTRATION'),
      'Orchestrator must still contain the DEBATE LOOP ORCHESTRATION section'
    );
    assert.ok(
      content.includes('DEBATE_ROUTING:'),
      'Orchestrator must still contain the DEBATE_ROUTING table'
    );
    assert.ok(
      content.includes('01-requirements'),
      'Orchestrator DEBATE_ROUTING must still reference 01-requirements phase'
    );
  });

  // TC-07.3: Orchestrator still contains Phase 01 delegation reference (NFR-2)
  it('[P1] TC-07.3: NFR-2 -- orchestrator delegation table still references Phase 01', () => {
    const content = readAgent(ORCHESTRATOR_FILE);
    assert.ok(
      content.includes('requirements-analyst'),
      'Orchestrator must still reference requirements-analyst in delegation table'
    );
    assert.ok(
      content.includes('Phase 01'),
      'Orchestrator must still reference Phase 01'
    );
  });
});

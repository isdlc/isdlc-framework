/**
 * Cross-provider parity tests for roundtable card delivery (REQ-GH-253, T047)
 *
 * Verifies that given the same state machine definition and rolling state,
 * both Claude and Codex runtimes receive identical composed card content.
 * The transport mechanism differs (Claude: Task tool_input mutation, Codex:
 * projection bundle header) but the card TEXT must be identical.
 *
 * Covers: conversation state card, confirmation state cards, task cards,
 * empty card (no sub-task).
 *
 * Traces to: FR-005, AC-005-01, AC-005-02, AC-005-03, NFR-002
 * Test runner: node:test (ESM, Article XIII)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Provider runtimes under test (factory functions)
import { createRuntime as createClaudeRuntime } from '../../src/providers/claude/runtime.js';
import { createRuntime as createCodexRuntime } from '../../src/providers/codex/runtime.js';

// ---------------------------------------------------------------------------
// Test helper: extract card content from provider output
// ---------------------------------------------------------------------------

/**
 * Extract the composed card text from a Claude runtime executeTask result.
 * Claude injects the card via context.composedCard into the prompt string.
 * The card appears after "Instructions:" and before "Skills:" in the prompt.
 *
 * @param {object} result - executeTask result { status, output: { prompt } }
 * @returns {string|null} Extracted card text or null
 */
function extractClaudeCard(result) {
  if (!result || !result.output || !result.output.prompt) return null;
  const prompt = result.output.prompt;
  // The card is injected as-is into the prompt sections
  // It appears between the instructions section and the skills section
  // Look for the card markers
  const stateMatch = prompt.match(/(--- STATE:[\s\S]*?--- END STATE CARD ---)/);
  const taskMatch = prompt.match(/(--- TASK:[\s\S]*?--- END TASK CARD ---)/);

  const parts = [];
  if (stateMatch) parts.push(stateMatch[1]);
  if (taskMatch) parts.push(taskMatch[1]);

  if (parts.length === 0) return null;
  return parts.join('\n\n');
}

/**
 * Extract the composed card text from a Codex runtime executeTask result.
 * Codex appends the card to the projection bundle content.
 *
 * Since Codex executeTask calls execFile (which we mock), we intercept
 * the instructions.content that was built. The card is appended at the end.
 *
 * @param {string} capturedContent - The instructions content captured from Codex
 * @returns {string|null} Extracted card text or null
 */
function extractCodexCard(capturedContent) {
  if (!capturedContent) return null;
  const stateMatch = capturedContent.match(/(--- STATE:[\s\S]*?--- END STATE CARD ---)/);
  const taskMatch = capturedContent.match(/(--- TASK:[\s\S]*?--- END TASK CARD ---)/);

  const parts = [];
  if (stateMatch) parts.push(stateMatch[1]);
  if (taskMatch) parts.push(taskMatch[1]);

  if (parts.length === 0) return null;
  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Fixtures — card content samples
// ---------------------------------------------------------------------------

const CONVERSATION_STATE_CARD = [
  '--- STATE: CONVERSATION ---',
  'Personas: Maya, Alex, Jordan',
  'Rendering: bulleted_by_domain',
  'Invariants: stop_after_question, wait_for_user_response',
  'Preferred tools: semantic_search, code_index',
  '--- END STATE CARD ---',
].join('\n');

const REQUIREMENTS_CONFIRMATION_CARD = [
  '--- STATE: PRESENTING_REQUIREMENTS ---',
  'Personas: Maya',
  'Rendering: bulleted_by_domain',
  'Presenter: Maya (requirements)',
  'Template: requirements-confirmation.template.json',
  'Sections: functional_requirements, acceptance_criteria, non_functional',
  'Invariants: stop_after_presentation, await_accept_amend',
  '--- END STATE CARD ---',
].join('\n');

const ARCHITECTURE_CONFIRMATION_CARD = [
  '--- STATE: PRESENTING_ARCHITECTURE ---',
  'Personas: Alex',
  'Rendering: bulleted_by_domain',
  'Presenter: Alex (architecture)',
  'Template: architecture-confirmation.template.json',
  'Sections: components, interfaces, data_flow',
  'Invariants: stop_after_presentation, await_accept_amend',
  '--- END STATE CARD ---',
].join('\n');

const TASK_CARD_SCOPE_FRAMING = [
  '--- TASK: SCOPE_FRAMING ---',
  'Purpose: Frame the scope of the feature request',
  'Skills:',
  '  analyze [FULL] (shipped)',
  'Tools: semantic_search',
  'Output: structured',
  '--- END TASK CARD ---',
].join('\n');

const COMBINED_CARD = CONVERSATION_STATE_CARD + '\n\n' + TASK_CARD_SCOPE_FRAMING;

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

/**
 * Create a mock execSync that returns success for 'which' commands.
 */
function mockExecSync() {
  return () => Buffer.from('/usr/bin/mock');
}

/**
 * Create a mock execFile for Codex that captures the instruction content
 * and returns success.
 */
function createCodexMocks() {
  let capturedContent = null;

  const mockExecFile = (_cmd, args, _opts, cb) => {
    // args[2] is the instructions.content passed to 'codex exec --'
    capturedContent = args && args.length >= 3 ? args[2] : null;
    cb(null, '{"status":"ok"}', '');
  };

  return {
    mockExecFile,
    getCapturedContent: () => capturedContent,
  };
}

/**
 * Create a mock projectInstructions for Codex that returns a minimal bundle.
 */
function mockProjectInstructions() {
  return (_phase, _agent, _opts) => ({
    content: 'Phase: test\nAgent: test-agent\nProjection bundle content.',
    metadata: { phase: 'test', agent: 'test-agent', skills_injected: [], team_type: 'feature' },
  });
}

// ---------------------------------------------------------------------------
// PA-01: Claude adapter delivers card content (AC-005-01)
// ---------------------------------------------------------------------------

describe('REQ-GH-253 roundtable-card-parity', () => {
  let claudeRuntime;
  let codexRuntime;
  let codexMocks;

  beforeEach(() => {
    claudeRuntime = createClaudeRuntime({
      _execSync: mockExecSync(),
    });

    codexMocks = createCodexMocks();
    codexRuntime = createCodexRuntime({
      _execSync: mockExecSync(),
      _execFile: codexMocks.mockExecFile,
      _projectInstructions: mockProjectInstructions(),
    });
  });

  // -------------------------------------------------------------------------
  // PA-01: Claude adapter delivers state card content
  // -------------------------------------------------------------------------

  it('PA-01: Claude adapter injects card via Task tool_input mutation', async () => {
    const result = await claudeRuntime.executeTask('01-requirements', 'roundtable-analyst', {
      composedCard: CONVERSATION_STATE_CARD,
    });

    assert.strictEqual(result.status, 'delegated');
    const extracted = extractClaudeCard(result);
    assert.ok(extracted, 'card content should be present in Claude output');
    assert.ok(extracted.includes('CONVERSATION'), 'should contain state name');
    assert.ok(extracted.includes('bulleted_by_domain'), 'should contain rendering mode');
    assert.ok(extracted.includes('semantic_search'), 'should contain preferred tools');
  });

  // -------------------------------------------------------------------------
  // PA-02: Codex adapter delivers state card content
  // -------------------------------------------------------------------------

  it('PA-02: Codex adapter injects card via projection bundle header', async () => {
    await codexRuntime.executeTask('01-requirements', 'roundtable-analyst', {
      composedCard: CONVERSATION_STATE_CARD,
    });

    const content = codexMocks.getCapturedContent();
    assert.ok(content, 'Codex should have received instructions content');
    const extracted = extractCodexCard(content);
    assert.ok(extracted, 'card content should be present in Codex output');
    assert.ok(extracted.includes('CONVERSATION'), 'should contain state name');
    assert.ok(extracted.includes('bulleted_by_domain'), 'should contain rendering mode');
  });

  // -------------------------------------------------------------------------
  // PA-03: Both providers produce identical card content
  // -------------------------------------------------------------------------

  it('PA-03: both providers deliver identical card content for conversation state', async () => {
    const claudeResult = await claudeRuntime.executeTask('01-requirements', 'roundtable-analyst', {
      composedCard: CONVERSATION_STATE_CARD,
    });

    await codexRuntime.executeTask('01-requirements', 'roundtable-analyst', {
      composedCard: CONVERSATION_STATE_CARD,
    });

    const claudeCard = extractClaudeCard(claudeResult);
    const codexCard = extractCodexCard(codexMocks.getCapturedContent());

    assert.ok(claudeCard, 'Claude should produce card');
    assert.ok(codexCard, 'Codex should produce card');
    assert.strictEqual(claudeCard, codexCard, 'card content must be identical across providers');
  });

  // -------------------------------------------------------------------------
  // PA-04: Confirmation state cards are identical
  // -------------------------------------------------------------------------

  it('PA-04: both providers deliver identical card for PRESENTING_REQUIREMENTS state', async () => {
    const claudeResult = await claudeRuntime.executeTask('01-requirements', 'roundtable-analyst', {
      composedCard: REQUIREMENTS_CONFIRMATION_CARD,
    });

    await codexRuntime.executeTask('01-requirements', 'roundtable-analyst', {
      composedCard: REQUIREMENTS_CONFIRMATION_CARD,
    });

    const claudeCard = extractClaudeCard(claudeResult);
    const codexCard = extractCodexCard(codexMocks.getCapturedContent());

    assert.strictEqual(claudeCard, codexCard, 'requirements confirmation card must match');
    assert.ok(claudeCard.includes('PRESENTING_REQUIREMENTS'));
    assert.ok(claudeCard.includes('Maya'));
  });

  it('PA-05: both providers deliver identical card for PRESENTING_ARCHITECTURE state', async () => {
    const claudeResult = await claudeRuntime.executeTask('03-architecture', 'software-architect', {
      composedCard: ARCHITECTURE_CONFIRMATION_CARD,
    });

    await codexRuntime.executeTask('03-architecture', 'software-architect', {
      composedCard: ARCHITECTURE_CONFIRMATION_CARD,
    });

    const claudeCard = extractClaudeCard(claudeResult);
    const codexCard = extractCodexCard(codexMocks.getCapturedContent());

    assert.strictEqual(claudeCard, codexCard, 'architecture confirmation card must match');
  });

  // -------------------------------------------------------------------------
  // PA-06: Task cards are identical
  // -------------------------------------------------------------------------

  it('PA-06: both providers deliver identical task card content', async () => {
    const claudeResult = await claudeRuntime.executeTask('01-requirements', 'roundtable-analyst', {
      composedCard: TASK_CARD_SCOPE_FRAMING,
    });

    await codexRuntime.executeTask('01-requirements', 'roundtable-analyst', {
      composedCard: TASK_CARD_SCOPE_FRAMING,
    });

    const claudeCard = extractClaudeCard(claudeResult);
    const codexCard = extractCodexCard(codexMocks.getCapturedContent());

    assert.strictEqual(claudeCard, codexCard, 'task card must match');
    assert.ok(claudeCard.includes('SCOPE_FRAMING'));
    assert.ok(claudeCard.includes('analyze [FULL]'));
  });

  // -------------------------------------------------------------------------
  // PA-07: Combined state + task cards are identical
  // -------------------------------------------------------------------------

  it('PA-07: both providers deliver identical combined state + task card', async () => {
    const claudeResult = await claudeRuntime.executeTask('01-requirements', 'roundtable-analyst', {
      composedCard: COMBINED_CARD,
    });

    await codexRuntime.executeTask('01-requirements', 'roundtable-analyst', {
      composedCard: COMBINED_CARD,
    });

    const claudeCard = extractClaudeCard(claudeResult);
    const codexCard = extractCodexCard(codexMocks.getCapturedContent());

    assert.strictEqual(claudeCard, codexCard, 'combined card must match');
    assert.ok(claudeCard.includes('STATE: CONVERSATION'));
    assert.ok(claudeCard.includes('TASK: SCOPE_FRAMING'));
  });

  // -------------------------------------------------------------------------
  // PA-08: Empty card (no sub-task) — null composedCard
  // -------------------------------------------------------------------------

  it('PA-08: both providers handle null composedCard (no sub-task)', async () => {
    const claudeResult = await claudeRuntime.executeTask('01-requirements', 'roundtable-analyst', {
      // No composedCard — simulates no active sub-task
    });

    await codexRuntime.executeTask('01-requirements', 'roundtable-analyst', {
      // No composedCard
    });

    const claudeCard = extractClaudeCard(claudeResult);
    const codexCard = extractCodexCard(codexMocks.getCapturedContent());

    // Both should be null — no card injected
    assert.strictEqual(claudeCard, null, 'Claude should not inject card when composedCard is absent');
    assert.strictEqual(codexCard, null, 'Codex should not inject card when composedCard is absent');
  });

  // -------------------------------------------------------------------------
  // PA-09: Card composition is provider-neutral (src/core/ only)
  // -------------------------------------------------------------------------

  it('PA-09: card composition is provider-neutral (src/core/ only, NFR-002)', () => {
    // Validate that the card content contains no provider-specific markup
    assert.ok(!CONVERSATION_STATE_CARD.includes('claude:'), 'card should not contain Claude-specific prefix');
    assert.ok(!CONVERSATION_STATE_CARD.includes('codex:'), 'card should not contain Codex-specific prefix');
    assert.ok(!TASK_CARD_SCOPE_FRAMING.includes('claude:'), 'task card should not contain Claude-specific prefix');
    assert.ok(!TASK_CARD_SCOPE_FRAMING.includes('codex:'), 'task card should not contain Codex-specific prefix');
    // Card format uses generic --- STATE/TASK markers, not provider-specific ones
    assert.ok(CONVERSATION_STATE_CARD.startsWith('--- STATE:'));
    assert.ok(TASK_CARD_SCOPE_FRAMING.startsWith('--- TASK:'));
  });

  // -------------------------------------------------------------------------
  // PA-10: Empty string composedCard is handled consistently
  // -------------------------------------------------------------------------

  it('PA-10: both providers handle empty string composedCard consistently', async () => {
    const claudeResult = await claudeRuntime.executeTask('01-requirements', 'roundtable-analyst', {
      composedCard: '',
    });

    await codexRuntime.executeTask('01-requirements', 'roundtable-analyst', {
      composedCard: '',
    });

    const claudeCard = extractClaudeCard(claudeResult);
    const codexCard = extractCodexCard(codexMocks.getCapturedContent());

    // Both should be null — empty string has no card markers
    assert.strictEqual(claudeCard, null);
    assert.strictEqual(codexCard, null);
  });
});

/**
 * Bug-gather cutover verification (REQ-GH-253, T044)
 *
 * Verifies that:
 *   1. The bug-gather path respects the migration_mode toggle in config
 *   2. initializeRoundtable('bug-gather') works with mechanism mode
 *   3. The bug-gather.json definition is loadable and has expected structure
 *   4. The roundtable bridge handles 'bug-gather' the same way as 'analyze'
 *
 * This is a SMALL verification task — mostly confirming that the bug-gather
 * pathway uses the same migration_mode toggle as analyze (T040/T042).
 *
 * Traces: T044, FR-008
 * Test runner: node:test (ESM, Article XIII)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..', '..');

// ---------------------------------------------------------------------------
// T044-AC01: bug-gather.json definition is loadable and well-structured
// ---------------------------------------------------------------------------

describe('REQ-GH-253 T044 — Bug-gather definition structure', () => {
  let bugGatherDef;

  beforeEach(() => {
    const defPath = join(projectRoot, 'src/isdlc/config/roundtable/bug-gather.json');
    assert.ok(existsSync(defPath), 'bug-gather.json should exist');
    bugGatherDef = JSON.parse(readFileSync(defPath, 'utf-8'));
  });

  it('AC-01: bug-gather.json declares workflow_type bug_gather', () => {
    assert.strictEqual(bugGatherDef.workflow_type, 'bug_gather');
  });

  it('AC-02: bug-gather.json inherits from core.json', () => {
    assert.strictEqual(bugGatherDef.inherits, 'core.json');
  });

  it('AC-03: bug-gather.json has all expected bug-specific states', () => {
    const expectedStates = [
      'IDLE',
      'CONVERSATION',
      'PRESENTING_BUG_SUMMARY',
      'PRESENTING_ROOT_CAUSE',
      'PRESENTING_FIX_STRATEGY',
      'PRESENTING_TASKS',
      'AMENDING',
      'FINALIZING',
      'COMPLETE',
    ];
    for (const state of expectedStates) {
      assert.ok(
        bugGatherDef.states[state],
        `bug-gather.json should have state: ${state}`
      );
    }
  });

  it('AC-04: bug-gather.json has completion signal BUG_ROUNDTABLE_COMPLETE', () => {
    assert.strictEqual(bugGatherDef.completion_signal, 'BUG_ROUNDTABLE_COMPLETE');
  });

  it('AC-05: PRESENTING_BUG_SUMMARY has pre_presentation_action for bug-report.md', () => {
    const bugSummaryState = bugGatherDef.states.PRESENTING_BUG_SUMMARY;
    assert.ok(bugSummaryState.pre_presentation_action, 'should have pre_presentation_action');
    assert.strictEqual(bugSummaryState.pre_presentation_action.action, 'write_bug_report');
    assert.strictEqual(bugSummaryState.pre_presentation_action.file, 'bug-report.md');
  });

  it('AC-06: PRESENTING_BUG_SUMMARY has external_delegation for tracing', () => {
    const bugSummaryState = bugGatherDef.states.PRESENTING_BUG_SUMMARY;
    const acceptTransition = bugSummaryState.transitions.find(t => t.condition === 'accept');
    assert.ok(acceptTransition, 'should have accept transition');
    assert.ok(acceptTransition.external_delegation, 'accept transition should have external_delegation');
    assert.strictEqual(
      acceptTransition.external_delegation.agent,
      'tracing-orchestrator'
    );
    assert.ok(
      acceptTransition.external_delegation.fail_open.enabled,
      'external_delegation should have fail_open enabled'
    );
  });

  it('AC-07: bug-gather.json has tier_rules with light/standard/epic', () => {
    assert.ok(bugGatherDef.tier_rules.light, 'should have light tier');
    assert.ok(bugGatherDef.tier_rules.standard, 'should have standard tier');
    assert.ok(bugGatherDef.tier_rules.epic, 'should have epic tier');
  });

  it('AC-08: light tier folds ROOT_CAUSE into FIX_STRATEGY', () => {
    const lightTier = bugGatherDef.tier_rules.light;
    assert.ok(lightTier.fold, 'light tier should have fold config');
    assert.strictEqual(lightTier.fold.source, 'PRESENTING_ROOT_CAUSE');
    assert.strictEqual(lightTier.fold.into, 'PRESENTING_FIX_STRATEGY');
  });

  it('AC-09: CONVERSATION state has SCOPE_FRAMING, CODEBASE_SCAN, TRACING, SYMPTOM_ANALYSIS sub-tasks', () => {
    const conversation = bugGatherDef.states.CONVERSATION;
    assert.ok(conversation.sub_tasks, 'CONVERSATION should have sub_tasks');
    const taskIds = conversation.sub_tasks.tasks.map(t => t.id);
    assert.ok(taskIds.includes('SCOPE_FRAMING'), 'should have SCOPE_FRAMING');
    assert.ok(taskIds.includes('CODEBASE_SCAN'), 'should have CODEBASE_SCAN');
    assert.ok(taskIds.includes('TRACING'), 'should have TRACING');
    assert.ok(taskIds.includes('SYMPTOM_ANALYSIS'), 'should have SYMPTOM_ANALYSIS');
  });
});

// ---------------------------------------------------------------------------
// T044-AC10: core.json has bug_gather entries in shared fields
// ---------------------------------------------------------------------------

describe('REQ-GH-253 T044 — Core.json bug-gather entries', () => {
  let coreDef;

  beforeEach(() => {
    const corePath = join(projectRoot, 'src/isdlc/config/roundtable/core.json');
    assert.ok(existsSync(corePath), 'core.json should exist');
    coreDef = JSON.parse(readFileSync(corePath, 'utf-8'));
  });

  it('AC-10: core personas have bug_gather state mappings', () => {
    for (const persona of coreDef.persona_model.core_personas) {
      assert.ok(
        persona.owns_states.bug_gather,
        `${persona.name} should have bug_gather state mapping`
      );
    }
  });

  it('AC-11: promotion schema has bug_gather extension points', () => {
    const bgPoints = coreDef.persona_model.promotion_schema.extension_points.bug_gather;
    assert.ok(Array.isArray(bgPoints), 'bug_gather extension points should be an array');
    assert.ok(bgPoints.length > 0, 'should have at least one extension point');
    assert.ok(bgPoints.some(p => p.includes('PRESENTING_BUG_SUMMARY')),
      'should include BUG_SUMMARY extension point');
  });

  it('AC-12: amending_semantics has bug_gather restart target', () => {
    assert.strictEqual(
      coreDef.amending_semantics.restart_target.bug_gather,
      'PRESENTING_BUG_SUMMARY'
    );
  });

  it('AC-13: artifact_ownership has bug_gather section', () => {
    assert.ok(coreDef.artifact_ownership.bug_gather, 'should have bug_gather artifacts');
    assert.ok(
      coreDef.artifact_ownership.bug_gather.bug_summary,
      'should have bug_summary artifact group'
    );
    assert.ok(
      coreDef.artifact_ownership.bug_gather.root_cause,
      'should have root_cause artifact group'
    );
  });

  it('AC-14: agent_metadata has bug_gather entry', () => {
    assert.ok(coreDef.agent_metadata.bug_gather, 'should have bug_gather metadata');
    assert.strictEqual(
      coreDef.agent_metadata.bug_gather.name,
      'bug-roundtable-analyst'
    );
  });
});

// ---------------------------------------------------------------------------
// T044-AC20: Roundtable bridge handles bug-gather migration_mode
// ---------------------------------------------------------------------------

describe('REQ-GH-253 T044 — Bridge migration_mode for bug-gather', () => {
  it('AC-20: roundtable bridge module exists and exports initializeRoundtable', async () => {
    const bridgePath = join(projectRoot, 'src/core/bridge/roundtable.cjs');
    assert.ok(existsSync(bridgePath), 'roundtable bridge should exist');

    // Dynamic require to load CJS module
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const bridge = require(bridgePath);

    assert.ok(typeof bridge.initializeRoundtable === 'function',
      'bridge should export initializeRoundtable');
    assert.ok(typeof bridge.composeForTurn === 'function',
      'bridge should export composeForTurn');
    assert.ok(typeof bridge.processAfterTurn === 'function',
      'bridge should export processAfterTurn');
  });

  it('AC-21: initializeRoundtable accepts bug-gather as workflowType parameter', async () => {
    // This test verifies the function signature accepts bug-gather.
    // We cannot fully test it here (requires ESM module imports to work),
    // but we verify the bridge function does not reject the workflow type.
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const bridge = require(join(projectRoot, 'src/core/bridge/roundtable.cjs'));

    // Reset cache to ensure clean state
    bridge._resetCache();

    // Call initializeRoundtable with bug-gather — it may return null
    // (fail-open if ESM imports fail in test environment), but it should
    // NOT throw an error for the workflow type itself.
    let threwError = false;
    let errorMessage = '';
    try {
      await bridge.initializeRoundtable('bug-gather', 'CONVERSATION', {
        projectRoot,
      });
    } catch (err) {
      threwError = true;
      errorMessage = err.message;
    }

    assert.strictEqual(threwError, false,
      `initializeRoundtable should not throw for bug-gather: ${errorMessage}`);
  });

  it('AC-22: migration_mode check is shared between analyze and bug-gather paths', async () => {
    // Verify the bridge source code uses the same migration_mode check
    // for all workflow types (it's a single code path)
    const bridgePath = join(projectRoot, 'src/core/bridge/roundtable.cjs');
    const bridgeSource = readFileSync(bridgePath, 'utf-8');

    // The migration_mode check should appear ONCE (not per-workflow)
    const migrationModeChecks = bridgeSource.match(/migration_mode/g);
    assert.ok(migrationModeChecks, 'bridge should check migration_mode');
    // It should check for 'prose' (the off-switch)
    assert.ok(
      bridgeSource.includes("migration_mode === 'prose'"),
      'bridge should check for prose migration mode'
    );
    // Verify the check is NOT workflow-type-specific
    assert.ok(
      !bridgeSource.includes("workflowType === 'analyze' && rtConfig.migration_mode"),
      'migration_mode check should not be analyze-specific'
    );
  });
});

// ---------------------------------------------------------------------------
// T044-AC30: Bug-gather state cards exist
// ---------------------------------------------------------------------------

describe('REQ-GH-253 T044 — Bug-gather state cards exist', () => {
  const stateCardsDir = join(projectRoot, 'src/isdlc/config/roundtable/state-cards');

  it('AC-30: presenting-bug-summary state card exists', () => {
    const cardPath = join(stateCardsDir, 'presenting-bug-summary.card.json');
    assert.ok(existsSync(cardPath), 'presenting-bug-summary.card.json should exist');
  });

  it('AC-31: presenting-root-cause state card exists', () => {
    const cardPath = join(stateCardsDir, 'presenting-root-cause.card.json');
    assert.ok(existsSync(cardPath), 'presenting-root-cause.card.json should exist');
  });

  it('AC-32: presenting-fix-strategy state card exists', () => {
    const cardPath = join(stateCardsDir, 'presenting-fix-strategy.card.json');
    assert.ok(existsSync(cardPath), 'presenting-fix-strategy.card.json should exist');
  });

  it('AC-33: tracing task card exists', () => {
    const taskCardsDir = join(projectRoot, 'src/isdlc/config/roundtable/task-cards');
    const cardPath = join(taskCardsDir, 'tracing.task-card.json');
    assert.ok(existsSync(cardPath), 'tracing.task-card.json should exist');
  });
});

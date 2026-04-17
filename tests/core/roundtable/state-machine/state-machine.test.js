/**
 * Unit tests for state-machine.js (REQ-GH-253)
 *
 * Verifies state machine runtime: initialization, transition evaluation,
 * sub-task activation, external delegation support, transition history,
 * and AMENDING semantics.
 *
 * Traces to: FR-002, AC-002-01, AC-002-02
 * Test runner: node:test (ESM, Article XIII)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { initialize } from '../../../../src/core/roundtable/state-machine.js';

// ---------------------------------------------------------------------------
// Fixtures — mirrors real analyze.json / bug-gather.json structure
// ---------------------------------------------------------------------------

/**
 * Minimal definition with object-keyed states matching real definition format.
 * Includes CONVERSATION with sub-tasks and a confirmation state sequence.
 */
const ANALYZE_DEFINITION = {
  version: '1.0.0',
  workflow_type: 'analyze',
  entry_state: 'CONVERSATION',
  completion_signal: 'ROUNDTABLE_COMPLETE',
  confirmation_sequence: [
    'PRESENTING_REQUIREMENTS',
    'PRESENTING_ARCHITECTURE',
    'PRESENTING_DESIGN',
    'PRESENTING_TASKS',
  ],
  states: {
    CONVERSATION: {
      description: 'Interactive roundtable conversation',
      template: null,
      sub_tasks: {
        execution_order: 'dynamic',
        tasks: [
          {
            id: 'SCOPE_FRAMING',
            triggers: ['session_start', 'first_exchange'],
            completion_marker: 'scope_framed',
          },
          {
            id: 'CODEBASE_SCAN',
            triggers: ['after_first_user_reply'],
            completion_marker: 'scan_complete',
          },
          {
            id: 'BLAST_RADIUS',
            triggers: ['scan_complete'],
            depends_on: ['CODEBASE_SCAN'],
            completion_marker: 'blast_radius_assessed',
          },
          {
            id: 'OPTIONS_RESEARCH',
            triggers: ['scope_framed', 'blast_radius_assessed'],
            depends_on: ['SCOPE_FRAMING', 'BLAST_RADIUS'],
            completion_marker: 'options_researched',
          },
          {
            id: 'DEPENDENCY_CHECK',
            triggers: ['scan_complete'],
            depends_on: ['CODEBASE_SCAN'],
            completion_marker: 'dependencies_checked',
          },
        ],
      },
      exit_markers: ['coverage_complete', 'participation_gate_satisfied'],
      transitions: [
        {
          condition: 'coverage_complete AND participation_gate_satisfied',
          target: 'PRESENTING_REQUIREMENTS',
        },
        {
          condition: 'early_exit_signal',
          target: 'FINALIZING',
        },
      ],
    },
    PRESENTING_REQUIREMENTS: {
      description: 'Maya presents requirements',
      is_confirmation: true,
      template_ref: 'requirements.template.json',
      transitions: [
        { condition: 'accept', target: 'PRESENTING_ARCHITECTURE' },
        { condition: 'amend', target: 'AMENDING' },
      ],
    },
    PRESENTING_ARCHITECTURE: {
      description: 'Alex presents architecture',
      is_confirmation: true,
      template_ref: 'architecture.template.json',
      transitions: [
        { condition: 'accept', target: 'PRESENTING_DESIGN' },
        { condition: 'amend', target: 'AMENDING' },
      ],
    },
    PRESENTING_DESIGN: {
      description: 'Jordan presents design',
      is_confirmation: true,
      template_ref: 'design.template.json',
      transitions: [
        { condition: 'accept', target: 'PRESENTING_TASKS' },
        { condition: 'amend', target: 'AMENDING' },
      ],
    },
    PRESENTING_TASKS: {
      description: 'Lead presents tasks',
      is_confirmation: true,
      template_ref: 'traceability.template.json',
      transitions: [
        { condition: 'accept', target: 'FINALIZING' },
        { condition: 'amend', target: 'AMENDING' },
      ],
    },
    AMENDING: {
      description: 'User chose Amend',
      transitions: [
        { condition: 'resolution_reached', target: 'PRESENTING_REQUIREMENTS' },
      ],
    },
    FINALIZING: {
      description: 'Batch write artifacts',
      transitions: [
        { condition: 'batch_write_complete', target: 'COMPLETE' },
      ],
    },
    COMPLETE: {
      description: 'Terminal state',
      terminal: true,
      emit: 'ROUNDTABLE_COMPLETE',
    },
  },
};

/**
 * Bug-gather definition with external_delegation on PRESENTING_BUG_SUMMARY accept.
 */
const BUG_GATHER_DEFINITION = {
  version: '1.0.0',
  workflow_type: 'bug_gather',
  entry_state: 'CONVERSATION',
  completion_signal: 'BUG_ROUNDTABLE_COMPLETE',
  confirmation_sequence: [
    'PRESENTING_BUG_SUMMARY',
    'PRESENTING_ROOT_CAUSE',
    'PRESENTING_FIX_STRATEGY',
    'PRESENTING_TASKS',
  ],
  states: {
    CONVERSATION: {
      description: 'Bug roundtable conversation',
      sub_tasks: {
        execution_order: 'dynamic',
        tasks: [
          {
            id: 'SCOPE_FRAMING',
            triggers: ['session_start'],
            completion_marker: 'scope_framed',
          },
          {
            id: 'CODEBASE_SCAN',
            triggers: ['after_first_user_reply'],
            completion_marker: 'scan_complete',
          },
        ],
      },
      transitions: [
        {
          condition: 'participation_gate_satisfied AND bug_understanding_reached',
          target: 'PRESENTING_BUG_SUMMARY',
        },
      ],
    },
    PRESENTING_BUG_SUMMARY: {
      description: 'Maya presents bug summary',
      is_confirmation: true,
      template_ref: 'bug-summary.template.json',
      transitions: [
        {
          condition: 'accept',
          target: 'PRESENTING_ROOT_CAUSE',
          external_delegation: {
            agent: 'tracing-orchestrator',
            input_mapping: {
              BUG_REPORT_PATH: '{ARTIFACT_FOLDER}/bug-report.md',
            },
            timeout_ms: 120000,
            fail_open: { enabled: true, fallback: 'conversation-based hypotheses' },
          },
        },
        { condition: 'amend', target: 'AMENDING' },
      ],
    },
    PRESENTING_ROOT_CAUSE: {
      description: 'Alex presents root cause',
      is_confirmation: true,
      transitions: [
        { condition: 'accept', target: 'PRESENTING_FIX_STRATEGY' },
        { condition: 'amend', target: 'AMENDING' },
      ],
    },
    PRESENTING_FIX_STRATEGY: {
      description: 'Jordan presents fix strategy',
      is_confirmation: true,
      transitions: [
        { condition: 'accept', target: 'PRESENTING_TASKS' },
        { condition: 'amend', target: 'AMENDING' },
      ],
    },
    PRESENTING_TASKS: {
      description: 'Lead presents tasks',
      is_confirmation: true,
      transitions: [
        { condition: 'accept', target: 'FINALIZING' },
        { condition: 'amend', target: 'AMENDING' },
      ],
    },
    AMENDING: {
      description: 'User chose Amend',
      transitions: [
        { condition: 'resolution_reached', target: 'PRESENTING_BUG_SUMMARY' },
      ],
    },
    FINALIZING: {
      description: 'Batch write artifacts',
      transitions: [
        { condition: 'batch_write_complete', target: 'COMPLETE' },
      ],
    },
    COMPLETE: {
      description: 'Terminal state',
      terminal: true,
      emit: 'BUG_ROUNDTABLE_COMPLETE',
    },
  },
};

// ---------------------------------------------------------------------------
// SM-07: Initialize to entry state (positive, AC-002-01)
// ---------------------------------------------------------------------------

describe('REQ-GH-253 state-machine', () => {

  describe('initialize', () => {
    it('SM-07: initializes to the entry state (CONVERSATION)', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'CONVERSATION');
      assert.ok(sm, 'initialize should return a non-null instance');
      assert.strictEqual(sm.getCurrentState(), 'CONVERSATION');
    });

    it('SM-08: entry state has first sub-task activated', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'CONVERSATION');
      assert.strictEqual(sm.getActiveSubTask(), 'SCOPE_FRAMING');
    });

    it('initializes to a non-entry state when requested', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'PRESENTING_REQUIREMENTS');
      assert.strictEqual(sm.getCurrentState(), 'PRESENTING_REQUIREMENTS');
      assert.strictEqual(sm.getActiveSubTask(), null);
    });

    it('returns null for invalid definition (null)', () => {
      const sm = initialize(null, 'CONVERSATION');
      assert.strictEqual(sm, null);
    });

    it('returns null for missing states object', () => {
      const sm = initialize({ version: '1.0.0' }, 'CONVERSATION');
      assert.strictEqual(sm, null);
    });

    it('returns null when entry state not found in definition', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'NONEXISTENT');
      assert.strictEqual(sm, null);
    });

    it('returns null for empty entryState string', () => {
      const sm = initialize(ANALYZE_DEFINITION, '');
      assert.strictEqual(sm, null);
    });

    it('freezes the definition graph (immutable graph)', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'CONVERSATION');
      const stateDef = sm.getStateDefinition('CONVERSATION');
      assert.throws(() => { stateDef.description = 'mutated'; }, TypeError);
    });

    it('starts with empty transition history', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'CONVERSATION');
      const history = sm.getTransitionHistory();
      assert.strictEqual(history.length, 0);
    });
  });

  // ---------------------------------------------------------------------------
  // currentCard / currentSubTask accessors
  // ---------------------------------------------------------------------------

  describe('currentCard', () => {
    it('returns null for CONVERSATION (no template)', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'CONVERSATION');
      assert.strictEqual(sm.currentCard(), null);
    });

    it('returns template_ref for confirmation state', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'PRESENTING_REQUIREMENTS');
      assert.strictEqual(sm.currentCard(), 'requirements.template.json');
    });
  });

  describe('currentSubTask', () => {
    it('returns sub-task definition for active sub-task', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'CONVERSATION');
      const subTask = sm.currentSubTask();
      assert.ok(subTask);
      assert.strictEqual(subTask.id, 'SCOPE_FRAMING');
      assert.deepStrictEqual(subTask.triggers, ['session_start', 'first_exchange']);
    });

    it('returns null when no sub-tasks in current state', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'PRESENTING_REQUIREMENTS');
      assert.strictEqual(sm.currentSubTask(), null);
    });
  });

  describe('getStateDefinition', () => {
    it('returns full state definition for a valid state name', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'CONVERSATION');
      const stateDef = sm.getStateDefinition('PRESENTING_REQUIREMENTS');
      assert.ok(stateDef);
      assert.strictEqual(stateDef.description, 'Maya presents requirements');
      assert.strictEqual(stateDef.is_confirmation, true);
    });

    it('returns null for unknown state name', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'CONVERSATION');
      assert.strictEqual(sm.getStateDefinition('NONEXISTENT'), null);
    });
  });

  // ---------------------------------------------------------------------------
  // SM-09/10: evaluateTransitions — state-level transitions
  // ---------------------------------------------------------------------------

  describe('evaluateTransitions — state transitions', () => {
    it('SM-09: transitions from CONVERSATION to PRESENTING_REQUIREMENTS', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'CONVERSATION');
      const result = sm.evaluateTransitions({
        coverage_complete: true,
        participation_gate_satisfied: true,
        sub_task_completion: {},
      });
      assert.strictEqual(result.transitioned, true);
      assert.strictEqual(result.newState, 'PRESENTING_REQUIREMENTS');
      assert.strictEqual(result.previousState, 'CONVERSATION');
      assert.strictEqual(sm.getCurrentState(), 'PRESENTING_REQUIREMENTS');
    });

    it('SM-10: stays in current state when no trigger matched', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'CONVERSATION');
      const result = sm.evaluateTransitions({
        coverage_complete: false,
        sub_task_completion: {},
      });
      assert.strictEqual(result.transitioned, false);
      assert.strictEqual(result.newState, null);
      assert.strictEqual(sm.getCurrentState(), 'CONVERSATION');
    });

    it('transitions on accept from confirmation state', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'PRESENTING_REQUIREMENTS');
      const result = sm.evaluateTransitions({ accept: true });
      assert.strictEqual(result.transitioned, true);
      assert.strictEqual(result.newState, 'PRESENTING_ARCHITECTURE');
    });

    it('transitions on amend from confirmation state to AMENDING', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'PRESENTING_REQUIREMENTS');
      const result = sm.evaluateTransitions({ amend: true });
      assert.strictEqual(result.transitioned, true);
      assert.strictEqual(result.newState, 'AMENDING');
      assert.strictEqual(result.clearAcceptedDomains, true);
    });

    it('AMENDING transitions to first confirmation on resolution_reached', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'AMENDING');
      const result = sm.evaluateTransitions({ resolution_reached: true });
      assert.strictEqual(result.transitioned, true);
      assert.strictEqual(result.newState, 'PRESENTING_REQUIREMENTS');
    });

    it('FINALIZING transitions to COMPLETE on batch_write_complete', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'FINALIZING');
      const result = sm.evaluateTransitions({ batch_write_complete: true });
      assert.strictEqual(result.transitioned, true);
      assert.strictEqual(result.newState, 'COMPLETE');
    });

    it('terminal state never transitions', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'COMPLETE');
      const result = sm.evaluateTransitions({ anything: true });
      assert.strictEqual(result.transitioned, false);
    });

    it('early exit signal transitions CONVERSATION to FINALIZING', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'CONVERSATION');
      const result = sm.evaluateTransitions({ early_exit_signal: true, sub_task_completion: {} });
      assert.strictEqual(result.transitioned, true);
      assert.strictEqual(result.newState, 'FINALIZING');
    });

    it('supports user_response accept/amend field', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'PRESENTING_DESIGN');
      const result = sm.evaluateTransitions({ user_response: 'accept', accept: true });
      assert.strictEqual(result.transitioned, true);
      assert.strictEqual(result.newState, 'PRESENTING_TASKS');
    });
  });

  // ---------------------------------------------------------------------------
  // SM-11: Sub-task activation
  // ---------------------------------------------------------------------------

  describe('evaluateTransitions — sub-task progression', () => {
    it('SM-11: sub-task advances when completion marker is set', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'CONVERSATION');
      assert.strictEqual(sm.getActiveSubTask(), 'SCOPE_FRAMING');

      // Mark SCOPE_FRAMING complete, trigger CODEBASE_SCAN
      const result = sm.evaluateTransitions({
        sub_task_completion: { SCOPE_FRAMING: true },
        scope_framed: true,
      });

      // Should not have transitioned state (coverage not met)
      assert.strictEqual(result.transitioned, false);
      assert.strictEqual(sm.getCurrentState(), 'CONVERSATION');
      // Sub-task should have changed to CODEBASE_SCAN
      assert.strictEqual(sm.getActiveSubTask(), 'CODEBASE_SCAN');
      assert.strictEqual(result.subTaskChanged, true);
    });

    it('sub-task respects depends_on ordering', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'CONVERSATION');

      // BLAST_RADIUS depends on CODEBASE_SCAN — should not activate if only SCOPE_FRAMING is done
      const result = sm.evaluateTransitions({
        sub_task_completion: {
          SCOPE_FRAMING: true,
          CODEBASE_SCAN: false,
        },
        scope_framed: true,
      });

      // Active sub-task should be CODEBASE_SCAN (not BLAST_RADIUS)
      assert.strictEqual(sm.getActiveSubTask(), 'CODEBASE_SCAN');
    });

    it('activates BLAST_RADIUS after CODEBASE_SCAN completes', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'CONVERSATION');

      const result = sm.evaluateTransitions({
        sub_task_completion: {
          SCOPE_FRAMING: true,
          CODEBASE_SCAN: true,
        },
        scope_framed: true,
        scan_complete: true,
      });

      assert.strictEqual(sm.getActiveSubTask(), 'BLAST_RADIUS');
    });

    it('sets activeSubTask to null when all sub-tasks complete', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'CONVERSATION');

      const result = sm.evaluateTransitions({
        sub_task_completion: {
          SCOPE_FRAMING: true,
          CODEBASE_SCAN: true,
          BLAST_RADIUS: true,
          OPTIONS_RESEARCH: true,
          DEPENDENCY_CHECK: true,
        },
        scope_framed: true,
        scan_complete: true,
        blast_radius_assessed: true,
        options_researched: true,
        dependencies_checked: true,
      });

      assert.strictEqual(sm.getActiveSubTask(), null);
    });
  });

  // ---------------------------------------------------------------------------
  // SM-12: External delegation
  // ---------------------------------------------------------------------------

  describe('evaluateTransitions — external delegation', () => {
    it('SM-12: transition includes externalDelegation when present', () => {
      const sm = initialize(BUG_GATHER_DEFINITION, 'PRESENTING_BUG_SUMMARY');
      const result = sm.evaluateTransitions({ accept: true });

      assert.strictEqual(result.transitioned, true);
      assert.strictEqual(result.newState, 'PRESENTING_ROOT_CAUSE');
      assert.ok(result.externalDelegation, 'externalDelegation should be present');
      assert.strictEqual(result.externalDelegation.agent, 'tracing-orchestrator');
      assert.strictEqual(result.externalDelegation.timeout, 120000);
      assert.strictEqual(result.externalDelegation.failOpen, true);
      assert.ok(result.externalDelegation.inputMapping.BUG_REPORT_PATH);
    });

    it('transition without external_delegation has no externalDelegation field', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'PRESENTING_REQUIREMENTS');
      const result = sm.evaluateTransitions({ accept: true });
      assert.strictEqual(result.transitioned, true);
      assert.strictEqual(result.externalDelegation, undefined);
    });

    it('external delegation fail_open defaults to true when unspecified', () => {
      // Create a definition with external_delegation missing fail_open
      const def = JSON.parse(JSON.stringify(BUG_GATHER_DEFINITION));
      def.states.PRESENTING_BUG_SUMMARY.transitions[0].external_delegation = {
        agent: 'test-agent',
      };
      const sm = initialize(def, 'PRESENTING_BUG_SUMMARY');
      const result = sm.evaluateTransitions({ accept: true });
      assert.strictEqual(result.externalDelegation.failOpen, true);
    });
  });

  // ---------------------------------------------------------------------------
  // Transition history (NFR-004)
  // ---------------------------------------------------------------------------

  describe('transition history', () => {
    it('records each transition with from, to, trigger, timestamp', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'PRESENTING_REQUIREMENTS');
      sm.evaluateTransitions({ accept: true });

      const history = sm.getTransitionHistory();
      assert.strictEqual(history.length, 1);
      assert.strictEqual(history[0].from, 'PRESENTING_REQUIREMENTS');
      assert.strictEqual(history[0].to, 'PRESENTING_ARCHITECTURE');
      assert.strictEqual(history[0].trigger, 'accept');
      assert.ok(history[0].timestamp);
    });

    it('accumulates multiple transitions', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'PRESENTING_REQUIREMENTS');
      sm.evaluateTransitions({ accept: true }); // -> PRESENTING_ARCHITECTURE
      sm.evaluateTransitions({ accept: true }); // -> PRESENTING_DESIGN
      sm.evaluateTransitions({ accept: true }); // -> PRESENTING_TASKS

      const history = sm.getTransitionHistory();
      assert.strictEqual(history.length, 3);
      assert.strictEqual(history[0].to, 'PRESENTING_ARCHITECTURE');
      assert.strictEqual(history[1].to, 'PRESENTING_DESIGN');
      assert.strictEqual(history[2].to, 'PRESENTING_TASKS');
    });

    it('records sub-task change in transition event', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'CONVERSATION');
      sm.evaluateTransitions({
        coverage_complete: true,
        participation_gate_satisfied: true,
        sub_task_completion: {},
      });

      const history = sm.getTransitionHistory();
      assert.strictEqual(history.length, 1);
      // CONVERSATION had SCOPE_FRAMING; PRESENTING_REQUIREMENTS has none
      assert.ok(history[0].subTaskChange);
      assert.strictEqual(history[0].subTaskChange.from, 'SCOPE_FRAMING');
      assert.strictEqual(history[0].subTaskChange.to, null);
    });

    it('returns a copy of history (not mutable reference)', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'PRESENTING_REQUIREMENTS');
      sm.evaluateTransitions({ accept: true });

      const history1 = sm.getTransitionHistory();
      const history2 = sm.getTransitionHistory();
      assert.notStrictEqual(history1, history2);
      assert.strictEqual(history1.length, history2.length);
    });
  });

  // ---------------------------------------------------------------------------
  // Full workflow traversal
  // ---------------------------------------------------------------------------

  describe('full workflow traversal — analyze', () => {
    it('traverses CONVERSATION through all confirmations to COMPLETE', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'CONVERSATION');

      // CONVERSATION -> PRESENTING_REQUIREMENTS
      sm.evaluateTransitions({
        coverage_complete: true,
        participation_gate_satisfied: true,
        sub_task_completion: {},
      });
      assert.strictEqual(sm.getCurrentState(), 'PRESENTING_REQUIREMENTS');

      // Accept requirements -> PRESENTING_ARCHITECTURE
      sm.evaluateTransitions({ accept: true });
      assert.strictEqual(sm.getCurrentState(), 'PRESENTING_ARCHITECTURE');

      // Accept architecture -> PRESENTING_DESIGN
      sm.evaluateTransitions({ accept: true });
      assert.strictEqual(sm.getCurrentState(), 'PRESENTING_DESIGN');

      // Accept design -> PRESENTING_TASKS
      sm.evaluateTransitions({ accept: true });
      assert.strictEqual(sm.getCurrentState(), 'PRESENTING_TASKS');

      // Accept tasks -> FINALIZING
      sm.evaluateTransitions({ accept: true });
      assert.strictEqual(sm.getCurrentState(), 'FINALIZING');

      // Batch write complete -> COMPLETE
      sm.evaluateTransitions({ batch_write_complete: true });
      assert.strictEqual(sm.getCurrentState(), 'COMPLETE');

      // Verify full history
      assert.strictEqual(sm.getTransitionHistory().length, 6);
    });
  });

  describe('full workflow traversal — bug-gather', () => {
    it('traverses CONVERSATION through all confirmations to COMPLETE', () => {
      const sm = initialize(BUG_GATHER_DEFINITION, 'CONVERSATION');

      // CONVERSATION -> PRESENTING_BUG_SUMMARY
      sm.evaluateTransitions({
        participation_gate_satisfied: true,
        bug_understanding_reached: true,
        sub_task_completion: {},
      });
      assert.strictEqual(sm.getCurrentState(), 'PRESENTING_BUG_SUMMARY');

      // Accept -> PRESENTING_ROOT_CAUSE (with external delegation)
      const bugSummaryResult = sm.evaluateTransitions({ accept: true });
      assert.strictEqual(sm.getCurrentState(), 'PRESENTING_ROOT_CAUSE');
      assert.ok(bugSummaryResult.externalDelegation);

      // Accept root cause -> PRESENTING_FIX_STRATEGY
      sm.evaluateTransitions({ accept: true });
      assert.strictEqual(sm.getCurrentState(), 'PRESENTING_FIX_STRATEGY');

      // Accept fix strategy -> PRESENTING_TASKS
      sm.evaluateTransitions({ accept: true });
      assert.strictEqual(sm.getCurrentState(), 'PRESENTING_TASKS');

      // Accept tasks -> FINALIZING
      sm.evaluateTransitions({ accept: true });
      assert.strictEqual(sm.getCurrentState(), 'FINALIZING');

      // Batch write -> COMPLETE
      sm.evaluateTransitions({ batch_write_complete: true });
      assert.strictEqual(sm.getCurrentState(), 'COMPLETE');

      assert.strictEqual(sm.getTransitionHistory().length, 6);
    });
  });

  // ---------------------------------------------------------------------------
  // AMENDING cycle
  // ---------------------------------------------------------------------------

  describe('AMENDING cycle', () => {
    it('amend from any confirmation restarts from first confirmation', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'PRESENTING_DESIGN');

      // Amend -> AMENDING
      const amendResult = sm.evaluateTransitions({ amend: true });
      assert.strictEqual(sm.getCurrentState(), 'AMENDING');
      assert.strictEqual(amendResult.clearAcceptedDomains, true);

      // Resolution -> PRESENTING_REQUIREMENTS (restart from top)
      sm.evaluateTransitions({ resolution_reached: true });
      assert.strictEqual(sm.getCurrentState(), 'PRESENTING_REQUIREMENTS');
    });

    it('bug-gather amend restarts to PRESENTING_BUG_SUMMARY', () => {
      const sm = initialize(BUG_GATHER_DEFINITION, 'PRESENTING_FIX_STRATEGY');

      sm.evaluateTransitions({ amend: true });
      assert.strictEqual(sm.getCurrentState(), 'AMENDING');

      sm.evaluateTransitions({ resolution_reached: true });
      assert.strictEqual(sm.getCurrentState(), 'PRESENTING_BUG_SUMMARY');
    });
  });

  // ---------------------------------------------------------------------------
  // AND/OR condition evaluation
  // ---------------------------------------------------------------------------

  describe('compound condition evaluation', () => {
    it('AND condition requires all parts true', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'CONVERSATION');

      // Only coverage_complete, not participation_gate
      const r1 = sm.evaluateTransitions({
        coverage_complete: true,
        participation_gate_satisfied: false,
        sub_task_completion: {},
      });
      assert.strictEqual(r1.transitioned, false);

      // Both true
      const r2 = sm.evaluateTransitions({
        coverage_complete: true,
        participation_gate_satisfied: true,
        sub_task_completion: {},
      });
      assert.strictEqual(r2.transitioned, true);
    });

    it('bug-gather AND condition works', () => {
      const sm = initialize(BUG_GATHER_DEFINITION, 'CONVERSATION');

      // Only one condition
      const r1 = sm.evaluateTransitions({
        participation_gate_satisfied: true,
        bug_understanding_reached: false,
        sub_task_completion: {},
      });
      assert.strictEqual(r1.transitioned, false);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('evaluateTransitions with undefined rolling state', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'PRESENTING_REQUIREMENTS');
      const result = sm.evaluateTransitions(undefined);
      assert.strictEqual(result.transitioned, false);
    });

    it('evaluateTransitions with empty rolling state', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'PRESENTING_REQUIREMENTS');
      const result = sm.evaluateTransitions({});
      assert.strictEqual(result.transitioned, false);
    });

    it('handles state with no sub-tasks gracefully', () => {
      const sm = initialize(ANALYZE_DEFINITION, 'PRESENTING_REQUIREMENTS');
      assert.strictEqual(sm.getActiveSubTask(), null);
      assert.strictEqual(sm.currentSubTask(), null);
    });

    it('handles transition to state that does not exist gracefully', () => {
      // Create a definition with a broken transition target
      const brokenDef = JSON.parse(JSON.stringify(ANALYZE_DEFINITION));
      brokenDef.states.PRESENTING_REQUIREMENTS.transitions = [
        { condition: 'accept', target: 'DOES_NOT_EXIST' },
        { condition: 'accept', target: 'PRESENTING_ARCHITECTURE' },
      ];
      const sm = initialize(brokenDef, 'PRESENTING_REQUIREMENTS');
      const result = sm.evaluateTransitions({ accept: true });
      // Should skip the broken transition and find the valid one
      assert.strictEqual(result.transitioned, true);
      assert.strictEqual(result.newState, 'PRESENTING_ARCHITECTURE');
    });

    it('validation rejects non-terminal state missing transitions array', () => {
      const badDef = {
        states: {
          CONVERSATION: { description: 'no transitions' },
          COMPLETE: { terminal: true },
        },
      };
      const sm = initialize(badDef, 'CONVERSATION');
      assert.strictEqual(sm, null);
    });
  });

  // ---------------------------------------------------------------------------
  // evaluateCondition — tier, OR, ==, != conditions
  // ---------------------------------------------------------------------------

  describe('condition evaluation — tier-based and comparison', () => {
    it('evaluates tier == condition correctly', () => {
      const def = JSON.parse(JSON.stringify(ANALYZE_DEFINITION));
      def.states.PRESENTING_REQUIREMENTS.transitions = [
        { condition: 'tier == standard', target: 'PRESENTING_ARCHITECTURE' },
      ];
      const sm = initialize(def, 'PRESENTING_REQUIREMENTS');

      // No tier set — should not match
      const r1 = sm.evaluateTransitions({ tier: 'light' });
      assert.strictEqual(r1.transitioned, false);

      // Matching tier
      const r2 = sm.evaluateTransitions({ tier: 'standard' });
      assert.strictEqual(r2.transitioned, true);
      assert.strictEqual(r2.newState, 'PRESENTING_ARCHITECTURE');
    });

    it('evaluates tier != condition', () => {
      const def = JSON.parse(JSON.stringify(ANALYZE_DEFINITION));
      def.states.PRESENTING_REQUIREMENTS.transitions = [
        { condition: 'tier != trivial', target: 'PRESENTING_ARCHITECTURE' },
      ];
      const sm = initialize(def, 'PRESENTING_REQUIREMENTS');

      const r1 = sm.evaluateTransitions({ tier: 'trivial' });
      assert.strictEqual(r1.transitioned, false);

      const sm2 = initialize(def, 'PRESENTING_REQUIREMENTS');
      const r2 = sm2.evaluateTransitions({ tier: 'standard' });
      assert.strictEqual(r2.transitioned, true);
    });

    it('evaluates tier IN [list] condition', () => {
      const def = JSON.parse(JSON.stringify(ANALYZE_DEFINITION));
      def.states.PRESENTING_REQUIREMENTS.transitions = [
        { condition: 'tier IN [standard, epic]', target: 'PRESENTING_ARCHITECTURE' },
      ];
      const sm = initialize(def, 'PRESENTING_REQUIREMENTS');

      const r1 = sm.evaluateTransitions({ tier: 'light' });
      assert.strictEqual(r1.transitioned, false);

      const sm2 = initialize(def, 'PRESENTING_REQUIREMENTS');
      const r2 = sm2.evaluateTransitions({ tier: 'epic' });
      assert.strictEqual(r2.transitioned, true);
    });

    it('evaluates simple key == value condition', () => {
      const def = JSON.parse(JSON.stringify(ANALYZE_DEFINITION));
      def.states.PRESENTING_REQUIREMENTS.transitions = [
        { condition: 'mode == production', target: 'PRESENTING_ARCHITECTURE' },
      ];
      const sm = initialize(def, 'PRESENTING_REQUIREMENTS');

      const r1 = sm.evaluateTransitions({ mode: 'test' });
      assert.strictEqual(r1.transitioned, false);

      const sm2 = initialize(def, 'PRESENTING_REQUIREMENTS');
      const r2 = sm2.evaluateTransitions({ mode: 'production' });
      assert.strictEqual(r2.transitioned, true);
    });

    it('evaluates simple key != value condition', () => {
      const def = JSON.parse(JSON.stringify(ANALYZE_DEFINITION));
      def.states.PRESENTING_REQUIREMENTS.transitions = [
        { condition: 'status != blocked', target: 'PRESENTING_ARCHITECTURE' },
      ];
      const sm = initialize(def, 'PRESENTING_REQUIREMENTS');

      const r1 = sm.evaluateTransitions({ status: 'blocked' });
      assert.strictEqual(r1.transitioned, false);

      const sm2 = initialize(def, 'PRESENTING_REQUIREMENTS');
      const r2 = sm2.evaluateTransitions({ status: 'ready' });
      assert.strictEqual(r2.transitioned, true);
    });

    it('evaluates OR condition', () => {
      const def = JSON.parse(JSON.stringify(ANALYZE_DEFINITION));
      def.states.PRESENTING_REQUIREMENTS.transitions = [
        { condition: 'flag_a OR flag_b', target: 'PRESENTING_ARCHITECTURE' },
      ];
      const sm = initialize(def, 'PRESENTING_REQUIREMENTS');

      // Neither true
      const r1 = sm.evaluateTransitions({ flag_a: false, flag_b: false });
      assert.strictEqual(r1.transitioned, false);

      // One true
      const sm2 = initialize(def, 'PRESENTING_REQUIREMENTS');
      const r2 = sm2.evaluateTransitions({ flag_a: true, flag_b: false });
      assert.strictEqual(r2.transitioned, true);
    });

    it('evaluates auto condition as always true', () => {
      const def = JSON.parse(JSON.stringify(ANALYZE_DEFINITION));
      def.states.PRESENTING_REQUIREMENTS.transitions = [
        { condition: 'auto', target: 'PRESENTING_ARCHITECTURE' },
      ];
      const sm = initialize(def, 'PRESENTING_REQUIREMENTS');
      const result = sm.evaluateTransitions({});
      assert.strictEqual(result.transitioned, true);
    });

    it('evaluates trivial_tier condition against tier field', () => {
      const def = JSON.parse(JSON.stringify(ANALYZE_DEFINITION));
      def.states.PRESENTING_REQUIREMENTS.transitions = [
        { condition: 'trivial_tier', target: 'FINALIZING' },
      ];
      const sm = initialize(def, 'PRESENTING_REQUIREMENTS');
      const r1 = sm.evaluateTransitions({ tier: 'standard' });
      assert.strictEqual(r1.transitioned, false);

      const sm2 = initialize(def, 'PRESENTING_REQUIREMENTS');
      const r2 = sm2.evaluateTransitions({ tier: 'trivial' });
      assert.strictEqual(r2.transitioned, true);
    });

    it('checks sub_task_completion for generic boolean conditions', () => {
      const def = JSON.parse(JSON.stringify(ANALYZE_DEFINITION));
      def.states.PRESENTING_REQUIREMENTS.transitions = [
        { condition: 'custom_flag', target: 'PRESENTING_ARCHITECTURE' },
      ];
      const sm = initialize(def, 'PRESENTING_REQUIREMENTS');
      const r = sm.evaluateTransitions({ sub_task_completion: { custom_flag: true } });
      assert.strictEqual(r.transitioned, true);
    });
  });

  // ---------------------------------------------------------------------------
  // next_on_accept / next_on_amend transition fields
  // ---------------------------------------------------------------------------

  describe('next_on_accept / next_on_amend transition fields', () => {
    it('uses next_on_accept when user accepts', () => {
      const def = JSON.parse(JSON.stringify(ANALYZE_DEFINITION));
      def.states.PRESENTING_REQUIREMENTS.transitions = [
        {
          condition: 'accept',
          next_on_accept: 'PRESENTING_DESIGN',
          next_on_amend: 'AMENDING',
        },
      ];
      const sm = initialize(def, 'PRESENTING_REQUIREMENTS');
      const result = sm.evaluateTransitions({ accept: true });
      assert.strictEqual(result.transitioned, true);
      assert.strictEqual(result.newState, 'PRESENTING_DESIGN');
    });

    it('uses next_on_amend when user amends', () => {
      const def = JSON.parse(JSON.stringify(ANALYZE_DEFINITION));
      def.states.PRESENTING_REQUIREMENTS.transitions = [
        {
          condition: 'amend',
          next_on_accept: 'PRESENTING_DESIGN',
          next_on_amend: 'AMENDING',
        },
      ];
      const sm = initialize(def, 'PRESENTING_REQUIREMENTS');
      const result = sm.evaluateTransitions({ amend: true });
      assert.strictEqual(result.transitioned, true);
      assert.strictEqual(result.newState, 'AMENDING');
    });

    it('falls back to target when no accept/amend signals', () => {
      const def = JSON.parse(JSON.stringify(ANALYZE_DEFINITION));
      def.states.PRESENTING_REQUIREMENTS.transitions = [
        {
          condition: 'auto',
          next_on_accept: 'PRESENTING_DESIGN',
          target: 'PRESENTING_ARCHITECTURE',
        },
      ];
      const sm = initialize(def, 'PRESENTING_REQUIREMENTS');
      // No accept/amend in rolling state
      const result = sm.evaluateTransitions({});
      assert.strictEqual(result.transitioned, true);
      assert.strictEqual(result.newState, 'PRESENTING_ARCHITECTURE');
    });

    it('uses "next" field as fallback when no "target"', () => {
      const def = JSON.parse(JSON.stringify(ANALYZE_DEFINITION));
      def.states.PRESENTING_REQUIREMENTS.transitions = [
        { condition: 'auto', next: 'PRESENTING_ARCHITECTURE' },
      ];
      const sm = initialize(def, 'PRESENTING_REQUIREMENTS');
      const result = sm.evaluateTransitions({});
      assert.strictEqual(result.transitioned, true);
      assert.strictEqual(result.newState, 'PRESENTING_ARCHITECTURE');
    });
  });

  // ---------------------------------------------------------------------------
  // Sub-task trigger edge cases
  // ---------------------------------------------------------------------------

  describe('sub-task trigger edge cases', () => {
    it('after_first_user_reply trigger is unsatisfied when no scope evidence', () => {
      // Custom definition where CODEBASE_SCAN only has after_first_user_reply trigger
      const def = JSON.parse(JSON.stringify(ANALYZE_DEFINITION));
      // Remove SCOPE_FRAMING so it cannot complete
      def.states.CONVERSATION.sub_tasks.tasks = [
        {
          id: 'CODEBASE_SCAN',
          triggers: ['after_first_user_reply'],
          completion_marker: 'scan_complete',
        },
      ];
      const sm = initialize(def, 'CONVERSATION');
      // With empty rolling state, after_first_user_reply checks scope evidence
      // None present, so CODEBASE_SCAN should not activate
      assert.strictEqual(sm.getActiveSubTask(), null);
    });

    it('after_first_user_reply is satisfied when scope_framed is true', () => {
      const def = JSON.parse(JSON.stringify(ANALYZE_DEFINITION));
      def.states.CONVERSATION.sub_tasks.tasks = [
        {
          id: 'CODEBASE_SCAN',
          triggers: ['after_first_user_reply'],
          completion_marker: 'scan_complete',
        },
      ];
      // Initialize with rolling state that has scope evidence
      const sm = initialize(def, 'CONVERSATION');
      // Evaluate with scope_framed true
      sm.evaluateTransitions({
        scope_framed: true,
        sub_task_completion: {},
      });
      assert.strictEqual(sm.getActiveSubTask(), 'CODEBASE_SCAN');
    });

    it('sub-task with unrecognized trigger is not activated', () => {
      const def = JSON.parse(JSON.stringify(ANALYZE_DEFINITION));
      def.states.CONVERSATION.sub_tasks.tasks = [
        {
          id: 'CUSTOM_TASK',
          triggers: ['some_unsatisfied_custom_condition'],
          completion_marker: 'custom_done',
        },
      ];
      const sm = initialize(def, 'CONVERSATION');
      assert.strictEqual(sm.getActiveSubTask(), null);
    });

    it('sub-task with entry_trigger field works like triggers array', () => {
      const def = JSON.parse(JSON.stringify(ANALYZE_DEFINITION));
      def.states.CONVERSATION.sub_tasks.tasks = [
        {
          id: 'SINGLE_TRIGGER_TASK',
          entry_trigger: 'session_start',
          completion_marker: 'done',
        },
      ];
      const sm = initialize(def, 'CONVERSATION');
      assert.strictEqual(sm.getActiveSubTask(), 'SINGLE_TRIGGER_TASK');
    });

    it('sub-task with no triggers or entry_trigger is always ready', () => {
      const def = JSON.parse(JSON.stringify(ANALYZE_DEFINITION));
      def.states.CONVERSATION.sub_tasks.tasks = [
        { id: 'NO_TRIGGER_TASK', completion_marker: 'done' },
      ];
      const sm = initialize(def, 'CONVERSATION');
      assert.strictEqual(sm.getActiveSubTask(), 'NO_TRIGGER_TASK');
    });
  });

  // ---------------------------------------------------------------------------
  // uses current_tier field fallback for tier conditions
  // ---------------------------------------------------------------------------

  describe('current_tier field fallback', () => {
    it('uses current_tier when tier is not set', () => {
      const def = JSON.parse(JSON.stringify(ANALYZE_DEFINITION));
      def.states.PRESENTING_REQUIREMENTS.transitions = [
        { condition: 'tier == standard', target: 'PRESENTING_ARCHITECTURE' },
      ];
      const sm = initialize(def, 'PRESENTING_REQUIREMENTS');
      const r = sm.evaluateTransitions({ current_tier: 'standard' });
      assert.strictEqual(r.transitioned, true);
    });
  });
});

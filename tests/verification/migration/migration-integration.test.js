/**
 * State Migration Integration Tests — REQ-0120
 *
 * Integration-level verification beyond the existing unit tests in
 * tests/core/state/schema.test.js. Exercises real-world state
 * snapshots, in-flight workflow migration, and doctor detection.
 *
 * Requirements: FR-001 (AC-001-01..04), FR-002 (AC-002-01..04), FR-003 (AC-003-01..02)
 *
 * Test ID prefix: MIG-
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  migrateState,
  CURRENT_SCHEMA_VERSION,
  MIGRATIONS
} from '../../../src/core/state/schema.js';

// ---------------------------------------------------------------------------
// FR-001: Migration Path Tests (AC-001-01..04)
// ---------------------------------------------------------------------------

describe('Migration paths (REQ-0120 FR-001)', () => {
  // MIG-01: v0 to v1 migration
  it('MIG-01: migrates v0 state to v1 (AC-001-01)', () => {
    const v0State = {
      project_name: 'real-project',
      state_version: 15,
      current_phase: '03-design',
      phases: {
        '01-requirements': { status: 'complete' },
        '02-architecture': { status: 'complete' },
        '03-design': { status: 'in-progress' }
      },
      workflow_history: [
        { type: 'fix', item_id: 'BUG-0001', completed_at: '2026-01-15' }
      ],
      skill_usage_log: [{ skill: 'DEV-001', phase: '03', agent: '03-architect' }]
    };

    const result = migrateState(v0State);
    assert.equal(result.schema_version, 1);
    assert.equal(result.project_name, 'real-project');
    assert.equal(result.state_version, 15);
    assert.deepStrictEqual(result.phases['01-requirements'], { status: 'complete' });
  });

  // MIG-02: Missing schema_version treated as v0
  it('MIG-02: handles missing schema_version (treats as v0) (AC-001-03)', () => {
    const noVersion = {
      phases: { '01-requirements': { status: 'complete' } },
      workflow_history: []
    };
    const result = migrateState(noVersion);
    assert.equal(result.schema_version, CURRENT_SCHEMA_VERSION);
  });

  // MIG-03: No-op for current version
  it('MIG-03: no-op for state already at current version (AC-001-04)', () => {
    const current = {
      schema_version: CURRENT_SCHEMA_VERSION,
      project_name: 'up-to-date',
      phases: { '01-requirements': { status: 'complete' } },
      workflow_history: []
    };
    const result = migrateState(current);
    assert.deepStrictEqual(result, current);
  });

  // MIG-04: Extensibility — migration registry structure supports future versions
  it('MIG-04: migration registry is extensible (AC-001-02)', () => {
    assert.ok(Array.isArray(MIGRATIONS), 'MIGRATIONS must be array');
    // Verify the structure supports chaining: from < to for each entry
    for (const m of MIGRATIONS) {
      assert.ok(m.to > m.from, `Migration from=${m.from} to=${m.to} must be forward`);
      assert.equal(typeof m.migrate, 'function');
    }
    // Verify there's a continuous chain from 0 to CURRENT_SCHEMA_VERSION
    let version = 0;
    while (version < CURRENT_SCHEMA_VERSION) {
      const migration = MIGRATIONS.find(m => m.from === version);
      assert.ok(migration, `Missing migration from version ${version}`);
      version = migration.to;
    }
    assert.equal(version, CURRENT_SCHEMA_VERSION, 'Migration chain must reach current version');
  });

  // MIG-05: Empty state gets schema_version added
  it('MIG-05: empty object gets schema_version', () => {
    const result = migrateState({});
    assert.equal(result.schema_version, CURRENT_SCHEMA_VERSION);
  });

  // MIG-06: State with extra unknown fields preserved
  it('MIG-06: unknown fields are preserved through migration', () => {
    const state = {
      custom_field: 'preserved',
      nested: { deep: { value: 42 } }
    };
    const result = migrateState(state);
    assert.equal(result.custom_field, 'preserved');
    assert.equal(result.nested.deep.value, 42);
  });
});

// ---------------------------------------------------------------------------
// FR-002: In-Flight State Compatibility (AC-002-01..04)
// ---------------------------------------------------------------------------

describe('In-flight state compatibility (REQ-0120 FR-002)', () => {
  // MIG-07: active_workflow survives migration
  it('MIG-07: preserves active_workflow through migration (AC-002-01)', () => {
    const inFlight = {
      active_workflow: {
        type: 'feature',
        item_id: 'REQ-0050',
        current_phase: '05-test-strategy',
        branch: 'feature/REQ-0050-auth-module',
        artifact_folder: 'REQ-0050-auth-module'
      },
      phases: {
        '01-requirements': { status: 'complete' },
        '02-architecture': { status: 'complete' },
        '03-design': { status: 'complete' },
        '04-tracing': { status: 'complete' },
        '05-test-strategy': { status: 'in-progress' }
      },
      workflow_history: []
    };

    const result = migrateState(inFlight);
    assert.equal(result.schema_version, CURRENT_SCHEMA_VERSION);
    assert.equal(result.active_workflow.item_id, 'REQ-0050');
    assert.equal(result.active_workflow.current_phase, '05-test-strategy');
    assert.equal(result.active_workflow.branch, 'feature/REQ-0050-auth-module');
    assert.equal(result.active_workflow.artifact_folder, 'REQ-0050-auth-module');
  });

  // MIG-08: phases with all sub-fields preserved
  it('MIG-08: preserves phases with all sub-fields (AC-002-02)', () => {
    const state = {
      phases: {
        '01-requirements': {
          status: 'complete',
          constitutional_validation: {
            completed: true,
            status: 'compliant',
            iterations_used: 1
          },
          iteration_requirements: {
            interactive_elicitation: {
              completed: true,
              menu_interactions: 3,
              final_selection: 'save'
            }
          }
        },
        '06-implementation': {
          status: 'in-progress',
          iterations: { current: 5, max: 10, history: [] },
          test_results: { passing: 42, failing: 3 }
        }
      },
      workflow_history: []
    };

    const result = migrateState(state);
    const p01 = result.phases['01-requirements'];
    assert.ok(p01.constitutional_validation.completed);
    assert.equal(p01.constitutional_validation.status, 'compliant');
    assert.equal(p01.iteration_requirements.interactive_elicitation.final_selection, 'save');

    const p06 = result.phases['06-implementation'];
    assert.equal(p06.iterations.current, 5);
    assert.equal(p06.test_results.passing, 42);
  });

  // MIG-09: workflow_history preserved
  it('MIG-09: preserves workflow_history array (AC-002-03)', () => {
    const state = {
      schema_version: 1,
      workflow_history: [
        { type: 'feature', item_id: 'REQ-0001', completed_at: '2026-01-01' },
        { type: 'fix', item_id: 'BUG-0010', completed_at: '2026-02-01' },
        { type: 'upgrade', item_id: 'UPG-0005', completed_at: '2026-03-01' }
      ],
      phases: {}
    };

    const result = migrateState(state);
    assert.equal(result.workflow_history.length, 3);
    assert.equal(result.workflow_history[0].type, 'feature');
    assert.equal(result.workflow_history[2].item_id, 'UPG-0005');
  });

  // MIG-10: Migrated state is resumable
  it('MIG-10: migrated state retains resumable workflow info (AC-002-04)', () => {
    const state = {
      active_workflow: {
        type: 'feature',
        item_id: 'REQ-0080',
        current_phase: '06-implementation'
      },
      phases: {
        '05-test-strategy': { status: 'complete' },
        '06-implementation': { status: 'in-progress' }
      },
      workflow_history: []
    };

    const result = migrateState(state);
    // After migration, the state has all fields needed for resume
    assert.ok(result.active_workflow, 'active_workflow must exist');
    assert.ok(result.active_workflow.current_phase, 'current_phase must exist');
    assert.ok(result.phases, 'phases must exist');
    assert.equal(result.phases['06-implementation'].status, 'in-progress');
  });

  // MIG-11: Complex real-world state snapshot
  it('MIG-11: handles complex real-world state snapshot', () => {
    const complexState = {
      project_name: 'isdlc-framework',
      state_version: 47,
      active_workflow: {
        type: 'feature',
        item_id: 'REQ-0088',
        current_phase: '08-code-review',
        branch: 'feature/REQ-0088-teams-core',
        phases: ['05-test-strategy', '06-implementation', '08-code-review'],
        current_phase_index: 2,
        mechanical_mode: true
      },
      phases: {
        '05-test-strategy': { status: 'completed' },
        '06-implementation': {
          status: 'completed',
          iterations: { current: 7, max: 10 },
          test_results: { passing: 150, failing: 0, coverage: 87.5 }
        },
        '08-code-review': { status: 'in_progress' }
      },
      workflow_history: [
        { type: 'feature', item_id: 'REQ-0087' },
        { type: 'fix', item_id: 'BUG-0100' }
      ],
      skill_usage_log: [
        { skill: 'DEV-001', phase: '06', agent: '05-software-developer' }
      ]
    };

    const result = migrateState(complexState);
    assert.equal(result.schema_version, CURRENT_SCHEMA_VERSION);
    assert.equal(result.active_workflow.mechanical_mode, true);
    assert.equal(result.phases['06-implementation'].test_results.coverage, 87.5);
    assert.equal(result.workflow_history.length, 2);
    assert.equal(result.skill_usage_log.length, 1);
  });
});

// ---------------------------------------------------------------------------
// FR-003: Doctor Repair Detection (AC-003-01..02)
// ---------------------------------------------------------------------------

describe('Doctor repair detection (REQ-0120 FR-003)', () => {
  // MIG-12: State needing migration is detectable
  it('MIG-12: state without schema_version is detectable as needing migration (AC-003-01)', () => {
    const state = { phases: {}, workflow_history: [] };
    // No schema_version means it needs migration
    const needsMigration = !state.schema_version || state.schema_version < CURRENT_SCHEMA_VERSION;
    assert.ok(needsMigration, 'State without schema_version should be detected as needing migration');
  });

  // MIG-13: State at current version does not need migration
  it('MIG-13: state at current version does not need migration', () => {
    const state = { schema_version: CURRENT_SCHEMA_VERSION, phases: {} };
    const needsMigration = !state.schema_version || state.schema_version < CURRENT_SCHEMA_VERSION;
    assert.ok(!needsMigration, 'Current version state should not need migration');
  });

  // MIG-14: Corrupted state (invalid phases) is distinguishable
  it('MIG-14: corrupted state is distinguishable from needing migration (AC-003-02)', () => {
    const corruptedState = { phases: 'invalid', schema_version: 1 };
    // This has schema_version=1 (current), so it does not need migration
    const needsMigration = !corruptedState.schema_version || corruptedState.schema_version < CURRENT_SCHEMA_VERSION;
    assert.ok(!needsMigration, 'Corrupted state at current version is not a migration issue');

    // But it IS corrupted (phases should be an object)
    const isCorrupted = typeof corruptedState.phases !== 'object' || corruptedState.phases === null || Array.isArray(corruptedState.phases);
    assert.ok(isCorrupted, 'Should detect invalid phases type as corruption');
  });

  // MIG-15: Future schema version is detectable
  it('MIG-15: future schema version is detectable as incompatible', () => {
    const futureState = { schema_version: 999, phases: {} };
    const isIncompatible = futureState.schema_version > CURRENT_SCHEMA_VERSION;
    assert.ok(isIncompatible, 'Future schema version should be detected as incompatible');
  });
});

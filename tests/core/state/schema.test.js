/**
 * Unit tests for src/core/state/schema.js — Schema Versioning (REQ-0124)
 *
 * Tests: CURRENT_SCHEMA_VERSION, migrateState, migration registry
 *
 * Requirements: FR-001 (AC-001-01 through AC-001-03), FR-002 (AC-002-01 through AC-002-03),
 *               FR-003 (AC-003-01, AC-003-02)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CURRENT_SCHEMA_VERSION,
  migrateState,
  MIGRATIONS
} from '../../../src/core/state/schema.js';

// ---------------------------------------------------------------------------
// CURRENT_SCHEMA_VERSION
// ---------------------------------------------------------------------------
describe('CURRENT_SCHEMA_VERSION', () => {
  it('SCHEMA-01: is a positive integer', () => {
    assert.equal(typeof CURRENT_SCHEMA_VERSION, 'number');
    assert.ok(CURRENT_SCHEMA_VERSION >= 1, 'Must be >= 1');
    assert.equal(CURRENT_SCHEMA_VERSION, Math.floor(CURRENT_SCHEMA_VERSION), 'Must be integer');
  });

  it('SCHEMA-02: equals 1 for initial version', () => {
    assert.equal(CURRENT_SCHEMA_VERSION, 1);
  });
});

// ---------------------------------------------------------------------------
// MIGRATIONS registry
// ---------------------------------------------------------------------------
describe('MIGRATIONS', () => {
  it('SCHEMA-03: is an array', () => {
    assert.ok(Array.isArray(MIGRATIONS));
  });

  it('SCHEMA-04: has 0->1 migration', () => {
    const m = MIGRATIONS.find(m => m.from === 0 && m.to === 1);
    assert.ok(m, 'Must have a 0->1 migration');
    assert.equal(typeof m.migrate, 'function');
  });

  it('SCHEMA-05: each migration has from, to, and migrate', () => {
    for (const m of MIGRATIONS) {
      assert.equal(typeof m.from, 'number', `Migration missing "from": ${JSON.stringify(m)}`);
      assert.equal(typeof m.to, 'number', `Migration missing "to": ${JSON.stringify(m)}`);
      assert.equal(typeof m.migrate, 'function', `Migration missing "migrate": ${JSON.stringify(m)}`);
      assert.ok(m.to > m.from, `Migration "to" must be > "from": ${m.from} -> ${m.to}`);
    }
  });
});

// ---------------------------------------------------------------------------
// migrateState
// ---------------------------------------------------------------------------
describe('migrateState()', () => {
  it('SCHEMA-06: migrates version 0 state (no schema_version) to current', () => {
    const oldState = {
      project_name: 'legacy',
      state_version: 42,
      current_phase: '06-implementation',
      active_workflow: { type: 'feature', item_id: 'REQ-0080' }
    };

    const migrated = migrateState(oldState);
    assert.equal(migrated.schema_version, CURRENT_SCHEMA_VERSION);
    // All original data preserved
    assert.equal(migrated.project_name, 'legacy');
    assert.equal(migrated.state_version, 42);
    assert.equal(migrated.current_phase, '06-implementation');
    assert.deepStrictEqual(migrated.active_workflow, oldState.active_workflow);
  });

  it('SCHEMA-07: does not re-migrate state already at current version', () => {
    const currentState = {
      project_name: 'up-to-date',
      schema_version: CURRENT_SCHEMA_VERSION,
      state_version: 10
    };

    const result = migrateState(currentState);
    assert.deepStrictEqual(result, currentState);
  });

  it('SCHEMA-08: preserves active_workflow during migration (in-flight compat)', () => {
    const inFlightState = {
      project_name: 'in-flight',
      active_workflow: {
        type: 'feature',
        item_id: 'REQ-0080',
        current_phase_index: 2,
        phases: ['05-test-strategy', '06-implementation', '08-code-review']
      },
      phases: {
        '05-test-strategy': { status: 'completed' },
        '06-implementation': { status: 'in_progress' }
      },
      workflow_history: [{ completed: '2026-01-01' }],
      skill_usage_log: [{ skill: 'DEV-001', phase: '06' }]
    };

    const migrated = migrateState(inFlightState);
    assert.equal(migrated.schema_version, CURRENT_SCHEMA_VERSION);
    assert.deepStrictEqual(migrated.active_workflow, inFlightState.active_workflow);
    assert.deepStrictEqual(migrated.phases, inFlightState.phases);
    assert.deepStrictEqual(migrated.workflow_history, inFlightState.workflow_history);
    assert.deepStrictEqual(migrated.skill_usage_log, inFlightState.skill_usage_log);
  });

  it('SCHEMA-09: returns a new object (does not mutate input)', () => {
    const original = { project_name: 'immutable' };
    const migrated = migrateState(original);

    assert.ok(migrated !== original, 'Must return a new object');
    assert.equal(original.schema_version, undefined, 'Original must not be mutated');
  });

  it('SCHEMA-10: handles empty/minimal state gracefully', () => {
    const minimal = {};
    const migrated = migrateState(minimal);
    assert.equal(migrated.schema_version, CURRENT_SCHEMA_VERSION);
  });

  it('SCHEMA-11: 0->1 migration adds schema_version field specifically', () => {
    const m = MIGRATIONS.find(m => m.from === 0 && m.to === 1);
    const state = { project_name: 'test', state_version: 5 };
    const result = m.migrate({ ...state });
    assert.equal(result.schema_version, 1);
    assert.equal(result.project_name, 'test');
    assert.equal(result.state_version, 5);
  });
});

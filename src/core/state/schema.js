/**
 * State Schema Versioning and Migration — REQ-0124
 *
 * Provides explicit schema versioning for state.json. The existing
 * `state_version` is a write counter, not a schema version.
 * This module adds `schema_version` to track structural changes
 * and provides forward migration for existing state files.
 *
 * @module src/core/state/schema
 */

/**
 * Current schema version for state.json.
 * Increment when the state structure changes in a way that
 * requires migration of existing data.
 * @type {number}
 */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Migration registry. Each entry defines a forward migration
 * from one schema version to the next. Migrations are pure functions:
 * (state) => state. They must not have side effects.
 *
 * @type {Array<{ from: number, to: number, migrate: (state: object) => object }>}
 */
export const MIGRATIONS = [
  {
    from: 0,
    to: 1,
    migrate(state) {
      // Version 0 -> 1: Add schema_version field.
      // Preserves all existing data (active_workflow, phases,
      // workflow_history, skill_usage_log, etc.)
      state.schema_version = 1;
      return state;
    }
  }
];

/**
 * Apply all pending migrations to bring state to the current schema version.
 *
 * - If state has no `schema_version`, it is treated as version 0 (pre-versioning).
 * - Migrations are applied in sequence from the current version to CURRENT_SCHEMA_VERSION.
 * - Returns a new object (does not mutate the input).
 * - Mid-workflow state (active_workflow set) survives migration without data loss.
 *
 * @param {object} state - The state object to migrate
 * @returns {object} Migrated state at CURRENT_SCHEMA_VERSION
 */
export function migrateState(state) {
  // Create a shallow copy to avoid mutating the caller's object
  let current = { ...state };

  // Determine current schema version (0 if missing)
  let version = typeof current.schema_version === 'number' ? current.schema_version : 0;

  // Already at current version — return the copy as-is
  if (version >= CURRENT_SCHEMA_VERSION) {
    return current;
  }

  // Apply migrations in sequence
  while (version < CURRENT_SCHEMA_VERSION) {
    const migration = MIGRATIONS.find(m => m.from === version);
    if (!migration) {
      // No migration path — force set version and break
      current.schema_version = CURRENT_SCHEMA_VERSION;
      break;
    }
    current = migration.migrate(current);
    version = migration.to;
  }

  return current;
}

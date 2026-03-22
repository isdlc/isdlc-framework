/**
 * Golden Fixture Suite — REQ-0119
 *
 * Loads each fixture directory under tests/verification/fixtures/,
 * applies core model functions (migrateState), and validates output
 * matches expected.json.
 *
 * Requirements: FR-001 (AC-001-01..03), FR-002 (AC-002-01..03), FR-003 (AC-003-01..03)
 *
 * Test ID prefix: GLD-
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrateState } from '../../src/core/state/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'fixtures');

// ---------------------------------------------------------------------------
// Utility: Resolve dotted path to a nested value
// ---------------------------------------------------------------------------

function getNestedValue(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

// ---------------------------------------------------------------------------
// Fixture discovery
// ---------------------------------------------------------------------------

const fixtures = readdirSync(FIXTURES_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

// ---------------------------------------------------------------------------
// FR-001: Fixture Projects (AC-001-01..03)
// ---------------------------------------------------------------------------

describe('Golden fixture discovery (REQ-0119 FR-001)', () => {
  const REQUIRED_FIXTURES = [
    'discover_existing', 'feature', 'fix', 'test_generate', 'test_run',
    'upgrade', 'analyze', 'implementation_loop', 'quality_loop'
  ];

  // GLD-01: All 9 fixture directories exist
  it('GLD-01: all 9 required fixture directories exist (AC-001-01, AC-001-03)', () => {
    for (const name of REQUIRED_FIXTURES) {
      assert.ok(fixtures.includes(name), `Missing fixture directory: ${name}`);
    }
    assert.ok(fixtures.length >= 9, `Expected >= 9 fixtures, got ${fixtures.length}`);
  });
});

// ---------------------------------------------------------------------------
// FR-002: Fixture Contents (AC-002-01..03)
// ---------------------------------------------------------------------------

describe('Golden fixture contents (REQ-0119 FR-002)', () => {
  for (const fixtureName of fixtures) {
    describe(`Fixture: ${fixtureName}`, () => {
      const fixtureDir = join(FIXTURES_DIR, fixtureName);

      // GLD-02: initial-state.json exists and is valid JSON
      it(`GLD-02: ${fixtureName}/initial-state.json exists and is valid (AC-002-01)`, () => {
        const content = readFileSync(join(fixtureDir, 'initial-state.json'), 'utf8');
        const state = JSON.parse(content);
        assert.equal(typeof state, 'object');
        assert.ok(state !== null);
      });

      // GLD-03: context.json exists and is valid JSON
      it(`GLD-03: ${fixtureName}/context.json exists and is valid (AC-002-02)`, () => {
        const content = readFileSync(join(fixtureDir, 'context.json'), 'utf8');
        const ctx = JSON.parse(content);
        assert.equal(typeof ctx, 'object');
        assert.ok(ctx !== null);
      });

      // GLD-04: expected.json exists and is valid JSON
      it(`GLD-04: ${fixtureName}/expected.json exists and has required fields (AC-002-03)`, () => {
        const content = readFileSync(join(fixtureDir, 'expected.json'), 'utf8');
        const expected = JSON.parse(content);
        assert.equal(typeof expected, 'object');
        assert.ok(Array.isArray(expected.expected_artifacts),
          'expected.json must have expected_artifacts array');
        assert.equal(typeof expected.expected_state_mutations, 'object',
          'expected.json must have expected_state_mutations object');
      });
    });
  }
});

// ---------------------------------------------------------------------------
// FR-003: Golden Test Runner — state mutation validation (AC-003-01..03)
// ---------------------------------------------------------------------------

describe('Golden fixture state validation (REQ-0119 FR-003)', () => {
  for (const fixtureName of fixtures) {
    describe(`Validate: ${fixtureName}`, () => {
      const fixtureDir = join(FIXTURES_DIR, fixtureName);
      const initialState = JSON.parse(readFileSync(join(fixtureDir, 'initial-state.json'), 'utf8'));
      const context = JSON.parse(readFileSync(join(fixtureDir, 'context.json'), 'utf8'));
      const expected = JSON.parse(readFileSync(join(fixtureDir, 'expected.json'), 'utf8'));

      // GLD-05: migrateState produces correct schema_version
      it(`GLD-05: migrateState ensures schema_version (AC-003-01)`, () => {
        const migrated = migrateState(initialState);
        assert.equal(migrated.schema_version, 1, 'schema_version must be 1 after migration');
      });

      // GLD-06: Expected state mutations match migrated state
      it(`GLD-06: expected state mutations match (AC-003-01)`, () => {
        const migrated = migrateState(initialState);
        for (const [path, value] of Object.entries(expected.expected_state_mutations)) {
          const actual = getNestedValue(migrated, path);
          assert.deepStrictEqual(actual, value,
            `State mutation mismatch at "${path}": expected ${JSON.stringify(value)}, got ${JSON.stringify(actual)}`);
        }
      });

      // GLD-07: expected_artifacts is a well-formed array of strings
      it(`GLD-07: expected_artifacts is array of strings (AC-003-01)`, () => {
        assert.ok(Array.isArray(expected.expected_artifacts));
        for (const art of expected.expected_artifacts) {
          assert.equal(typeof art, 'string', `Artifact must be string, got ${typeof art}`);
          assert.ok(art.length > 0, 'Artifact name must be non-empty');
        }
      });

      // GLD-08: context.json has an action field
      it(`GLD-08: context has action field`, () => {
        assert.ok('action' in context, 'context.json must have an action field');
        assert.equal(typeof context.action, 'string');
      });

      // GLD-09: migrateState does not mutate original input
      it(`GLD-09: migrateState does not mutate input`, () => {
        const copy = JSON.parse(JSON.stringify(initialState));
        migrateState(initialState);
        assert.deepStrictEqual(initialState, copy, 'Input must not be mutated');
      });
    });
  }
});

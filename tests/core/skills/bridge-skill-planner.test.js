/**
 * Unit tests for src/core/bridge/skill-planner.cjs -- CJS Bridge for Skill Planner
 *
 * Per Article XIII (Module System Consistency), CJS bridge tests use
 * createRequire to test CJS bridges from ESM test runner.
 *
 * Requirements: REQ-0126 (bridge)
 *
 * Test ID prefix: PB- (Planner Bridge)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, 'fixtures');
const fixtureManifest = join(FIXTURES, 'fixture-skills-manifest.json');
const fixtureExternal = join(FIXTURES, 'fixture-external-manifest.json');

// ---------------------------------------------------------------------------
// CJS Bridge Tests
// ---------------------------------------------------------------------------

describe('CJS Bridge: skill-planner.cjs', () => {
  // PB-01: CJS bridge exports computeInjectionPlan function
  it('PB-01: exports computeInjectionPlan function', () => {
    const bridge = require('../../../src/core/bridge/skill-planner.cjs');
    assert.equal(typeof bridge.computeInjectionPlan, 'function',
      'Should export computeInjectionPlan');
  });

  // PB-02: Bridge computeInjectionPlan returns deep-equal data to ESM
  it('PB-02: computeInjectionPlan returns deep-equal data to ESM (Bridge parity)', async () => {
    const bridge = require('../../../src/core/bridge/skill-planner.cjs');
    const { computeInjectionPlan } = await import('../../../src/core/skills/injection-planner.js');

    const opts = {
      manifestPath: fixtureManifest,
      externalManifestPath: fixtureExternal
    };

    const bridgeResult = await bridge.computeInjectionPlan(
      'feature', '06-implementation', 'test-agent', opts
    );
    const esmResult = computeInjectionPlan(
      'feature', '06-implementation', 'test-agent', opts
    );

    assert.deepEqual(bridgeResult, esmResult,
      'Bridge and ESM should return deep-equal results');
  });

  // PB-03: Bridge returns empty plan when manifests missing (fail-open)
  it('PB-03: returns empty plan when manifests missing (AC-001-03)', async () => {
    const bridge = require('../../../src/core/bridge/skill-planner.cjs');
    const plan = await bridge.computeInjectionPlan(
      'feature', '06-implementation', 'test-agent', {
        manifestPath: '/nonexistent/manifest.json',
        externalManifestPath: '/nonexistent/external.json'
      }
    );
    assert.ok(Array.isArray(plan.builtIn));
    assert.equal(plan.builtIn.length, 0);
    assert.ok(Array.isArray(plan.external));
    assert.equal(plan.external.length, 0);
    assert.ok(Array.isArray(plan.merged));
    assert.equal(plan.merged.length, 0);
  });

  // PB-04: Bridge resolves consistently with ESM version
  it('PB-04: bridge resolves consistently with ESM version (Bridge parity)', async () => {
    const bridge = require('../../../src/core/bridge/skill-planner.cjs');
    const { computeInjectionPlan } = await import('../../../src/core/skills/injection-planner.js');

    const emptyOpts = {
      manifestPath: '/nonexistent/manifest.json',
      externalManifestPath: '/nonexistent/external.json'
    };

    const bridgeResult = await bridge.computeInjectionPlan(
      'feature', '06-implementation', 'unknown-agent', emptyOpts
    );
    const esmResult = computeInjectionPlan(
      'feature', '06-implementation', 'unknown-agent', emptyOpts
    );

    assert.deepEqual(bridgeResult, esmResult,
      'Bridge and ESM should return same result for unknown agent');
  });
});

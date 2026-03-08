/**
 * Tests for Compatibility Matrix Extension (FR-009, M6)
 *
 * REQ-0045 / FR-009 / AC-009-01 through AC-009-04
 * Extends the existing compatibility module with cross-module version rules.
 *
 * @module lib/embedding/registry/compatibility.test
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../../../lib/utils/test-helpers.js';
import {
  isCompatible,
  getCompatibleVersions,
  CompatibilityMatrix,
} from './compatibility.js';

const FIXTURES_DIR = join(import.meta.dirname, '../../../tests/fixtures/embedding');

// ── Helper: create sample modules for testing ────────────────
function sampleModules() {
  return [
    { id: 'mod-auth', version: '2.1.0', compatibility: { minVersion: '2.0.0', maxVersion: '2.9.9' } },
    { id: 'mod-auth', version: '1.0.0', compatibility: { minVersion: '1.0.0', maxVersion: '1.9.9' } },
    { id: 'mod-orders', version: '1.5.0', compatibility: { minVersion: '1.0.0' } },
    { id: 'mod-payments', version: '1.2.3', compatibility: {} },
  ];
}

// ==============================================================
describe('M6: Compatibility Matrix Extension (FR-009)', () => {
  let tempDir;

  before(() => {
    tempDir = createTempDir();
  });

  after(() => {
    cleanupTempDir(tempDir);
  });

  // ── AC-009-01: Matrix declares compatible versions ─────────
  describe('AC-009-01: CompatibilityMatrix declaration', () => {
    it('creates a matrix from rules array', () => {
      const matrix = new CompatibilityMatrix([
        { module: 'mod-auth', compatibleWith: { 'mod-orders': '>=1.0.0 <2.0.0' } },
      ]);
      assert.ok(matrix);
      const rules = matrix.getRules();
      assert.equal(rules.length, 1);
    });

    it('loads matrix from JSON file', () => {
      const filePath = join(FIXTURES_DIR, 'compatibility-matrix.json');
      const matrix = CompatibilityMatrix.fromFile(filePath);
      const rules = matrix.getRules();
      assert.ok(rules.length >= 2);
    });

    it('creates an empty matrix when no rules provided', () => {
      const matrix = new CompatibilityMatrix([]);
      const rules = matrix.getRules();
      assert.equal(rules.length, 0);
    });

    it('serializes matrix to JSON', () => {
      const rules = [
        { module: 'mod-auth', compatibleWith: { 'mod-orders': '>=1.0.0 <2.0.0' } },
      ];
      const matrix = new CompatibilityMatrix(rules);
      const json = matrix.toJSON();
      assert.ok(json.version);
      assert.ok(Array.isArray(json.rules));
      assert.equal(json.rules.length, 1);
    });

    it('saves matrix to file and reloads', () => {
      const filePath = join(tempDir, 'matrix.json');
      const rules = [
        { module: 'mod-a', compatibleWith: { 'mod-b': '>=1.0.0' } },
      ];
      const matrix = new CompatibilityMatrix(rules);
      matrix.saveToFile(filePath);
      const reloaded = CompatibilityMatrix.fromFile(filePath);
      assert.equal(reloaded.getRules().length, 1);
    });

    it('adds rules to existing matrix', () => {
      const matrix = new CompatibilityMatrix([]);
      matrix.addRule('mod-x', { 'mod-y': '>=1.0.0' });
      assert.equal(matrix.getRules().length, 1);
    });

    it('replaces existing rule for same module', () => {
      const matrix = new CompatibilityMatrix([
        { module: 'mod-x', compatibleWith: { 'mod-y': '>=1.0.0' } },
      ]);
      matrix.addRule('mod-x', { 'mod-y': '>=2.0.0' });
      assert.equal(matrix.getRules().length, 1);
      assert.equal(matrix.getRules()[0].compatibleWith['mod-y'], '>=2.0.0');
    });
  });

  // ── AC-009-02: MCP server validates at load time ───────────
  describe('AC-009-02: validateModulePair()', () => {
    it('returns valid for compatible module pair', () => {
      const matrix = new CompatibilityMatrix([
        { module: 'mod-auth', compatibleWith: { 'mod-orders': '>=1.0.0 <2.0.0' } },
      ]);
      const result = matrix.validateModulePair('mod-auth', '2.1.0', 'mod-orders', '1.5.0');
      assert.equal(result.compatible, true);
    });

    it('returns invalid for incompatible module pair', () => {
      const matrix = new CompatibilityMatrix([
        { module: 'mod-auth', compatibleWith: { 'mod-orders': '>=1.0.0 <2.0.0' } },
      ]);
      const result = matrix.validateModulePair('mod-auth', '2.1.0', 'mod-orders', '3.0.0');
      assert.equal(result.compatible, false);
      assert.ok(result.error);
    });

    it('returns valid when no rule exists for the pair (permissive)', () => {
      const matrix = new CompatibilityMatrix([
        { module: 'mod-auth', compatibleWith: { 'mod-orders': '>=1.0.0' } },
      ]);
      const result = matrix.validateModulePair('mod-auth', '2.1.0', 'mod-payments', '1.0.0');
      assert.equal(result.compatible, true);
    });

    it('validates in both directions (A->B and B->A)', () => {
      const matrix = new CompatibilityMatrix([
        { module: 'mod-orders', compatibleWith: { 'mod-payments': '>=1.0.0 <2.0.0' } },
      ]);
      // Forward: mod-orders -> mod-payments
      const fwd = matrix.validateModulePair('mod-orders', '1.5.0', 'mod-payments', '1.2.0');
      assert.equal(fwd.compatible, true);
      // Reverse: mod-payments -> mod-orders (rule found via reverse lookup)
      const rev = matrix.validateModulePair('mod-payments', '1.2.0', 'mod-orders', '1.5.0');
      assert.equal(rev.compatible, true);
    });
  });

  // ── AC-009-03: Update checker offers compatible versions ───
  describe('AC-009-03: getCompatibleUpdates()', () => {
    it('returns only versions compatible with all loaded modules', () => {
      const matrix = new CompatibilityMatrix([
        { module: 'mod-auth', compatibleWith: { 'mod-orders': '>=1.0.0 <2.0.0' } },
      ]);
      const available = ['1.0.0', '1.5.0', '2.0.0', '3.0.0'];
      const loadedModules = [
        { moduleId: 'mod-auth', version: '2.1.0' },
      ];
      const updates = matrix.getCompatibleUpdates('mod-orders', available, loadedModules);
      // Only 1.x versions should be compatible with mod-auth
      assert.ok(updates.includes('1.0.0'));
      assert.ok(updates.includes('1.5.0'));
      assert.ok(!updates.includes('2.0.0'));
      assert.ok(!updates.includes('3.0.0'));
    });

    it('returns all versions when no constraints exist', () => {
      const matrix = new CompatibilityMatrix([]);
      const available = ['1.0.0', '2.0.0'];
      const loadedModules = [{ moduleId: 'mod-auth', version: '1.0.0' }];
      const updates = matrix.getCompatibleUpdates('mod-orders', available, loadedModules);
      assert.equal(updates.length, 2);
    });

    it('returns empty when no versions are compatible', () => {
      const matrix = new CompatibilityMatrix([
        { module: 'mod-auth', compatibleWith: { 'mod-orders': '>=10.0.0' } },
      ]);
      const available = ['1.0.0', '2.0.0'];
      const loadedModules = [{ moduleId: 'mod-auth', version: '2.0.0' }];
      const updates = matrix.getCompatibleUpdates('mod-orders', available, loadedModules);
      assert.equal(updates.length, 0);
    });
  });

  // ── AC-009-04: Clear error with alternatives ───────────────
  describe('AC-009-04: Error messages with compatible alternatives', () => {
    it('error includes module names and versions', () => {
      const matrix = new CompatibilityMatrix([
        { module: 'mod-auth', compatibleWith: { 'mod-orders': '>=1.0.0 <2.0.0' } },
      ]);
      const result = matrix.validateModulePair('mod-auth', '2.1.0', 'mod-orders', '3.0.0');
      assert.equal(result.compatible, false);
      assert.ok(result.error.includes('mod-auth'));
      assert.ok(result.error.includes('mod-orders'));
    });

    it('error includes the version constraint', () => {
      const matrix = new CompatibilityMatrix([
        { module: 'mod-auth', compatibleWith: { 'mod-orders': '>=1.0.0 <2.0.0' } },
      ]);
      const result = matrix.validateModulePair('mod-auth', '2.1.0', 'mod-orders', '3.0.0');
      assert.ok(result.error.includes('>=1.0.0 <2.0.0'));
    });

    it('validateSet returns all incompatibilities at once', () => {
      const matrix = new CompatibilityMatrix([
        { module: 'mod-auth', compatibleWith: { 'mod-orders': '>=1.0.0 <2.0.0', 'mod-payments': '>=1.0.0 <2.0.0' } },
      ]);
      const moduleSet = [
        { moduleId: 'mod-auth', version: '2.1.0' },
        { moduleId: 'mod-orders', version: '3.0.0' },
        { moduleId: 'mod-payments', version: '5.0.0' },
      ];
      const result = matrix.validateSet(moduleSet);
      assert.equal(result.compatible, false);
      assert.ok(result.errors.length >= 2);
    });

    it('validateSet returns compatible=true when all modules compatible', () => {
      const matrix = new CompatibilityMatrix([
        { module: 'mod-auth', compatibleWith: { 'mod-orders': '>=1.0.0 <2.0.0' } },
      ]);
      const moduleSet = [
        { moduleId: 'mod-auth', version: '2.1.0' },
        { moduleId: 'mod-orders', version: '1.5.0' },
      ];
      const result = matrix.validateSet(moduleSet);
      assert.equal(result.compatible, true);
      assert.equal(result.errors.length, 0);
    });
  });

  // ── Edge cases ──────────────────────────────────────────────
  describe('Edge Cases', () => {
    it('handles null/undefined inputs gracefully', () => {
      const matrix = new CompatibilityMatrix([]);
      const result = matrix.validateModulePair(null, '1.0.0', 'mod-b', '1.0.0');
      assert.equal(result.compatible, true); // no rule, permissive
    });

    it('validates with fixture matrix file', () => {
      const matrix = CompatibilityMatrix.fromFile(join(FIXTURES_DIR, 'compatibility-matrix.json'));
      const result = matrix.validateModulePair('mod-auth', '2.1.0', 'mod-orders', '1.5.0');
      assert.equal(result.compatible, true);
    });

    it('rejects non-matching version for fixture matrix', () => {
      const matrix = CompatibilityMatrix.fromFile(join(FIXTURES_DIR, 'compatibility-matrix.json'));
      const result = matrix.validateModulePair('mod-auth', '2.1.0', 'mod-orders', '3.0.0');
      assert.equal(result.compatible, false);
    });
  });
});

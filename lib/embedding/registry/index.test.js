/**
 * Tests for Module Registry (FR-013, M6)
 *
 * REQ-0045 / FR-013 / M6 Registry
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../../../lib/utils/test-helpers.js';
import { loadRegistry } from './index.js';
import { isCompatible, getCompatibleVersions } from './compatibility.js';

const FIXTURES_DIR = join(import.meta.dirname, '../../../tests/fixtures/embedding');

// ── Test data ─────────────────────────────────────────────────
function sampleEntry(overrides = {}) {
  return {
    id: 'mod-test',
    name: 'Test Module',
    domain: 'testing.unit',
    description: 'A test module',
    dependencies: [],
    version: '1.0.0',
    compatibility: {},
    keywords: ['test', 'unit'],
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════
describe('M6: Module Registry', () => {
  let tempDir;

  before(() => {
    tempDir = createTempDir();
  });

  after(() => {
    cleanupTempDir(tempDir);
  });

  // ── index.js (Registry CRUD) ────────────────────────────────
  describe('loadRegistry()', () => {
    it('from existing file returns populated registry (AC-013-01)', () => {
      const registryPath = join(FIXTURES_DIR, 'sample-registry.json');
      const registry = loadRegistry(registryPath);
      const modules = registry.listModules();
      assert.equal(modules.length, 3);
    });

    it('from non-existent path creates empty registry (AC-013-01)', () => {
      const registryPath = join(tempDir, 'nonexistent', 'registry.json');
      const registry = loadRegistry(registryPath);
      const modules = registry.listModules();
      assert.equal(modules.length, 0);
    });
  });

  describe('getModule()', () => {
    it('returns entry by ID (AC-013-01)', () => {
      const registryPath = join(FIXTURES_DIR, 'sample-registry.json');
      const registry = loadRegistry(registryPath);
      const mod = registry.getModule('mod-auth');
      assert.ok(mod);
      assert.equal(mod.id, 'mod-auth');
      assert.equal(mod.name, 'Authentication Module');
    });

    it('returns null for unknown ID (AC-013-01)', () => {
      const registryPath = join(FIXTURES_DIR, 'sample-registry.json');
      const registry = loadRegistry(registryPath);
      const mod = registry.getModule('nonexistent-mod');
      assert.equal(mod, null);
    });
  });

  describe('listModules()', () => {
    it('returns all registered entries (AC-013-01)', () => {
      const registryPath = join(FIXTURES_DIR, 'sample-registry.json');
      const registry = loadRegistry(registryPath);
      const modules = registry.listModules();
      assert.equal(modules.length, 3);
      const ids = modules.map(m => m.id);
      assert.ok(ids.includes('mod-auth'));
      assert.ok(ids.includes('mod-orders'));
      assert.ok(ids.includes('mod-payments'));
    });
  });

  describe('registerModule()', () => {
    it('adds a new entry (AC-013-01)', () => {
      const registryPath = join(tempDir, 'register-new.json');
      const registry = loadRegistry(registryPath);
      registry.registerModule(sampleEntry());
      const modules = registry.listModules();
      assert.equal(modules.length, 1);
      assert.equal(modules[0].id, 'mod-test');
    });

    it('updates existing entry by ID (AC-013-01)', () => {
      const registryPath = join(tempDir, 'register-update.json');
      const registry = loadRegistry(registryPath);

      registry.registerModule(sampleEntry({ version: '1.0.0' }));
      registry.registerModule(sampleEntry({ version: '2.0.0' }));

      const modules = registry.listModules();
      assert.equal(modules.length, 1);
      assert.equal(modules[0].version, '2.0.0');
    });
  });

  describe('save()', () => {
    it('persists registry to disk (AC-013-04)', () => {
      const registryPath = join(tempDir, 'save-test.json');
      const registry = loadRegistry(registryPath);
      registry.registerModule(sampleEntry());
      registry.save();
      assert.ok(existsSync(registryPath));
      const content = JSON.parse(readFileSync(registryPath, 'utf-8'));
      assert.equal(content.modules.length, 1);
    });

    it('load → register → save → reload roundtrip preserves data (AC-013-04)', () => {
      const registryPath = join(tempDir, 'roundtrip.json');

      // Load + register + save
      const reg1 = loadRegistry(registryPath);
      reg1.registerModule(sampleEntry({ id: 'mod-a', name: 'Module A' }));
      reg1.registerModule(sampleEntry({ id: 'mod-b', name: 'Module B' }));
      reg1.save();

      // Reload
      const reg2 = loadRegistry(registryPath);
      const modules = reg2.listModules();
      assert.equal(modules.length, 2);
      assert.equal(reg2.getModule('mod-a').name, 'Module A');
      assert.equal(reg2.getModule('mod-b').name, 'Module B');
    });
  });

  // ── Hierarchical Domains ────────────────────────────────────
  describe('Hierarchical Domains', () => {
    it('registry stores hierarchical domain notation (AC-013-03)', () => {
      const registryPath = join(FIXTURES_DIR, 'sample-registry.json');
      const registry = loadRegistry(registryPath);
      const mod = registry.getModule('mod-orders');
      assert.equal(mod.domain, 'commerce.order-management');
    });

    it('getRoutingHints() matches by domain prefix (AC-013-02, AC-013-03)', () => {
      const registryPath = join(FIXTURES_DIR, 'sample-registry.json');
      const registry = loadRegistry(registryPath);
      const hints = registry.getRoutingHints('commerce');
      assert.ok(hints.includes('mod-orders'));
      assert.ok(hints.includes('mod-payments'));
    });

    it('getRoutingHints() matches by keywords (AC-013-02)', () => {
      const registryPath = join(FIXTURES_DIR, 'sample-registry.json');
      const registry = loadRegistry(registryPath);
      const hints = registry.getRoutingHints('payment');
      assert.ok(hints.includes('mod-payments'));
    });

    it('getRoutingHints() returns empty array for no match (AC-013-02)', () => {
      const registryPath = join(FIXTURES_DIR, 'sample-registry.json');
      const registry = loadRegistry(registryPath);
      const hints = registry.getRoutingHints('nonexistent-domain');
      assert.equal(hints.length, 0);
    });
  });

  // ── compatibility.js ────────────────────────────────────────
  describe('compatibility', () => {
    it('getCompatibleVersions() returns compatible versions based on semver (AC-013-04)', () => {
      const modules = [
        sampleEntry({ id: 'mod-x', version: '1.0.0', compatibility: { minVersion: '1.0.0', maxVersion: '1.9.9' } }),
        sampleEntry({ id: 'mod-x', version: '2.0.0', compatibility: { minVersion: '2.0.0', maxVersion: '2.9.9' } }),
      ];
      const result = getCompatibleVersions(modules, 'mod-x', '1.5.0');
      assert.ok(result.includes('1.0.0'));
    });

    it('getCompatibleVersions() returns empty for non-existent module (AC-013-04)', () => {
      const modules = [sampleEntry()];
      const result = getCompatibleVersions(modules, 'nonexistent', '1.0.0');
      assert.equal(result.length, 0);
    });

    it('isCompatible() handles major version mismatches correctly (AC-013-04)', () => {
      assert.equal(isCompatible('1.0.0', '1.5.0'), true);
      assert.equal(isCompatible('1.0.0', '2.0.0'), false);
      assert.equal(isCompatible('3.1.0', '3.9.9'), true);
    });

    it('version metadata round-trips through registry save/load (AC-013-04)', () => {
      const registryPath = join(tempDir, 'version-roundtrip.json');
      const reg1 = loadRegistry(registryPath);
      reg1.registerModule(sampleEntry({
        id: 'mod-v',
        version: '3.2.1',
        compatibility: { minVersion: '3.0.0', maxVersion: '3.9.9' },
      }));
      reg1.save();

      const reg2 = loadRegistry(registryPath);
      const mod = reg2.getModule('mod-v');
      assert.equal(mod.version, '3.2.1');
      assert.equal(mod.compatibility.minVersion, '3.0.0');
      assert.equal(mod.compatibility.maxVersion, '3.9.9');
    });
  });

  // ── Edge Cases ──────────────────────────────────────────────
  describe('Edge Cases', () => {
    it('loadRegistry() with malformed JSON throws clear error (AC-013-01)', () => {
      const registryPath = join(tempDir, 'malformed.json');
      writeFileSync(registryPath, '{not valid json!!!', 'utf-8');
      assert.throws(
        () => loadRegistry(registryPath),
        { message: /malformed JSON/ }
      );
    });

    it('registerModule() with missing required fields throws (AC-013-01)', () => {
      const registryPath = join(tempDir, 'missing-fields.json');
      const registry = loadRegistry(registryPath);
      assert.throws(
        () => registry.registerModule({ id: 'only-id' }),
        { message: /Missing required field/ }
      );
    });
  });
});

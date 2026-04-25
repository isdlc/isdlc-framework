/**
 * Tests for knowledge namespace in config-defaults.js
 * REQ-GH-264 FR-002, AC-002-01
 *
 * TC-KS-01: Config Defaults — Knowledge Namespace (3 tests)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROJECT_CONFIG } from '../../../src/core/config/config-defaults.js';

describe('Config Defaults — Knowledge Namespace (TC-KS-01)', () => {

  it('TC-KS-01-01: [P0] DEFAULT_PROJECT_CONFIG includes knowledge namespace', () => {
    assert.ok('knowledge' in DEFAULT_PROJECT_CONFIG, 'DEFAULT_PROJECT_CONFIG must have a knowledge key');
    assert.ok(typeof DEFAULT_PROJECT_CONFIG.knowledge === 'object', 'knowledge must be an object');
    assert.ok(DEFAULT_PROJECT_CONFIG.knowledge !== null, 'knowledge must not be null');
  });

  it('TC-KS-01-02: [P0] Knowledge defaults have correct shape — url is null, projects is empty array', () => {
    const k = DEFAULT_PROJECT_CONFIG.knowledge;
    assert.strictEqual(k.url, null, 'url should default to null');
    assert.ok(Array.isArray(k.projects), 'projects should be an array');
    assert.strictEqual(k.projects.length, 0, 'projects should be empty by default');
  });

  it('TC-KS-01-03: [P1] Knowledge defaults survive shallow copy (not accidentally overwritten)', () => {
    // The DEFAULT_PROJECT_CONFIG is a plain object — verify the knowledge section
    // retains its shape after a structuredClone (same mechanism readProjectConfig uses)
    const cloned = structuredClone(DEFAULT_PROJECT_CONFIG);
    assert.strictEqual(cloned.knowledge.url, null);
    assert.deepStrictEqual(cloned.knowledge.projects, []);

    // Mutating the clone should not affect the original
    cloned.knowledge.url = 'https://mutated.example.com';
    assert.strictEqual(DEFAULT_PROJECT_CONFIG.knowledge.url, null, 'original must be unchanged');
  });
});

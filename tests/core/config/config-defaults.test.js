/**
 * Tests for src/core/config/config-defaults.js
 * REQ-GH-231 FR-001, AC-001-02, AC-001-05
 * REQ-GH-238 FR-004, AC-004-01 through AC-004-08
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROJECT_CONFIG } from '../../../src/core/config/config-defaults.js';

describe('DEFAULT_PROJECT_CONFIG', () => {
  it('has all 6 required sections', () => {
    const sections = Object.keys(DEFAULT_PROJECT_CONFIG);
    assert.ok(sections.includes('cache'), 'missing cache');
    assert.ok(sections.includes('ui'), 'missing ui');
    assert.ok(sections.includes('provider'), 'missing provider');
    assert.ok(sections.includes('roundtable'), 'missing roundtable');
    assert.ok(sections.includes('search'), 'missing search');
    assert.ok(sections.includes('workflows'), 'missing workflows');
  });

  it('cache.budget_tokens defaults to 100000', () => {
    assert.strictEqual(DEFAULT_PROJECT_CONFIG.cache.budget_tokens, 100000);
  });

  it('cache.section_priorities has 10 entries', () => {
    const priorities = DEFAULT_PROJECT_CONFIG.cache.section_priorities;
    assert.strictEqual(Object.keys(priorities).length, 10);
    assert.strictEqual(priorities.CONSTITUTION, 100);
    assert.strictEqual(priorities.INSTRUCTIONS, 40);
  });

  it('ui.show_subtasks_in_ui defaults to true', () => {
    assert.strictEqual(DEFAULT_PROJECT_CONFIG.ui.show_subtasks_in_ui, true);
  });

  it('provider.default is claude', () => {
    assert.strictEqual(DEFAULT_PROJECT_CONFIG.provider.default, 'claude');
  });

  it('roundtable.verbosity defaults to bulleted', () => {
    assert.strictEqual(DEFAULT_PROJECT_CONFIG.roundtable.verbosity, 'bulleted');
  });

  it('roundtable.default_personas has 3 entries', () => {
    assert.strictEqual(DEFAULT_PROJECT_CONFIG.roundtable.default_personas.length, 3);
    assert.ok(DEFAULT_PROJECT_CONFIG.roundtable.default_personas.includes('persona-business-analyst'));
    assert.ok(DEFAULT_PROJECT_CONFIG.roundtable.default_personas.includes('persona-solutions-architect'));
    assert.ok(DEFAULT_PROJECT_CONFIG.roundtable.default_personas.includes('persona-system-designer'));
  });

  it('roundtable.disabled_personas defaults to empty array', () => {
    assert.deepStrictEqual(DEFAULT_PROJECT_CONFIG.roundtable.disabled_personas, []);
  });

  it('search defaults to empty object', () => {
    assert.deepStrictEqual(DEFAULT_PROJECT_CONFIG.search, {});
  });

  it('workflows.sizing_thresholds has light and epic bounds', () => {
    assert.strictEqual(DEFAULT_PROJECT_CONFIG.workflows.sizing_thresholds.light_max_files, 5);
    assert.strictEqual(DEFAULT_PROJECT_CONFIG.workflows.sizing_thresholds.epic_min_files, 20);
  });

  // REQ-GH-238 FR-004: Hardware acceleration config defaults
  describe('embeddings section', () => {
    const emb = DEFAULT_PROJECT_CONFIG.embeddings;

    it('has all required sections including hardware acceleration fields', () => {
      assert.ok('server' in emb, 'missing server');
      assert.ok('provider' in emb, 'missing provider');
      assert.ok('model' in emb, 'missing model');
      assert.ok('api_key_env' in emb, 'missing api_key_env');
      assert.ok('sources' in emb, 'missing sources');
      assert.ok('parallelism' in emb, 'missing parallelism');
      assert.ok('device' in emb, 'missing device');
      assert.ok('batch_size' in emb, 'missing batch_size');
      assert.ok('dtype' in emb, 'missing dtype');
      assert.ok('session_options' in emb, 'missing session_options');
      assert.ok('max_memory_gb' in emb, 'missing max_memory_gb');
    });

    it('parallelism defaults to auto (AC-004-01)', () => {
      assert.strictEqual(emb.parallelism, 'auto');
    });

    it('device defaults to auto (AC-004-02)', () => {
      assert.strictEqual(emb.device, 'auto');
    });

    it('batch_size defaults to 32 (AC-004-03)', () => {
      assert.strictEqual(emb.batch_size, 32);
    });

    it('dtype defaults to auto (AC-004-04)', () => {
      assert.strictEqual(emb.dtype, 'auto');
    });

    it('session_options defaults to empty object (AC-004-05)', () => {
      assert.deepStrictEqual(emb.session_options, {});
    });

    it('max_memory_gb defaults to null', () => {
      assert.strictEqual(emb.max_memory_gb, null);
    });

    it('all hardware fields are present with safe defaults (AC-004-06)', () => {
      // AC-004-06: schema extension — all fields exist with documented defaults
      const fields = { parallelism: 'auto', device: 'auto', batch_size: 32, dtype: 'auto', session_options: {}, max_memory_gb: null };
      for (const [key, expected] of Object.entries(fields)) {
        if (typeof expected === 'object') {
          assert.deepStrictEqual(emb[key], expected, `${key} mismatch`);
        } else {
          assert.strictEqual(emb[key], expected, `${key} mismatch`);
        }
      }
    });

    it('existing embeddings fields are preserved (AC-004-08)', () => {
      assert.strictEqual(emb.server.port, 7777);
      assert.strictEqual(emb.server.host, 'localhost');
      assert.strictEqual(emb.server.auto_start, true);
      assert.strictEqual(emb.server.startup_timeout_ms, 30000);
      assert.strictEqual(emb.provider, 'jina-code');
      assert.strictEqual(emb.model, 'jinaai/jina-embeddings-v2-base-code');
      assert.strictEqual(emb.api_key_env, null);
      assert.strictEqual(emb.sources.length, 2);
    });
  });
});

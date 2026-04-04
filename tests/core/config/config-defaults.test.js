/**
 * Tests for src/core/config/config-defaults.js
 * REQ-GH-231 FR-001, AC-001-02, AC-001-05
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
});

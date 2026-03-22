/**
 * Unit tests for src/core/bridge/content-model.cjs — CJS Bridge
 *
 * Tests that CJS bridge exports match ESM module parity.
 *
 * Test ID prefix: BR- (Bridge)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// BR-01: Bridge exports all functions
// ---------------------------------------------------------------------------

describe('Content Model CJS Bridge: Exports', () => {
  it('BR-01: bridge exports all content-model functions', () => {
    const bridge = require('../../../src/core/bridge/content-model.cjs');
    assert.equal(typeof bridge.getAgentClassification, 'function');
    assert.equal(typeof bridge.getSkillClassification, 'function');
    assert.equal(typeof bridge.getCommandClassification, 'function');
    assert.equal(typeof bridge.getTopicClassification, 'function');
    assert.equal(typeof bridge.listClassifiedAgents, 'function');
    assert.equal(typeof bridge.listClassifiedTopics, 'function');
    assert.equal(typeof bridge.listClassifiedCommands, 'function');
    assert.equal(typeof bridge.listCategories, 'function');
    assert.equal(typeof bridge.getCategoryPortability, 'function');
    assert.equal(typeof bridge.getSkillSectionTemplate, 'function');
    assert.equal(typeof bridge.getAgentPortabilitySummary, 'function');
    assert.equal(typeof bridge.getTopicPortabilitySummary, 'function');
  });

  it('BR-06: bridge CLASSIFICATION_TYPES matches ESM', async () => {
    const bridge = require('../../../src/core/bridge/content-model.cjs');
    const types = await bridge.CLASSIFICATION_TYPES();
    assert.equal(types.ROLE_SPEC, 'role_spec');
    assert.equal(types.RUNTIME_PACKAGING, 'runtime_packaging');
    assert.equal(types.MIXED, 'mixed');
  });
});

// ---------------------------------------------------------------------------
// BR-02..05: Bridge function parity
// ---------------------------------------------------------------------------

describe('Content Model CJS Bridge: Parity', () => {
  it('BR-02: bridge getAgentClassification matches ESM', async () => {
    const bridge = require('../../../src/core/bridge/content-model.cjs');
    const sections = await bridge.getAgentClassification('05-software-developer');
    assert.ok(Array.isArray(sections));
    assert.ok(sections.length > 0);
    assert.equal(sections[0].name, 'frontmatter');
  });

  it('BR-03: bridge getSkillClassification matches ESM', async () => {
    const bridge = require('../../../src/core/bridge/content-model.cjs');
    const sections = await bridge.getSkillClassification('code-implementation');
    assert.ok(Array.isArray(sections));
    assert.equal(sections.length, 6);
  });

  it('BR-04: bridge getCommandClassification matches ESM', async () => {
    const bridge = require('../../../src/core/bridge/content-model.cjs');
    const sections = await bridge.getCommandClassification('isdlc');
    assert.ok(Array.isArray(sections));
    assert.equal(sections.length, 8);
  });

  it('BR-05: bridge getTopicClassification matches ESM', async () => {
    const bridge = require('../../../src/core/bridge/content-model.cjs');
    const sections = await bridge.getTopicClassification('architecture');
    assert.ok(Array.isArray(sections));
    assert.equal(sections.length, 6);
  });

  it('BR-02b: bridge listClassifiedAgents returns 47', async () => {
    const bridge = require('../../../src/core/bridge/content-model.cjs');
    const agents = await bridge.listClassifiedAgents();
    assert.equal(agents.length, 47);
  });

  it('BR-05b: bridge listClassifiedTopics returns 6', async () => {
    const bridge = require('../../../src/core/bridge/content-model.cjs');
    const topics = await bridge.listClassifiedTopics();
    assert.equal(topics.length, 6);
  });
});

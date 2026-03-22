/**
 * Tests for src/core/skills/index.js — Skill management service
 * REQ-0085: Decompose remaining common.cjs functions
 *
 * Verifies the extracted skill management functions.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('src/core/skills service boundary', () => {
  it('exports MODULE_ID constant', async () => {
    const mod = await import('../../../src/core/skills/index.js');
    assert.strictEqual(mod.MODULE_ID, 'core/skills');
  });

  it('exports SKILL_KEYWORD_MAP', async () => {
    const mod = await import('../../../src/core/skills/index.js');
    assert.strictEqual(typeof mod.SKILL_KEYWORD_MAP, 'object');
    assert.ok(mod.SKILL_KEYWORD_MAP.testing, 'Should have testing category');
    assert.ok(Array.isArray(mod.SKILL_KEYWORD_MAP.testing.keywords));
    assert.ok(Array.isArray(mod.SKILL_KEYWORD_MAP.testing.phases));
  });

  it('exports PHASE_TO_AGENT_MAP', async () => {
    const mod = await import('../../../src/core/skills/index.js');
    assert.strictEqual(typeof mod.PHASE_TO_AGENT_MAP, 'object');
    assert.strictEqual(mod.PHASE_TO_AGENT_MAP['06-implementation'], 'software-developer');
    assert.strictEqual(mod.PHASE_TO_AGENT_MAP['01-requirements'], 'requirements-analyst');
  });

  it('exports validateSkillFrontmatter function', async () => {
    const mod = await import('../../../src/core/skills/index.js');
    assert.strictEqual(typeof mod.validateSkillFrontmatter, 'function');
  });

  it('validateSkillFrontmatter rejects missing file', async () => {
    const mod = await import('../../../src/core/skills/index.js');
    const result = mod.validateSkillFrontmatter('/nonexistent/file.md');
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes('not found'));
  });

  it('validateSkillFrontmatter rejects non-.md file', async () => {
    const { writeFileSync, unlinkSync } = await import('node:fs');
    const tmpFile = '/tmp/isdlc-test-skill-file.txt';
    writeFileSync(tmpFile, 'some content');
    try {
      const mod = await import('../../../src/core/skills/index.js');
      const result = mod.validateSkillFrontmatter(tmpFile);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('.md')));
    } finally {
      try { unlinkSync(tmpFile); } catch {}
    }
  });

  it('exports analyzeSkillContent function', async () => {
    const mod = await import('../../../src/core/skills/index.js');
    assert.strictEqual(typeof mod.analyzeSkillContent, 'function');
  });

  it('analyzeSkillContent returns low confidence for empty content', async () => {
    const mod = await import('../../../src/core/skills/index.js');
    const result = mod.analyzeSkillContent('');
    assert.strictEqual(result.confidence, 'low');
    assert.deepStrictEqual(result.keywords, []);
    assert.ok(result.suggestedPhases.includes('06-implementation'));
  });

  it('analyzeSkillContent detects testing keywords', async () => {
    const mod = await import('../../../src/core/skills/index.js');
    const result = mod.analyzeSkillContent('This skill covers testing and coverage with jest framework');
    assert.ok(result.keywords.length >= 1);
    assert.ok(result.suggestedPhases.some(p => p.includes('test') || p.includes('implementation')));
  });

  it('exports suggestBindings function', async () => {
    const mod = await import('../../../src/core/skills/index.js');
    assert.strictEqual(typeof mod.suggestBindings, 'function');
  });

  it('suggestBindings returns default for null analysis', async () => {
    const mod = await import('../../../src/core/skills/index.js');
    const result = mod.suggestBindings(null, null);
    assert.ok(Array.isArray(result.agents));
    assert.ok(Array.isArray(result.phases));
    assert.ok(result.phases.includes('06-implementation'));
    assert.strictEqual(result.delivery_type, 'context');
    assert.strictEqual(result.confidence, 'low');
  });

  it('exports formatSkillInjectionBlock function', async () => {
    const mod = await import('../../../src/core/skills/index.js');
    assert.strictEqual(typeof mod.formatSkillInjectionBlock, 'function');
  });

  it('formatSkillInjectionBlock formats context type', async () => {
    const mod = await import('../../../src/core/skills/index.js');
    const result = mod.formatSkillInjectionBlock('my-skill', 'some content', 'context');
    assert.ok(result.includes('EXTERNAL SKILL CONTEXT'));
    assert.ok(result.includes('my-skill'));
    assert.ok(result.includes('some content'));
  });

  it('formatSkillInjectionBlock formats instruction type', async () => {
    const mod = await import('../../../src/core/skills/index.js');
    const result = mod.formatSkillInjectionBlock('my-skill', 'must follow this', 'instruction');
    assert.ok(result.includes('EXTERNAL SKILL INSTRUCTION'));
    assert.ok(result.includes('MUST follow'));
  });

  it('formatSkillInjectionBlock formats reference type', async () => {
    const mod = await import('../../../src/core/skills/index.js');
    const result = mod.formatSkillInjectionBlock('my-skill', '/path/to/file.md', 'reference');
    assert.ok(result.includes('EXTERNAL SKILL AVAILABLE'));
    assert.ok(result.includes('/path/to/file.md'));
  });

  it('exports removeSkillFromManifest function', async () => {
    const mod = await import('../../../src/core/skills/index.js');
    assert.strictEqual(typeof mod.removeSkillFromManifest, 'function');
  });

  it('removeSkillFromManifest removes by name', async () => {
    const mod = await import('../../../src/core/skills/index.js');
    const manifest = { version: '1.0.0', skills: [{ name: 'a' }, { name: 'b' }] };
    const result = mod.removeSkillFromManifest('a', manifest);
    assert.strictEqual(result.removed, true);
    assert.strictEqual(result.manifest.skills.length, 1);
    assert.strictEqual(result.manifest.skills[0].name, 'b');
  });

  it('removeSkillFromManifest handles null manifest', async () => {
    const mod = await import('../../../src/core/skills/index.js');
    const result = mod.removeSkillFromManifest('a', null);
    assert.strictEqual(result.removed, false);
    assert.ok(Array.isArray(result.manifest.skills));
  });

  it('exports reconcileSkillsBySource function', async () => {
    const mod = await import('../../../src/core/skills/index.js');
    assert.strictEqual(typeof mod.reconcileSkillsBySource, 'function');
  });

  it('reconcileSkillsBySource rejects invalid source', async () => {
    const mod = await import('../../../src/core/skills/index.js');
    const result = mod.reconcileSkillsBySource(null, 'invalid', [], null);
    assert.strictEqual(result.changed, false);
  });

  it('reconcileSkillsBySource adds new skills from discover source', async () => {
    const mod = await import('../../../src/core/skills/index.js');
    const result = mod.reconcileSkillsBySource(
      null,
      'discover',
      [{ name: 'new-skill', file: '/path.md', description: 'test' }],
      null
    );
    assert.strictEqual(result.changed, true);
    assert.deepStrictEqual(result.added, ['new-skill']);
    assert.strictEqual(result.manifest.skills.length, 1);
  });
});

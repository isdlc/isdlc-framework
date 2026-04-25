/**
 * Unit tests for pushToKnowledgeService (F0010)
 * Traces: FR-004 AC-004-01 through AC-004-05
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ESM import of the function under test
const { pushToKnowledgeService } = await import('../../../src/core/finalize/finalize-utils.js');

describe('pushToKnowledgeService (TC-KS-04)', () => {
  let tmpRoot;
  let artifactDir;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'ks-finalize-'));
    mkdirSync(join(tmpRoot, '.isdlc'), { recursive: true });
    artifactDir = 'docs/requirements/REQ-TEST';
    mkdirSync(join(tmpRoot, artifactDir), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  function writeConfig(knowledge) {
    writeFileSync(
      join(tmpRoot, '.isdlc', 'config.json'),
      JSON.stringify({ knowledge })
    );
  }

  function writeArtifact(name, content) {
    writeFileSync(join(tmpRoot, artifactDir, name), content);
  }

  it('TC-KS-04-01: [P0] skips when no config file exists', async () => {
    const result = await pushToKnowledgeService(tmpRoot, artifactDir);
    assert.equal(result.success, true);
    assert.equal(result.skipped, true);
    assert.match(result.message, /not configured/);
  });

  it('TC-KS-04-02: [P0] skips when knowledge.url is null', async () => {
    writeConfig({ url: null, projects: [] });
    const result = await pushToKnowledgeService(tmpRoot, artifactDir);
    assert.equal(result.success, true);
    assert.equal(result.skipped, true);
  });

  it('TC-KS-04-03: [P0] skips when knowledge.url is empty string', async () => {
    writeConfig({ url: '', projects: [] });
    const result = await pushToKnowledgeService(tmpRoot, artifactDir);
    assert.equal(result.success, true);
    assert.equal(result.skipped, true);
  });

  it('TC-KS-04-04: [P0] skips when knowledge section is missing', async () => {
    writeFileSync(join(tmpRoot, '.isdlc', 'config.json'), JSON.stringify({ embeddings: {} }));
    const result = await pushToKnowledgeService(tmpRoot, artifactDir);
    assert.equal(result.success, true);
    assert.equal(result.skipped, true);
  });

  it('TC-KS-04-05: [P0] skips when artifact folder does not exist', async () => {
    writeConfig({ url: 'http://localhost:3100', projects: ['test-1.0'] });
    const result = await pushToKnowledgeService(tmpRoot, 'docs/requirements/NONEXISTENT');
    assert.equal(result.success, true);
    assert.equal(result.skipped, true);
    assert.match(result.message, /no artifacts/);
  });

  it('TC-KS-04-06: [P0] skips when artifact folder is empty', async () => {
    writeConfig({ url: 'http://localhost:3100', projects: ['test-1.0'] });
    // artifactDir exists but is empty — create a subdir to make it non-empty for readdirSync but no files
    const result = await pushToKnowledgeService(tmpRoot, artifactDir);
    assert.equal(result.success, true);
    assert.equal(result.skipped, true);
  });

  it('TC-KS-04-07: [P0] calls addContentFn for each artifact file', async () => {
    writeConfig({ url: 'http://localhost:3100', projects: ['payments-2.7'] });
    writeArtifact('requirements-spec.md', '# Requirements');
    writeArtifact('impact-analysis.md', '# Impact');

    const calls = [];
    const addContentFn = async (payload) => { calls.push(payload); };

    const result = await pushToKnowledgeService(tmpRoot, artifactDir, { addContentFn });
    assert.equal(result.success, true);
    assert.equal(result.filesProcessed, 2);
    assert.equal(result.filesFailed, 0);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].project, 'payments-2.7');
    assert.ok(calls.some(c => c.file === 'requirements-spec.md'));
    assert.ok(calls.some(c => c.file === 'impact-analysis.md'));
  });

  it('TC-KS-04-08: [P0] fail-open when addContentFn throws', async () => {
    writeConfig({ url: 'http://localhost:3100', projects: ['test-1.0'] });
    writeArtifact('spec.md', '# Spec');
    writeArtifact('design.md', '# Design');

    let callCount = 0;
    const addContentFn = async () => {
      callCount++;
      if (callCount === 1) throw new Error('network error');
    };

    const result = await pushToKnowledgeService(tmpRoot, artifactDir, { addContentFn });
    assert.equal(result.success, true);
    assert.equal(result.filesProcessed, 1);
    assert.equal(result.filesFailed, 1);
    assert.match(result.message, /partial/);
  });

  it('TC-KS-04-09: [P0] fail-open when all files fail', async () => {
    writeConfig({ url: 'http://localhost:3100', projects: ['test-1.0'] });
    writeArtifact('spec.md', '# Spec');

    const addContentFn = async () => { throw new Error('total failure'); };

    const result = await pushToKnowledgeService(tmpRoot, artifactDir, { addContentFn });
    assert.equal(result.success, false);
    assert.equal(result.filesProcessed, 0);
    assert.equal(result.filesFailed, 1);
  });

  it('TC-KS-04-10: [P0] fail-open on timeout', async () => {
    writeConfig({ url: 'http://localhost:3100', projects: ['test-1.0'] });
    writeArtifact('spec.md', '# Spec');

    const addContentFn = () => new Promise(resolve => setTimeout(resolve, 10000));

    const result = await pushToKnowledgeService(tmpRoot, artifactDir, {
      addContentFn,
      timeoutMs: 50
    });
    assert.equal(result.filesProcessed, 0);
    assert.equal(result.filesFailed, 1);
  });

  it('TC-KS-04-11: [P1] uses first project from projects array', async () => {
    writeConfig({ url: 'http://localhost:3100', projects: ['proj-a', 'proj-b'] });
    writeArtifact('spec.md', '# Spec');

    const calls = [];
    const addContentFn = async (payload) => { calls.push(payload); };

    await pushToKnowledgeService(tmpRoot, artifactDir, { addContentFn });
    assert.equal(calls[0].project, 'proj-a');
  });

  it('TC-KS-04-12: [P1] handles malformed config JSON gracefully (fail-open)', async () => {
    writeFileSync(join(tmpRoot, '.isdlc', 'config.json'), '{bad json');
    const result = await pushToKnowledgeService(tmpRoot, artifactDir);
    assert.equal(result.success, true);
    assert.equal(result.skipped, true);
    assert.match(result.message, /fail-open/);
  });
});

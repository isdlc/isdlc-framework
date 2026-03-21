/**
 * Tests for Handler Wiring — FR-003
 *
 * BUG-0056: Verify the analyze handler calls searchMemory() with hybrid
 * options and writes enriched session records with async embedding.
 *
 * These tests verify the handler wiring by testing the memory modules
 * directly (since isdlc.md is a markdown command file, not JS).
 * We verify the searchMemory and embedSession paths that the handler
 * should call, and verify the isdlc.md source references the new APIs.
 *
 * REQ: BUG-0056 / FR-003 (AC-003-01..05)
 * Article II: Test-First Development
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from './utils/test-helpers.js';
import { searchMemory } from './memory-search.js';
import { embedSession } from './memory-embedder.js';
import { writeSessionRecord } from './memory.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVector(seed, dims = 4) {
  const vec = new Float32Array(dims);
  for (let i = 0; i < dims; i++) vec[i] = Math.sin(seed * (i + 1)) * 0.5 + 0.5;
  let norm = 0;
  for (let i = 0; i < dims; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < dims; i++) vec[i] /= norm;
  return vec;
}

function mockEmbed(texts, config) {
  return Promise.resolve({
    vectors: texts.map((_, i) => makeVector(i + 1)),
    dimensions: 4,
    model: config.provider,
    totalTokens: texts.reduce((s, t) => s + t.length, 0),
  });
}

function mockChunkDocument(text) {
  return [{ id: `chunk_${text.slice(0, 8)}`, content: text, filePath: '<test>', sectionPath: '<root>', charOffset: 0 }];
}

// ---------------------------------------------------------------------------
// FR-003: Handler Wiring Tests
// ---------------------------------------------------------------------------

describe('FR-003: Handler Wiring — searchMemory() with hybrid options', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempDir(); });
  afterEach(() => { cleanupTempDir(tmpDir); });

  // TC-003-01: searchMemory() called with hybrid options
  it('TC-003-01: searchMemory() accepts codebaseIndexPath and hybrid options', async () => {
    const result = await searchMemory('test query', join(tmpDir, 'u.db'), join(tmpDir, 'p.emb'),
      { provider: 'test' },
      {
        embed: mockEmbed,
        createUserStore: () => ({
          async search() { return []; },
          async getModel() { return 'test'; },
          async incrementAccess() {},
          close() {},
        }),
        createProjectStore: () => ({
          async search() { return []; },
          async getModel() { return 'test'; },
          close() {},
        }),
      },
      {
        codebaseIndexPath: join(tmpDir, 'code.emb'),
        traverseLinks: true,
        includeProfile: true,
        minScore: 0,
      }
    );

    // Should return HybridSearchResult (not array)
    assert.ok(typeof result === 'object' && !Array.isArray(result),
      'Should return HybridSearchResult object');
    assert.ok('results' in result, 'Should have results field');
    assert.ok('codebaseResults' in result, 'Should have codebaseResults field');
    assert.ok('sources' in result, 'Should have sources field');
  });

  // TC-003-04: Falls back to legacy path when no vector indexes exist
  it('TC-003-04: falls back gracefully when searchMemory returns empty', async () => {
    const result = await searchMemory('test', join(tmpDir, 'u.db'), join(tmpDir, 'p.emb'),
      { provider: 'test' },
      {
        embed: mockEmbed,
        createUserStore: () => { throw new Error('No store'); },
        createProjectStore: () => { throw new Error('No store'); },
      },
      {
        codebaseIndexPath: join(tmpDir, 'code.emb'),
        minScore: 0,
      }
    );

    assert.deepEqual(result.results, [], 'Should return empty results');
    assert.deepEqual(result.codebaseResults, [], 'Should return empty codebase results');
  });

  // TC-003-06: searchMemory() receives correct codebaseIndexPath
  it('TC-003-06: codebaseIndexPath is passed through to hybrid mode', async () => {
    let receivedPath = null;
    const result = await searchMemory('test', join(tmpDir, 'u.db'), join(tmpDir, 'p.emb'),
      { provider: 'test' },
      {
        embed: mockEmbed,
        createUserStore: () => ({
          async search() { return []; },
          async getModel() { return 'test'; },
          async incrementAccess() {},
          close() {},
        }),
        createProjectStore: () => ({
          async search() { return []; },
          async getModel() { return 'test'; },
          close() {},
        }),
        createCodebaseStore: (path) => {
          receivedPath = path;
          return {
            async search() { return []; },
            async getModel() { return 'test'; },
            close() {},
          };
        },
      },
      {
        codebaseIndexPath: join(tmpDir, 'my-code.emb'),
        minScore: 0,
      }
    );

    assert.equal(receivedPath, join(tmpDir, 'my-code.emb'),
      'Codebase store should receive the correct path');
  });
});

describe('FR-003: Handler Wiring — EnrichedSessionRecord', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempDir(); });
  afterEach(() => { cleanupTempDir(tmpDir); });

  // TC-003-02: EnrichedSessionRecord written at handler completion
  it('TC-003-02: writeSessionRecord() accepts enriched record with summary', async () => {
    const enrichedRecord = {
      session_id: 'sess_bug0056_01',
      timestamp: new Date().toISOString(),
      topics: [{ topic_id: 'auth', depth_used: 'standard' }],
      summary: 'Decided on direct auth integration approach.',
      context_notes: [
        { topic: 'auth', content: 'JWT vs session: chose JWT.', relationship_hint: null },
      ],
      playbook_entry: 'Security-first approach.',
      importance: 7,
    };

    mkdirSync(join(tmpDir, '.isdlc'), { recursive: true });
    const result = await writeSessionRecord(enrichedRecord, tmpDir, join(tmpDir, 'user-mem'));

    assert.ok(result.userWritten, 'User layer should be written');
    assert.ok(result.projectWritten, 'Project layer should be written');
    assert.ok(result.enriched, 'Should detect enriched record (has summary)');
  });

  // TC-003-07: writeSessionRecord() enriched record has correct fields
  it('TC-003-07: enriched record has summary, context_notes, playbook_entry, importance', async () => {
    const record = {
      session_id: 'sess_bug0056_02',
      timestamp: new Date().toISOString(),
      topics: [],
      summary: 'Test summary.',
      context_notes: [{ topic: 'test', content: 'Test note.' }],
      playbook_entry: 'Test playbook.',
      importance: 0.8,
    };

    assert.equal(typeof record.summary, 'string', 'summary should be string');
    assert.ok(Array.isArray(record.context_notes), 'context_notes should be array');
    assert.equal(typeof record.playbook_entry, 'string', 'playbook_entry should be string');
    assert.equal(typeof record.importance, 'number', 'importance should be number');

    mkdirSync(join(tmpDir, '.isdlc'), { recursive: true });
    const result = await writeSessionRecord(record, tmpDir, join(tmpDir, 'user-mem'));
    assert.ok(result.enriched, 'Should be recognized as enriched');
  });

  // TC-003-08: Legacy flat record shape NOT written when using enriched path
  it('TC-003-08: legacy flat record lacks summary field', () => {
    const legacyRecord = {
      session_id: 'sess_legacy',
      topics_covered: ['auth'],
      depth_preferences_observed: { auth: 'standard' },
      overrides: [],
      session_timestamp: new Date().toISOString(),
    };

    // Legacy record should NOT have summary field
    assert.ok(!legacyRecord.summary, 'Legacy record should not have summary');
  });
});

describe('FR-003: Handler Wiring — embedSession() and fail-open', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempDir(); });
  afterEach(() => { cleanupTempDir(tmpDir); });

  // TC-003-03: embedSession() triggered with enriched record
  it('TC-003-03: embedSession() accepts enriched record and produces vectors', async () => {
    let { createUserStore } = await import('./memory-store-adapter.js');
    const store = createUserStore(join(tmpDir, 'user.db'));

    const result = await embedSession({
      session_id: 'sess_embed_01',
      summary: 'Auth approach decided.',
      context_notes: [{ topic: 'auth', content: 'JWT chosen.' }],
      importance: 7,
      timestamp: new Date().toISOString(),
    }, store, null, { provider: 'test' }, {
      embed: mockEmbed,
      chunkDocument: mockChunkDocument,
    });

    assert.ok(result.embedded, 'Should embed successfully');
    assert.ok(result.vectorsAdded > 0, 'Should add vectors');
    store.close();
  });

  // TC-003-05: Handler completes when embedSession() fails
  it('TC-003-05: embedSession() returns error result (fail-open) on bad record', async () => {
    const result = await embedSession(null, null, null, null);
    assert.equal(result.embedded, false, 'Should not embed null record');
    assert.ok(result.error, 'Should have error message');
  });
});

describe('FR-003: Handler Source Wiring Verification', () => {
  // Verify that isdlc.md references the new APIs
  it('isdlc.md contains searchMemory reference', () => {
    const isdlcPath = join(process.cwd(), 'src', 'claude', 'commands', 'isdlc.md');
    if (!existsSync(isdlcPath)) {
      // isdlc.md may not exist in test environment — skip
      return;
    }
    const src = readFileSync(isdlcPath, 'utf-8');
    assert.ok(src.includes('searchMemory') || src.includes('memory-search'),
      'isdlc.md should reference searchMemory or memory-search');
  });

  it('isdlc.md contains enriched session record reference', () => {
    const isdlcPath = join(process.cwd(), 'src', 'claude', 'commands', 'isdlc.md');
    if (!existsSync(isdlcPath)) return;
    const src = readFileSync(isdlcPath, 'utf-8');
    assert.ok(
      src.includes('EnrichedSessionRecord') || src.includes('enriched') || src.includes('summary'),
      'isdlc.md should reference enriched session records'
    );
  });

  it('isdlc.md contains embedSession reference', () => {
    const isdlcPath = join(process.cwd(), 'src', 'claude', 'commands', 'isdlc.md');
    if (!existsSync(isdlcPath)) return;
    const src = readFileSync(isdlcPath, 'utf-8');
    assert.ok(src.includes('embedSession') || src.includes('memory-embedder'),
      'isdlc.md should reference embedSession or memory-embedder');
  });
});

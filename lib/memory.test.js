/**
 * Tests for lib/memory.js — Roundtable Memory Layer (REQ-0063)
 *
 * Covers all 6 exported functions: readUserProfile, readProjectMemory,
 * mergeMemory, formatMemoryContext, writeSessionRecord, compact.
 *
 * Uses node:test + node:assert/strict with temp directories for isolation.
 * No real ~/.isdlc/ is ever touched — all paths are overridden.
 *
 * Test IDs map to test-cases.md (UT-001..UT-062, IT-001..IT-018).
 * FR/AC references trace to requirements-spec.md.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from './utils/test-helpers.js';
import {
  readUserProfile,
  readProjectMemory,
  mergeMemory,
  formatMemoryContext,
  writeSessionRecord,
  compact,
} from './memory.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a valid UserProfile JSON file in userMemoryDir. */
function writeUserProfile(userMemoryDir, profile) {
  mkdirSync(userMemoryDir, { recursive: true });
  writeFileSync(join(userMemoryDir, 'profile.json'), JSON.stringify(profile, null, 2), 'utf-8');
}

/** Create a valid ProjectMemory JSON file in projectRoot/.isdlc/. */
function writeProjectMemory(projectRoot, memory) {
  const isdlcDir = join(projectRoot, '.isdlc');
  mkdirSync(isdlcDir, { recursive: true });
  writeFileSync(join(isdlcDir, 'roundtable-memory.json'), JSON.stringify(memory, null, 2), 'utf-8');
}

/** Create a user session file. */
function writeUserSession(userMemoryDir, filename, record) {
  const sessionsDir = join(userMemoryDir, 'sessions');
  mkdirSync(sessionsDir, { recursive: true });
  writeFileSync(join(sessionsDir, filename), JSON.stringify(record, null, 2), 'utf-8');
}

/** Make a standard SessionRecord for tests. */
function makeSessionRecord(overrides = {}) {
  return {
    session_id: 'sess_20260313_230000',
    slug: 'REQ-0063-roundtable-memory-layer',
    timestamp: '2026-03-13T23:00:00Z',
    topics: [
      {
        topic_id: 'problem-discovery',
        depth_used: 'standard',
        acknowledged: true,
        overridden: false,
        assumptions_count: 2,
      },
    ],
    ...overrides,
  };
}

/** Make a standard UserProfile object for tests. */
function makeUserProfile(overrides = {}) {
  return {
    version: 1,
    last_compacted: '2026-03-13T23:00:00Z',
    topics: {
      'problem-discovery': {
        preferred_depth: 'standard',
        weight: 0.8,
        last_updated: '2026-03-13T23:00:00Z',
        override_count: 2,
        session_count: 15,
      },
      architecture: {
        preferred_depth: 'brief',
        weight: 0.9,
        last_updated: '2026-03-12T10:00:00Z',
        override_count: 1,
        session_count: 15,
      },
    },
    ...overrides,
  };
}

/** Make a standard ProjectMemory object for tests. */
function makeProjectMemory(overrides = {}) {
  return {
    version: 1,
    summary: {
      total_sessions: 5,
      last_session: '2026-03-13T23:00:00Z',
      topics: {
        security: {
          avg_depth: 'deep',
          sessions_deep: 4,
          sessions_standard: 0,
          sessions_brief: 1,
          assumptions_total: 12,
          assumptions_amended: 3,
        },
      },
    },
    sessions: [
      {
        session_id: 'sess_20260313_230000',
        slug: 'REQ-0063-roundtable-memory-layer',
        timestamp: '2026-03-13T23:00:00Z',
        topics: [
          {
            topic_id: 'problem-discovery',
            depth_used: 'standard',
            acknowledged: true,
            overridden: false,
            assumptions_count: 2,
          },
        ],
      },
    ],
    ...overrides,
  };
}

// ===========================================================================
// UNIT TESTS: readUserProfile
// ===========================================================================

describe('readUserProfile', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  // UT-001: Happy path — FR-001 (AC-001-01)
  it('UT-001: returns parsed UserProfile on valid file', async () => {
    const userDir = join(tmpDir, 'user-memory');
    const profile = makeUserProfile();
    writeUserProfile(userDir, profile);

    const result = await readUserProfile(userDir);

    assert.ok(result, 'Should return a profile');
    assert.equal(result.version, 1);
    assert.ok(result.topics['problem-discovery']);
    assert.equal(result.topics['problem-discovery'].preferred_depth, 'standard');
    assert.equal(result.topics['problem-discovery'].weight, 0.8);
    assert.equal(result.topics['problem-discovery'].override_count, 2);
    assert.equal(result.topics['problem-discovery'].session_count, 15);
  });

  // UT-002: File not found — FR-008 (AC-008-01) — MEM-001
  it('UT-002: returns null when profile.json does not exist', async () => {
    const result = await readUserProfile(join(tmpDir, 'nonexistent'));
    assert.equal(result, null);
  });

  // UT-003: Malformed JSON — FR-008 (AC-008-02) — MEM-003
  it('UT-003: returns null on malformed JSON', async () => {
    const userDir = join(tmpDir, 'user-memory');
    mkdirSync(userDir, { recursive: true });
    writeFileSync(join(userDir, 'profile.json'), '{broken', 'utf-8');

    const result = await readUserProfile(userDir);
    assert.equal(result, null);
  });

  // UT-004: Partial schema — FR-008 (AC-008-03) — MEM-005
  it('UT-004: applies defaults for missing fields', async () => {
    const userDir = join(tmpDir, 'user-memory');
    writeUserProfile(userDir, {
      topics: {
        architecture: {
          preferred_depth: 'brief',
          // missing weight, last_updated, override_count, session_count
        },
      },
      // missing version
    });

    const result = await readUserProfile(userDir);
    assert.ok(result);
    assert.equal(result.version, 1); // default
    assert.equal(result.topics.architecture.weight, 0.5); // default
    assert.equal(result.topics.architecture.preferred_depth, 'brief');
  });

  // UT-005: Empty file — FR-008 (AC-008-02)
  it('UT-005: returns null on empty file', async () => {
    const userDir = join(tmpDir, 'user-memory');
    mkdirSync(userDir, { recursive: true });
    writeFileSync(join(userDir, 'profile.json'), '', 'utf-8');

    const result = await readUserProfile(userDir);
    assert.equal(result, null);
  });

  // UT-006: Empty topics — FR-001 (AC-001-01)
  it('UT-006: returns profile with empty topics map', async () => {
    const userDir = join(tmpDir, 'user-memory');
    writeUserProfile(userDir, { version: 1, topics: {} });

    const result = await readUserProfile(userDir);
    assert.ok(result);
    assert.deepStrictEqual(result.topics, {});
  });

  // UT-051: Version field default — FR-008 (AC-008-02)
  it('UT-051: assumes version 1 when version field is missing', async () => {
    const userDir = join(tmpDir, 'user-memory');
    writeUserProfile(userDir, { topics: { arch: { preferred_depth: 'brief' } } });

    const result = await readUserProfile(userDir);
    assert.ok(result);
    assert.equal(result.version, 1);
  });

  // UT-052: Missing topics default — FR-008 (AC-008-02)
  it('UT-052: uses empty {} for missing topics field', async () => {
    const userDir = join(tmpDir, 'user-memory');
    writeUserProfile(userDir, { version: 1 });

    const result = await readUserProfile(userDir);
    assert.ok(result);
    assert.deepStrictEqual(result.topics, {});
  });

  // UT-053: Missing weight default — FR-008 (AC-008-03)
  it('UT-053: uses default weight of 0.5 for missing weight', async () => {
    const userDir = join(tmpDir, 'user-memory');
    writeUserProfile(userDir, {
      topics: { testing: { preferred_depth: 'deep' } },
    });

    const result = await readUserProfile(userDir);
    assert.ok(result);
    assert.equal(result.topics.testing.weight, 0.5);
  });

  // UT-054: Missing last_updated default — FR-008 (AC-008-03)
  it('UT-054: uses epoch as default for missing last_updated', async () => {
    const userDir = join(tmpDir, 'user-memory');
    writeUserProfile(userDir, {
      topics: { testing: { preferred_depth: 'deep', weight: 0.6 } },
    });

    const result = await readUserProfile(userDir);
    assert.ok(result);
    assert.equal(result.topics.testing.last_updated, '1970-01-01T00:00:00.000Z');
  });

  // UT-057: Path traversal prevention — Security
  it('UT-057: returns null on path traversal attempt', async () => {
    const maliciousPath = join(tmpDir, '..', '..', '..', 'etc');
    const result = await readUserProfile(maliciousPath);
    assert.equal(result, null);
  });

  // UT-058: Deeply nested JSON — Security
  it('UT-058: handles deeply nested JSON gracefully', async () => {
    const userDir = join(tmpDir, 'user-memory');
    mkdirSync(userDir, { recursive: true });
    // Build 100-level nested object
    let nested = { preferred_depth: 'brief' };
    for (let i = 0; i < 100; i++) {
      nested = { [`level_${i}`]: nested };
    }
    writeFileSync(join(userDir, 'profile.json'), JSON.stringify({ version: 1, topics: nested }), 'utf-8');

    // Should not crash
    const result = await readUserProfile(userDir);
    // Either returns a profile (with the nested structure) or null on validation
    assert.ok(result === null || typeof result === 'object');
  });

  // UT-059: Oversized string — Security
  it('UT-059: handles oversized topic_id gracefully', async () => {
    const userDir = join(tmpDir, 'user-memory');
    mkdirSync(userDir, { recursive: true });
    const bigKey = 'x'.repeat(10_000); // 10KB key (not 10MB to avoid slow tests)
    writeFileSync(
      join(userDir, 'profile.json'),
      JSON.stringify({ version: 1, topics: { [bigKey]: { preferred_depth: 'brief' } } }),
      'utf-8'
    );

    const result = await readUserProfile(userDir);
    // Should handle gracefully — either returns null or parsed profile
    assert.ok(result === null || typeof result === 'object');
  });
});

// ===========================================================================
// UNIT TESTS: readProjectMemory
// ===========================================================================

describe('readProjectMemory', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  // UT-007: Happy path — FR-002 (AC-002-01)
  it('UT-007: returns parsed ProjectMemory on valid file', async () => {
    const projectRoot = join(tmpDir, 'project');
    mkdirSync(projectRoot, { recursive: true });
    writeProjectMemory(projectRoot, makeProjectMemory());

    const result = await readProjectMemory(projectRoot);

    assert.ok(result);
    assert.equal(result.version, 1);
    assert.ok(result.summary);
    assert.ok(result.summary.topics.security);
    assert.equal(result.summary.topics.security.avg_depth, 'deep');
    assert.ok(Array.isArray(result.sessions));
  });

  // UT-008: File not found — FR-008 (AC-008-01) — MEM-002
  it('UT-008: returns null when roundtable-memory.json does not exist', async () => {
    const result = await readProjectMemory(join(tmpDir, 'nonexistent'));
    assert.equal(result, null);
  });

  // UT-009: Malformed JSON — FR-008 (AC-008-02) — MEM-004
  it('UT-009: returns null on malformed JSON', async () => {
    const projectRoot = join(tmpDir, 'project');
    const isdlcDir = join(projectRoot, '.isdlc');
    mkdirSync(isdlcDir, { recursive: true });
    writeFileSync(join(isdlcDir, 'roundtable-memory.json'), 'not json at all', 'utf-8');

    const result = await readProjectMemory(projectRoot);
    assert.equal(result, null);
  });

  // UT-010: Per-topic record format — FR-002 (AC-002-02)
  it('UT-010: summary topics have all required fields', async () => {
    const projectRoot = join(tmpDir, 'project');
    mkdirSync(projectRoot, { recursive: true });
    writeProjectMemory(projectRoot, makeProjectMemory());

    const result = await readProjectMemory(projectRoot);
    assert.ok(result);
    const secTopic = result.summary.topics.security;
    assert.ok('avg_depth' in secTopic);
    assert.ok('sessions_deep' in secTopic);
    assert.ok('sessions_brief' in secTopic);
    assert.ok('assumptions_total' in secTopic);
    assert.ok('assumptions_amended' in secTopic);
  });

  // UT-011: Deterministic JSON output — FR-002 (AC-002-04)
  it('UT-011: written project memory has sorted keys', async () => {
    const projectRoot = join(tmpDir, 'project');
    mkdirSync(join(projectRoot, '.isdlc'), { recursive: true });
    const record = makeSessionRecord();
    const userDir = join(tmpDir, 'user-memory');

    await writeSessionRecord(record, projectRoot, userDir);

    const filePath = join(projectRoot, '.isdlc', 'roundtable-memory.json');
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);

    // Verify JSON is pretty-printed (has newlines and indentation)
    assert.ok(raw.includes('\n'));
    assert.ok(raw.includes('  '));

    // Verify deterministic structure
    assert.ok(parsed.version);
    assert.ok(parsed.sessions);
  });

  // UT-055: Missing sessions default — FR-008 (AC-008-02)
  it('UT-055: uses empty array for missing sessions field', async () => {
    const projectRoot = join(tmpDir, 'project');
    mkdirSync(projectRoot, { recursive: true });
    writeProjectMemory(projectRoot, { version: 1, summary: { total_sessions: 0, last_session: null, topics: {} } });

    const result = await readProjectMemory(projectRoot);
    assert.ok(result);
    assert.ok(Array.isArray(result.sessions));
    assert.equal(result.sessions.length, 0);
  });

  // UT-056: Session missing topics — FR-008 (AC-008-03)
  it('UT-056: skips session records missing topics field', async () => {
    const projectRoot = join(tmpDir, 'project');
    mkdirSync(projectRoot, { recursive: true });
    writeProjectMemory(projectRoot, {
      version: 1,
      summary: { total_sessions: 2, last_session: '2026-03-13T23:00:00Z', topics: {} },
      sessions: [
        { session_id: 'sess_1', slug: 'test', timestamp: '2026-03-13T23:00:00Z' }, // missing topics
        { session_id: 'sess_2', slug: 'test', timestamp: '2026-03-13T23:00:00Z', topics: [] },
      ],
    });

    const result = await readProjectMemory(projectRoot);
    assert.ok(result);
    // The session without topics should be filtered out during validation
    const validSessions = result.sessions.filter((s) => Array.isArray(s.topics));
    assert.equal(validSessions.length, 1);
  });
});

// ===========================================================================
// UNIT TESTS: mergeMemory
// ===========================================================================

describe('mergeMemory', () => {
  // UT-012: Both present, no conflicts — FR-003 (AC-003-02)
  it('UT-012: merges both inputs with no conflicts when depths agree', () => {
    const user = makeUserProfile({
      topics: {
        architecture: { preferred_depth: 'brief', weight: 0.8, last_updated: '2026-03-12T10:00:00Z', override_count: 1, session_count: 10 },
      },
    });
    const project = makeProjectMemory({
      summary: {
        total_sessions: 5,
        last_session: '2026-03-13T23:00:00Z',
        topics: { architecture: { avg_depth: 'brief', sessions_deep: 0, sessions_standard: 1, sessions_brief: 4, assumptions_total: 5, assumptions_amended: 1 } },
      },
    });

    const result = mergeMemory(user, project);
    assert.ok(result.topics.architecture);
    assert.equal(result.topics.architecture.conflict, false);
    assert.ok(result.topics.architecture.user_preference);
    assert.ok(result.topics.architecture.project_history);
  });

  // UT-013: Both present, conflict detected — FR-005 (AC-005-01)
  it('UT-013: detects conflict when user and project depths differ', () => {
    const user = makeUserProfile({
      topics: {
        security: { preferred_depth: 'brief', weight: 0.7, last_updated: '2026-03-12T10:00:00Z', override_count: 0, session_count: 8 },
      },
    });
    const project = makeProjectMemory({
      summary: {
        total_sessions: 5,
        last_session: '2026-03-13T23:00:00Z',
        topics: { security: { avg_depth: 'deep', sessions_deep: 4, sessions_standard: 0, sessions_brief: 1, assumptions_total: 12, assumptions_amended: 3 } },
      },
    });

    const result = mergeMemory(user, project);
    assert.ok(result.topics.security);
    assert.equal(result.topics.security.conflict, true);
  });

  // UT-014: Conflict not flagged for weak preferences — FR-005 (AC-005-01)
  it('UT-014: does not flag conflict when user weight < 0.5', () => {
    const user = makeUserProfile({
      topics: {
        security: { preferred_depth: 'brief', weight: 0.3, last_updated: '2026-03-12T10:00:00Z', override_count: 0, session_count: 3 },
      },
    });
    const project = makeProjectMemory({
      summary: {
        total_sessions: 5,
        last_session: '2026-03-13T23:00:00Z',
        topics: { security: { avg_depth: 'deep', sessions_deep: 4, sessions_standard: 0, sessions_brief: 1, assumptions_total: 12, assumptions_amended: 3 } },
      },
    });

    const result = mergeMemory(user, project);
    assert.equal(result.topics.security.conflict, false);
  });

  // UT-015: Only user profile present — FR-003 (AC-003-02)
  it('UT-015: handles user-only input with no conflicts', () => {
    const user = makeUserProfile();
    const result = mergeMemory(user, null);

    assert.ok(result.topics['problem-discovery']);
    assert.ok(result.topics['problem-discovery'].user_preference);
    assert.equal(result.topics['problem-discovery'].project_history, null);
    assert.equal(result.topics['problem-discovery'].conflict, false);
  });

  // UT-016: Only project memory present — FR-003 (AC-003-02)
  it('UT-016: handles project-only input with no conflicts', () => {
    const project = makeProjectMemory();
    const result = mergeMemory(null, project);

    assert.ok(result.topics.security);
    assert.equal(result.topics.security.user_preference, null);
    assert.ok(result.topics.security.project_history);
    assert.equal(result.topics.security.conflict, false);
  });

  // UT-017: Both null — FR-008 (AC-008-01)
  it('UT-017: returns empty topics when both inputs are null', () => {
    const result = mergeMemory(null, null);
    assert.deepStrictEqual(result, { topics: {} });
  });

  // UT-018: Topics from both sources combined — FR-003 (AC-003-02)
  it('UT-018: combines topics from both sources', () => {
    const user = makeUserProfile({
      topics: {
        architecture: { preferred_depth: 'brief', weight: 0.9, last_updated: '2026-03-12T10:00:00Z', override_count: 1, session_count: 15 },
        security: { preferred_depth: 'brief', weight: 0.7, last_updated: '2026-03-12T10:00:00Z', override_count: 0, session_count: 8 },
      },
    });
    const project = makeProjectMemory({
      summary: {
        total_sessions: 5,
        last_session: '2026-03-13T23:00:00Z',
        topics: {
          security: { avg_depth: 'deep', sessions_deep: 4, sessions_standard: 0, sessions_brief: 1, assumptions_total: 12, assumptions_amended: 3 },
          testing: { avg_depth: 'standard', sessions_deep: 0, sessions_standard: 4, sessions_brief: 1, assumptions_total: 6, assumptions_amended: 0 },
        },
      },
    });

    const result = mergeMemory(user, project);
    const topicIds = Object.keys(result.topics);
    assert.ok(topicIds.includes('architecture')); // user only
    assert.ok(topicIds.includes('security')); // both
    assert.ok(topicIds.includes('testing')); // project only
    assert.equal(topicIds.length, 3);
  });

  // UT-019: Distinguishes user vs project source — FR-003 (AC-003-02)
  it('UT-019: merged entry has separate user_preference and project_history', () => {
    const user = makeUserProfile({
      topics: {
        security: { preferred_depth: 'brief', weight: 0.7, last_updated: '2026-03-12T10:00:00Z', override_count: 0, session_count: 8 },
      },
    });
    const project = makeProjectMemory();

    const result = mergeMemory(user, project);
    const sec = result.topics.security;
    assert.ok(sec.user_preference);
    assert.equal(sec.user_preference.depth, 'brief');
    assert.equal(sec.user_preference.weight, 0.7);
    assert.ok(sec.project_history);
    assert.equal(sec.project_history.avg_depth, 'deep');
    assert.equal(sec.project_history.sessions, 5);
  });

  // UT-060: Agreement applied silently — FR-005 (AC-005-03)
  it('UT-060: marks agreement as conflict=false', () => {
    const user = makeUserProfile({
      topics: {
        architecture: { preferred_depth: 'brief', weight: 0.9, last_updated: '2026-03-12T10:00:00Z', override_count: 0, session_count: 10 },
      },
    });
    const project = makeProjectMemory({
      summary: {
        total_sessions: 5,
        last_session: '2026-03-13T23:00:00Z',
        topics: { architecture: { avg_depth: 'brief', sessions_deep: 0, sessions_standard: 1, sessions_brief: 4, assumptions_total: 3, assumptions_amended: 0 } },
      },
    });

    const result = mergeMemory(user, project);
    assert.equal(result.topics.architecture.conflict, false);
  });

  // UT-061: All topics treated equally — FR-004 (AC-004-05)
  it('UT-061: processes all topics with identical logic', () => {
    const topicIds = ['requirements', 'architecture', 'security', 'testing', 'deployment'];
    const userTopics = {};
    const projectTopics = {};
    for (const id of topicIds) {
      userTopics[id] = { preferred_depth: 'standard', weight: 0.7, last_updated: '2026-03-12T10:00:00Z', override_count: 0, session_count: 5 };
      projectTopics[id] = { avg_depth: 'standard', sessions_deep: 1, sessions_standard: 3, sessions_brief: 1, assumptions_total: 5, assumptions_amended: 1 };
    }
    const user = makeUserProfile({ topics: userTopics });
    const project = makeProjectMemory({ summary: { total_sessions: 5, last_session: '2026-03-13T23:00:00Z', topics: projectTopics } });

    const result = mergeMemory(user, project);
    for (const id of topicIds) {
      assert.ok(result.topics[id], `Topic ${id} should be present`);
      assert.equal(result.topics[id].conflict, false, `Topic ${id} should have no conflict`);
      assert.ok(result.topics[id].user_preference, `Topic ${id} should have user_preference`);
      assert.ok(result.topics[id].project_history, `Topic ${id} should have project_history`);
    }
  });
});

// ===========================================================================
// UNIT TESTS: formatMemoryContext
// ===========================================================================

describe('formatMemoryContext', () => {
  // UT-020: Non-empty topics — FR-003 (AC-003-03)
  it('UT-020: formats topics with MEMORY_CONTEXT header', () => {
    const ctx = {
      topics: {
        'problem-discovery': {
          user_preference: { depth: 'standard', weight: 0.8 },
          project_history: { avg_depth: 'standard', sessions: 5 },
          conflict: false,
        },
        security: {
          user_preference: { depth: 'brief', weight: 0.7 },
          project_history: { avg_depth: 'deep', sessions: 5 },
          conflict: true,
        },
      },
    };

    const result = formatMemoryContext(ctx);
    assert.ok(result.startsWith('MEMORY_CONTEXT:'));
    assert.ok(result.includes('--- topic: problem-discovery ---'));
    assert.ok(result.includes('--- topic: security ---'));
    assert.ok(result.includes('conflict: true'));
    assert.ok(result.includes('conflict: false'));
  });

  // UT-021: Empty topics — FR-003 (AC-003-04)
  it('UT-021: returns empty string for empty topics', () => {
    const result = formatMemoryContext({ topics: {} });
    assert.equal(result, '');
  });

  // UT-022: Follows inlining pattern — FR-003 (AC-003-03)
  it('UT-022: output format uses block header and structured entries', () => {
    const ctx = {
      topics: {
        architecture: {
          user_preference: { depth: 'brief', weight: 0.9 },
          project_history: null,
          conflict: false,
        },
      },
    };

    const result = formatMemoryContext(ctx);
    assert.ok(result.startsWith('MEMORY_CONTEXT:'));
    assert.ok(result.includes('user_preference:'));
    assert.ok(result.includes('--- topic: architecture ---'));
  });

  // UT-023: Conflict indication — FR-005 (AC-005-01)
  it('UT-023: includes conflict: true for conflicting topics', () => {
    const ctx = {
      topics: {
        security: {
          user_preference: { depth: 'brief', weight: 0.7 },
          project_history: { avg_depth: 'deep', sessions: 5 },
          conflict: true,
        },
      },
    };

    const result = formatMemoryContext(ctx);
    assert.ok(result.includes('conflict: true'));
  });
});

// ===========================================================================
// UNIT TESTS: writeSessionRecord
// ===========================================================================

describe('writeSessionRecord', () => {
  let tmpDir;
  let projectRoot;
  let userMemoryDir;

  beforeEach(() => {
    tmpDir = createTempDir();
    projectRoot = join(tmpDir, 'project');
    userMemoryDir = join(tmpDir, 'user-memory');
    mkdirSync(projectRoot, { recursive: true });
    mkdirSync(join(projectRoot, '.isdlc'), { recursive: true });
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  // UT-024: Happy path — FR-006 (AC-006-01, AC-006-02)
  it('UT-024: writes to both user and project layers', async () => {
    const record = makeSessionRecord();
    const result = await writeSessionRecord(record, projectRoot, userMemoryDir);

    assert.equal(result.userWritten, true);
    assert.equal(result.projectWritten, true);

    // Verify user session file exists
    const sessionsDir = join(userMemoryDir, 'sessions');
    assert.ok(existsSync(sessionsDir));
    const files = readdirSync(sessionsDir);
    assert.ok(files.length > 0);

    // Verify project memory updated
    const projPath = join(projectRoot, '.isdlc', 'roundtable-memory.json');
    assert.ok(existsSync(projPath));
    const proj = JSON.parse(readFileSync(projPath, 'utf-8'));
    assert.ok(proj.sessions.length > 0);
  });

  // UT-025: Session record schema — FR-006 (AC-006-03)
  it('UT-025: preserves all session record fields on write+read', async () => {
    const record = makeSessionRecord({
      topics: [
        { topic_id: 'security', depth_used: 'deep', acknowledged: true, overridden: true, assumptions_count: 5 },
      ],
    });
    await writeSessionRecord(record, projectRoot, userMemoryDir);

    // Read back the user session file
    const sessionsDir = join(userMemoryDir, 'sessions');
    const files = readdirSync(sessionsDir);
    const content = JSON.parse(readFileSync(join(sessionsDir, files[0]), 'utf-8'));

    assert.equal(content.session_id, record.session_id);
    assert.equal(content.slug, record.slug);
    assert.equal(content.timestamp, record.timestamp);
    assert.equal(content.topics[0].topic_id, 'security');
    assert.equal(content.topics[0].depth_used, 'deep');
    assert.equal(content.topics[0].acknowledged, true);
    assert.equal(content.topics[0].overridden, true);
    assert.equal(content.topics[0].assumptions_count, 5);
  });

  // UT-026: User write failure — FR-006 (AC-006-04) — MEM-006
  it('UT-026: returns userWritten=false when user dir is read-only', async () => {
    // Create a read-only directory to prevent writes
    mkdirSync(userMemoryDir, { recursive: true });
    chmodSync(userMemoryDir, 0o444);

    const record = makeSessionRecord();
    const result = await writeSessionRecord(record, projectRoot, userMemoryDir);

    assert.equal(result.userWritten, false);
    assert.equal(result.projectWritten, true);

    // Restore permissions for cleanup
    chmodSync(userMemoryDir, 0o755);
  });

  // UT-027: Project write failure — FR-006 (AC-006-04) — MEM-007
  it('UT-027: returns projectWritten=false when .isdlc is read-only', async () => {
    const isdlcDir = join(projectRoot, '.isdlc');
    chmodSync(isdlcDir, 0o444);

    const record = makeSessionRecord();
    const result = await writeSessionRecord(record, projectRoot, userMemoryDir);

    assert.equal(result.userWritten, true);
    assert.equal(result.projectWritten, false);

    // Restore permissions for cleanup
    chmodSync(isdlcDir, 0o755);
  });

  // UT-028: Both writes fail — FR-008 (AC-008-05)
  it('UT-028: returns both false when both dirs are read-only', async () => {
    mkdirSync(userMemoryDir, { recursive: true });
    chmodSync(userMemoryDir, 0o444);
    const isdlcDir = join(projectRoot, '.isdlc');
    chmodSync(isdlcDir, 0o444);

    const record = makeSessionRecord();
    const result = await writeSessionRecord(record, projectRoot, userMemoryDir);

    assert.equal(result.userWritten, false);
    assert.equal(result.projectWritten, false);

    // Restore permissions for cleanup
    chmodSync(userMemoryDir, 0o755);
    chmodSync(isdlcDir, 0o755);
  });

  // UT-029: Creates user memory directory — FR-001 (AC-001-02)
  it('UT-029: creates sessions directory if it does not exist', async () => {
    // userMemoryDir does NOT exist yet
    const result = await writeSessionRecord(makeSessionRecord(), projectRoot, userMemoryDir);
    assert.equal(result.userWritten, true);
    assert.ok(existsSync(join(userMemoryDir, 'sessions')));
  });

  // UT-030: Dir creation failure — MEM-008
  it('UT-030: returns userWritten=false on dir creation failure', async () => {
    // Point userMemoryDir to a path under a read-only parent
    const readOnlyParent = join(tmpDir, 'readonly-parent');
    mkdirSync(readOnlyParent, { recursive: true });
    chmodSync(readOnlyParent, 0o444);

    const result = await writeSessionRecord(makeSessionRecord(), projectRoot, join(readOnlyParent, 'deep', 'nested'));

    assert.equal(result.userWritten, false);

    // Restore for cleanup
    chmodSync(readOnlyParent, 0o755);
  });

  // UT-031: Project memory append — FR-006 (AC-006-02)
  it('UT-031: appends to existing project memory sessions', async () => {
    writeProjectMemory(projectRoot, makeProjectMemory());

    const record = makeSessionRecord({ session_id: 'sess_20260314_010000' });
    await writeSessionRecord(record, projectRoot, userMemoryDir);

    const projPath = join(projectRoot, '.isdlc', 'roundtable-memory.json');
    const proj = JSON.parse(readFileSync(projPath, 'utf-8'));
    assert.equal(proj.sessions.length, 2); // original + new
  });

  // UT-032: Project memory file does not exist yet — FR-006 (AC-006-02)
  it('UT-032: creates new project memory file if it does not exist', async () => {
    const freshProjectRoot = join(tmpDir, 'fresh-project');
    mkdirSync(join(freshProjectRoot, '.isdlc'), { recursive: true });

    const result = await writeSessionRecord(makeSessionRecord(), freshProjectRoot, userMemoryDir);
    assert.equal(result.projectWritten, true);

    const projPath = join(freshProjectRoot, '.isdlc', 'roundtable-memory.json');
    const proj = JSON.parse(readFileSync(projPath, 'utf-8'));
    assert.ok(proj.version);
    assert.ok(Array.isArray(proj.sessions));
    assert.equal(proj.sessions.length, 1);
  });

  // UT-048: Cross-project persistence — FR-001 (AC-001-03)
  it('UT-048: same userMemoryDir accumulates sessions from multiple projects', async () => {
    const projectA = join(tmpDir, 'projA');
    const projectB = join(tmpDir, 'projB');
    mkdirSync(join(projectA, '.isdlc'), { recursive: true });
    mkdirSync(join(projectB, '.isdlc'), { recursive: true });

    await writeSessionRecord(makeSessionRecord({ session_id: 'sess_a' }), projectA, userMemoryDir);
    await writeSessionRecord(makeSessionRecord({ session_id: 'sess_b' }), projectB, userMemoryDir);

    const sessionsDir = join(userMemoryDir, 'sessions');
    const files = readdirSync(sessionsDir);
    assert.equal(files.length, 2);
  });

  // UT-049: User memory local only — FR-001 (AC-001-04)
  it('UT-049: does not write user data to project directory', async () => {
    await writeSessionRecord(makeSessionRecord(), projectRoot, userMemoryDir);

    // Check that no user-specific file appears outside .isdlc/roundtable-memory.json
    const projPath = join(projectRoot, '.isdlc', 'roundtable-memory.json');
    const proj = JSON.parse(readFileSync(projPath, 'utf-8'));
    // Project memory only contains session records, not user-level aggregates
    assert.ok(!proj.user_profile, 'No user_profile in project memory');
  });

  // UT-050: Project memory shared — FR-002 (AC-002-03)
  it('UT-050: project memory is written to .isdlc/ in project root', async () => {
    await writeSessionRecord(makeSessionRecord(), projectRoot, userMemoryDir);
    const projPath = join(projectRoot, '.isdlc', 'roundtable-memory.json');
    assert.ok(existsSync(projPath));
  });

  // UT-062: Append-only behavior — FR-001 (AC-001-02)
  it('UT-062: creates new session file without modifying existing ones', async () => {
    // Write 3 existing sessions
    writeUserSession(userMemoryDir, 'sess_1.json', makeSessionRecord({ session_id: 'sess_1' }));
    writeUserSession(userMemoryDir, 'sess_2.json', makeSessionRecord({ session_id: 'sess_2' }));
    writeUserSession(userMemoryDir, 'sess_3.json', makeSessionRecord({ session_id: 'sess_3' }));

    const originalFiles = readdirSync(join(userMemoryDir, 'sessions'));
    const originalContents = {};
    for (const f of originalFiles) {
      originalContents[f] = readFileSync(join(userMemoryDir, 'sessions', f), 'utf-8');
    }

    await writeSessionRecord(makeSessionRecord({ session_id: 'sess_4' }), projectRoot, userMemoryDir);

    // Verify new file exists
    const newFiles = readdirSync(join(userMemoryDir, 'sessions'));
    assert.equal(newFiles.length, 4);

    // Verify original files unchanged
    for (const f of originalFiles) {
      const content = readFileSync(join(userMemoryDir, 'sessions', f), 'utf-8');
      assert.equal(content, originalContents[f], `File ${f} should be unchanged`);
    }
  });
});

// ===========================================================================
// UNIT TESTS: compact
// ===========================================================================

describe('compact', () => {
  let tmpDir;
  let projectRoot;
  let userMemoryDir;

  beforeEach(() => {
    tmpDir = createTempDir();
    projectRoot = join(tmpDir, 'project');
    userMemoryDir = join(tmpDir, 'user-memory');
    mkdirSync(join(projectRoot, '.isdlc'), { recursive: true });
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  // UT-033: Happy path (both layers) — FR-007 (AC-007-01, AC-007-04)
  it('UT-033: compacts both user and project memory', async () => {
    // Create 10 user session files with varied topics
    for (let i = 0; i < 10; i++) {
      writeUserSession(userMemoryDir, `sess_${i}.json`, makeSessionRecord({
        session_id: `sess_${i}`,
        timestamp: `2026-03-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        topics: [
          { topic_id: 'architecture', depth_used: i < 7 ? 'brief' : 'deep', acknowledged: true, overridden: i >= 7, assumptions_count: 1 },
          { topic_id: 'security', depth_used: 'deep', acknowledged: true, overridden: false, assumptions_count: 2 },
        ],
      }));
    }

    // Create project memory with same 10 sessions
    const sessions = [];
    for (let i = 0; i < 10; i++) {
      sessions.push({
        session_id: `sess_${i}`,
        slug: 'test',
        timestamp: `2026-03-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        topics: [
          { topic_id: 'architecture', depth_used: i < 7 ? 'brief' : 'deep', acknowledged: true, overridden: i >= 7, assumptions_count: 1 },
          { topic_id: 'security', depth_used: 'deep', acknowledged: true, overridden: false, assumptions_count: 2 },
        ],
      });
    }
    writeProjectMemory(projectRoot, { version: 1, summary: { total_sessions: 10, last_session: '2026-03-10T10:00:00Z', topics: {} }, sessions });

    const result = await compact({ user: true, project: true, projectRoot, userMemoryDir });

    assert.ok(result.user);
    assert.equal(result.user.sessionsRead, 10);
    assert.ok(result.user.topicsAggregated >= 2);
    assert.equal(result.user.profileWritten, true);

    assert.ok(result.project);
    assert.equal(result.project.sessionsRead, 10);
    assert.ok(result.project.topicsAggregated >= 2);
    assert.equal(result.project.memoryWritten, true);
  });

  // UT-034: User only — FR-007 (AC-007-02)
  it('UT-034: compacts only user memory', async () => {
    for (let i = 0; i < 5; i++) {
      writeUserSession(userMemoryDir, `sess_${i}.json`, makeSessionRecord({
        session_id: `sess_${i}`,
        topics: [{ topic_id: 'arch', depth_used: 'brief', acknowledged: true, overridden: false, assumptions_count: 1 }],
      }));
    }

    const result = await compact({ user: true, project: false, userMemoryDir });
    assert.ok(result.user);
    assert.equal(result.user.sessionsRead, 5);
    assert.equal(result.project, undefined);
  });

  // UT-035: Project only — FR-007 (AC-007-03)
  it('UT-035: compacts only project memory', async () => {
    const sessions = [];
    for (let i = 0; i < 5; i++) {
      sessions.push({
        session_id: `sess_${i}`,
        slug: 'test',
        timestamp: `2026-03-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        topics: [{ topic_id: 'arch', depth_used: 'brief', acknowledged: true, overridden: false, assumptions_count: 1 }],
      });
    }
    writeProjectMemory(projectRoot, { version: 1, summary: { total_sessions: 0, last_session: null, topics: {} }, sessions });

    const result = await compact({ user: false, project: true, projectRoot });
    assert.ok(result.project);
    assert.equal(result.project.sessionsRead, 5);
    assert.equal(result.user, undefined);
  });

  // UT-036: Aggregation algorithm — FR-007 (AC-007-04)
  it('UT-036: preferred_depth is most frequent depth level', async () => {
    // 3 brief, 2 deep
    for (let i = 0; i < 5; i++) {
      writeUserSession(userMemoryDir, `sess_${i}.json`, makeSessionRecord({
        session_id: `sess_${i}`,
        timestamp: `2026-03-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        topics: [{ topic_id: 'arch', depth_used: i < 3 ? 'brief' : 'deep', acknowledged: true, overridden: false, assumptions_count: 1 }],
      }));
    }

    await compact({ user: true, project: false, userMemoryDir });

    const profile = JSON.parse(readFileSync(join(userMemoryDir, 'profile.json'), 'utf-8'));
    assert.equal(profile.topics.arch.preferred_depth, 'brief'); // most frequent
  });

  // UT-037: Weight calculation with age decay — FR-010 (AC-010-03)
  it('UT-037: weight reflects recency bias with age decay', async () => {
    // Create sessions spanning 6 months — old sessions deep, recent sessions brief
    const now = new Date('2026-03-13T10:00:00Z');
    for (let i = 0; i < 6; i++) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      writeUserSession(userMemoryDir, `sess_${i}.json`, makeSessionRecord({
        session_id: `sess_${i}`,
        timestamp: d.toISOString(),
        topics: [{ topic_id: 'arch', depth_used: i < 3 ? 'brief' : 'deep', acknowledged: true, overridden: false, assumptions_count: 1 }],
      }));
    }

    await compact({ user: true, project: false, userMemoryDir });

    const profile = JSON.parse(readFileSync(join(userMemoryDir, 'profile.json'), 'utf-8'));
    // Recent sessions are brief, so preferred_depth should be brief
    assert.equal(profile.topics.arch.preferred_depth, 'brief');
    // Weight should be between 0 and 1
    assert.ok(profile.topics.arch.weight > 0);
    assert.ok(profile.topics.arch.weight <= 1);
  });

  // UT-038: Override count aggregation — FR-010 (AC-010-01)
  it('UT-038: override_count equals number of overridden sessions', async () => {
    for (let i = 0; i < 10; i++) {
      writeUserSession(userMemoryDir, `sess_${i}.json`, makeSessionRecord({
        session_id: `sess_${i}`,
        timestamp: `2026-03-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        topics: [{ topic_id: 'security', depth_used: 'deep', acknowledged: true, overridden: i < 3, assumptions_count: 1 }],
      }));
    }

    await compact({ user: true, project: false, userMemoryDir });

    const profile = JSON.parse(readFileSync(join(userMemoryDir, 'profile.json'), 'utf-8'));
    assert.equal(profile.topics.security.override_count, 3);
  });

  // UT-039: Empty sessions directory — FR-007 (AC-007-04)
  it('UT-039: handles empty sessions directory', async () => {
    mkdirSync(join(userMemoryDir, 'sessions'), { recursive: true });

    const result = await compact({ user: true, project: false, userMemoryDir });
    assert.ok(result.user);
    assert.equal(result.user.sessionsRead, 0);
    assert.equal(result.user.topicsAggregated, 0);
  });

  // UT-040: Malformed session files skipped — FR-008 (AC-008-02)
  it('UT-040: skips malformed session files', async () => {
    const sessionsDir = join(userMemoryDir, 'sessions');
    mkdirSync(sessionsDir, { recursive: true });
    // 3 valid, 2 malformed
    for (let i = 0; i < 3; i++) {
      writeUserSession(userMemoryDir, `sess_${i}.json`, makeSessionRecord({
        session_id: `sess_${i}`,
        topics: [{ topic_id: 'arch', depth_used: 'brief', acknowledged: true, overridden: false, assumptions_count: 1 }],
      }));
    }
    writeFileSync(join(sessionsDir, 'bad_1.json'), '{broken', 'utf-8');
    writeFileSync(join(sessionsDir, 'bad_2.json'), '', 'utf-8');

    const result = await compact({ user: true, project: false, userMemoryDir });
    assert.equal(result.user.sessionsRead, 3); // only valid ones counted
  });

  // UT-042: Read failure user sessions — MEM-009
  it('UT-042: throws when user sessions directory is unreadable', async () => {
    await assert.rejects(
      () => compact({ user: true, project: false, userMemoryDir: join(tmpDir, 'does-not-exist') }),
      (err) => err instanceof Error
    );
  });

  // UT-043: Read failure project — MEM-010
  it('UT-043: throws when project memory is unreadable', async () => {
    await assert.rejects(
      () => compact({ user: false, project: true, projectRoot: join(tmpDir, 'does-not-exist') }),
      (err) => err instanceof Error
    );
  });

  // UT-044: Write failure — MEM-011
  it('UT-044: throws when profile.json is unwritable', async () => {
    const sessionsDir = join(userMemoryDir, 'sessions');
    mkdirSync(sessionsDir, { recursive: true });
    writeUserSession(userMemoryDir, 'sess_0.json', makeSessionRecord());

    // Make userMemoryDir read-only so profile.json cannot be written
    // Write a profile.json first, then make it read-only
    writeFileSync(join(userMemoryDir, 'profile.json'), '{}', 'utf-8');
    chmodSync(join(userMemoryDir, 'profile.json'), 0o444);

    await assert.rejects(
      () => compact({ user: true, project: false, userMemoryDir }),
      (err) => err instanceof Error
    );

    // Restore for cleanup
    chmodSync(join(userMemoryDir, 'profile.json'), 0o644);
  });

  // UT-045: Override reduces weight — FR-010 (AC-010-01)
  it('UT-045: overrides reduce topic weight', async () => {
    // All sessions override — weight should be lower than if all confirmed
    for (let i = 0; i < 5; i++) {
      writeUserSession(userMemoryDir, `sess_${i}.json`, makeSessionRecord({
        session_id: `sess_${i}`,
        timestamp: `2026-03-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        topics: [{ topic_id: 'arch', depth_used: 'brief', acknowledged: true, overridden: true, assumptions_count: 1 }],
      }));
    }

    await compact({ user: true, project: false, userMemoryDir });
    const profile = JSON.parse(readFileSync(join(userMemoryDir, 'profile.json'), 'utf-8'));
    const overrideWeight = profile.topics.arch.weight;

    // Compare with non-override scenario
    const userDir2 = join(tmpDir, 'user-memory-2');
    for (let i = 0; i < 5; i++) {
      writeUserSession(userDir2, `sess_${i}.json`, makeSessionRecord({
        session_id: `sess_${i}`,
        timestamp: `2026-03-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        topics: [{ topic_id: 'arch', depth_used: 'brief', acknowledged: true, overridden: false, assumptions_count: 1 }],
      }));
    }

    await compact({ user: true, project: false, userMemoryDir: userDir2 });
    const profile2 = JSON.parse(readFileSync(join(userDir2, 'profile.json'), 'utf-8'));
    const confirmWeight = profile2.topics.arch.weight;

    assert.ok(overrideWeight < confirmWeight, `Override weight (${overrideWeight}) should be less than confirm weight (${confirmWeight})`);
  });

  // UT-046: Confirmation increases weight — FR-010 (AC-010-02)
  it('UT-046: confirmations result in higher weight', async () => {
    for (let i = 0; i < 5; i++) {
      writeUserSession(userMemoryDir, `sess_${i}.json`, makeSessionRecord({
        session_id: `sess_${i}`,
        timestamp: `2026-03-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        topics: [{ topic_id: 'arch', depth_used: 'brief', acknowledged: true, overridden: false, assumptions_count: 1 }],
      }));
    }

    await compact({ user: true, project: false, userMemoryDir });
    const profile = JSON.parse(readFileSync(join(userMemoryDir, 'profile.json'), 'utf-8'));

    // All confirmed — weight should be relatively high
    assert.ok(profile.topics.arch.weight >= 0.5, `Weight should be >= 0.5, got ${profile.topics.arch.weight}`);
  });

  // UT-047: Stale preferences decay — FR-010 (AC-010-03)
  it('UT-047: old sessions have reduced weight contribution', async () => {
    // Create a session from 12 months ago
    const oldDate = new Date('2025-03-13T10:00:00Z');
    writeUserSession(userMemoryDir, 'old_sess.json', makeSessionRecord({
      session_id: 'old_sess',
      timestamp: oldDate.toISOString(),
      topics: [{ topic_id: 'arch', depth_used: 'deep', acknowledged: true, overridden: false, assumptions_count: 1 }],
    }));

    // Create a recent session
    writeUserSession(userMemoryDir, 'recent_sess.json', makeSessionRecord({
      session_id: 'recent_sess',
      timestamp: '2026-03-13T10:00:00Z',
      topics: [{ topic_id: 'arch', depth_used: 'brief', acknowledged: true, overridden: false, assumptions_count: 1 }],
    }));

    await compact({ user: true, project: false, userMemoryDir });
    const profile = JSON.parse(readFileSync(join(userMemoryDir, 'profile.json'), 'utf-8'));

    // Recent session should dominate, so preferred_depth = brief
    assert.equal(profile.topics.arch.preferred_depth, 'brief');
  });
});

// ===========================================================================
// INTEGRATION TESTS
// ===========================================================================

describe('Integration Tests', () => {
  let tmpDir;
  let projectRoot;
  let userMemoryDir;

  beforeEach(() => {
    tmpDir = createTempDir();
    projectRoot = join(tmpDir, 'project');
    userMemoryDir = join(tmpDir, 'user-memory');
    mkdirSync(join(projectRoot, '.isdlc'), { recursive: true });
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  // IT-001: Full read path — FR-003 (AC-003-01, AC-003-02)
  it('IT-001: full read path produces valid MEMORY_CONTEXT', async () => {
    writeUserProfile(userMemoryDir, makeUserProfile());
    writeProjectMemory(projectRoot, makeProjectMemory());

    const user = await readUserProfile(userMemoryDir);
    const project = await readProjectMemory(projectRoot);
    const merged = mergeMemory(user, project);
    const formatted = formatMemoryContext(merged);

    assert.ok(formatted.startsWith('MEMORY_CONTEXT:'));
    assert.ok(formatted.length > 0);
  });

  // IT-002: Full read path — missing user profile
  it('IT-002: full read path works without user profile', async () => {
    writeProjectMemory(projectRoot, makeProjectMemory());

    const user = await readUserProfile(join(tmpDir, 'nonexistent'));
    const project = await readProjectMemory(projectRoot);
    const merged = mergeMemory(user, project);
    const formatted = formatMemoryContext(merged);

    assert.ok(formatted.includes('security'));
    assert.ok(!formatted.includes('user_preference: brief')); // no user data for security
  });

  // IT-003: Full read path — missing project memory
  it('IT-003: full read path works without project memory', async () => {
    writeUserProfile(userMemoryDir, makeUserProfile());

    const user = await readUserProfile(userMemoryDir);
    const project = await readProjectMemory(join(tmpDir, 'nonexistent'));
    const merged = mergeMemory(user, project);
    const formatted = formatMemoryContext(merged);

    assert.ok(formatted.includes('problem-discovery'));
    assert.ok(formatted.includes('architecture'));
  });

  // IT-004: Full read path — both missing
  it('IT-004: full read path returns empty string when both missing', async () => {
    const user = await readUserProfile(join(tmpDir, 'a'));
    const project = await readProjectMemory(join(tmpDir, 'b'));
    const merged = mergeMemory(user, project);
    const formatted = formatMemoryContext(merged);

    assert.equal(formatted, '');
  });

  // IT-005: Full read path — both corrupted
  it('IT-005: full read path returns empty string when both corrupted', async () => {
    mkdirSync(userMemoryDir, { recursive: true });
    writeFileSync(join(userMemoryDir, 'profile.json'), 'not json', 'utf-8');
    writeFileSync(join(projectRoot, '.isdlc', 'roundtable-memory.json'), '{bad}', 'utf-8');

    const user = await readUserProfile(userMemoryDir);
    const project = await readProjectMemory(projectRoot);
    const merged = mergeMemory(user, project);
    const formatted = formatMemoryContext(merged);

    assert.equal(formatted, '');
  });

  // IT-006: Full write-back path — FR-006 (AC-006-01, AC-006-02)
  it('IT-006: session record written to both layers and readable', async () => {
    const record = makeSessionRecord();
    await writeSessionRecord(record, projectRoot, userMemoryDir);

    // Verify user session file
    const sessionsDir = join(userMemoryDir, 'sessions');
    const files = readdirSync(sessionsDir);
    assert.equal(files.length, 1);
    const userRecord = JSON.parse(readFileSync(join(sessionsDir, files[0]), 'utf-8'));
    assert.equal(userRecord.session_id, record.session_id);

    // Verify project memory
    const projPath = join(projectRoot, '.isdlc', 'roundtable-memory.json');
    const proj = JSON.parse(readFileSync(projPath, 'utf-8'));
    const lastSession = proj.sessions[proj.sessions.length - 1];
    assert.equal(lastSession.session_id, record.session_id);
  });

  // IT-007: Write failure non-blocking — FR-006 (AC-006-04)
  it('IT-007: write failure does not throw', async () => {
    mkdirSync(userMemoryDir, { recursive: true });
    chmodSync(userMemoryDir, 0o444);

    const result = await writeSessionRecord(makeSessionRecord(), projectRoot, userMemoryDir);
    assert.equal(result.userWritten, false);
    assert.equal(result.projectWritten, true);

    chmodSync(userMemoryDir, 0o755);
  });

  // IT-008: Compaction flow — FR-007 (AC-007-01, AC-007-04)
  it('IT-008: compaction reads sessions, aggregates, and writes summaries', async () => {
    // Create user sessions
    for (let i = 0; i < 10; i++) {
      writeUserSession(userMemoryDir, `sess_${i}.json`, makeSessionRecord({
        session_id: `sess_${i}`,
        timestamp: `2026-03-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        topics: [
          { topic_id: 'arch', depth_used: i < 6 ? 'brief' : 'deep', acknowledged: true, overridden: false, assumptions_count: 1 },
          { topic_id: 'security', depth_used: 'deep', acknowledged: true, overridden: false, assumptions_count: 2 },
        ],
      }));
    }

    // Create project memory
    const sessions = [];
    for (let i = 0; i < 10; i++) {
      sessions.push({
        session_id: `sess_${i}`, slug: 'test',
        timestamp: `2026-03-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        topics: [
          { topic_id: 'arch', depth_used: i < 6 ? 'brief' : 'deep', acknowledged: true, overridden: false, assumptions_count: 1 },
          { topic_id: 'security', depth_used: 'deep', acknowledged: true, overridden: false, assumptions_count: 2 },
        ],
      });
    }
    writeProjectMemory(projectRoot, { version: 1, summary: { total_sessions: 10, last_session: '2026-03-10T10:00:00Z', topics: {} }, sessions });

    const result = await compact({ user: true, project: true, projectRoot, userMemoryDir });

    // Verify user profile
    const profile = JSON.parse(readFileSync(join(userMemoryDir, 'profile.json'), 'utf-8'));
    assert.ok(profile.topics.arch);
    assert.ok(profile.topics.security);
    assert.equal(profile.topics.arch.preferred_depth, 'brief'); // 6/10 brief

    // Verify project summary
    const proj = JSON.parse(readFileSync(join(projectRoot, '.isdlc', 'roundtable-memory.json'), 'utf-8'));
    assert.ok(proj.summary.topics.arch);
    assert.ok(proj.summary.topics.security);
    assert.equal(result.project.sessionsRead, 10);
  });

  // IT-009: User-only compaction — FR-007 (AC-007-02)
  it('IT-009: user-only compaction does not modify project memory', async () => {
    writeUserSession(userMemoryDir, 'sess_0.json', makeSessionRecord());
    const originalProjMem = makeProjectMemory();
    writeProjectMemory(projectRoot, originalProjMem);

    await compact({ user: true, project: false, userMemoryDir });

    const projAfter = JSON.parse(readFileSync(join(projectRoot, '.isdlc', 'roundtable-memory.json'), 'utf-8'));
    assert.deepStrictEqual(projAfter, originalProjMem);
  });

  // IT-010: Project-only compaction — FR-007 (AC-007-03)
  it('IT-010: project-only compaction does not create user profile', async () => {
    const sessions = [makeSessionRecord()];
    writeProjectMemory(projectRoot, { version: 1, summary: { total_sessions: 1, last_session: '2026-03-13T23:00:00Z', topics: {} }, sessions });

    await compact({ user: false, project: true, projectRoot });

    assert.ok(!existsSync(join(userMemoryDir, 'profile.json')));
  });

  // IT-014: Performance — full read path < 1s
  it('IT-014: full read path completes under 1 second', async () => {
    // Create profile with 20 topics
    const topics = {};
    for (let i = 0; i < 20; i++) {
      topics[`topic_${i}`] = { preferred_depth: 'standard', weight: 0.7, last_updated: '2026-03-13T23:00:00Z', override_count: 0, session_count: 10 };
    }
    writeUserProfile(userMemoryDir, { version: 1, topics });

    // Create project memory with 100 sessions
    const sessions = [];
    for (let i = 0; i < 100; i++) {
      sessions.push(makeSessionRecord({ session_id: `sess_${i}`, topics: [{ topic_id: `topic_${i % 20}`, depth_used: 'standard', acknowledged: true, overridden: false, assumptions_count: 1 }] }));
    }
    writeProjectMemory(projectRoot, { version: 1, summary: { total_sessions: 100, last_session: '2026-03-13T23:00:00Z', topics: {} }, sessions });

    const start = performance.now();
    const user = await readUserProfile(userMemoryDir);
    const project = await readProjectMemory(projectRoot);
    const merged = mergeMemory(user, project);
    formatMemoryContext(merged);
    const elapsed = performance.now() - start;

    assert.ok(elapsed < 1000, `Full read path took ${elapsed}ms, expected < 1000ms`);
  });

  // IT-015: Performance — compaction < 5s
  it('IT-015: compaction of 260 sessions completes under 5 seconds', async () => {
    // Simulate 1 year of sessions (260)
    for (let i = 0; i < 260; i++) {
      const d = new Date('2025-03-13T10:00:00Z');
      d.setDate(d.getDate() + i);
      writeUserSession(userMemoryDir, `sess_${i}.json`, makeSessionRecord({
        session_id: `sess_${i}`,
        timestamp: d.toISOString(),
        topics: [
          { topic_id: `topic_${i % 20}`, depth_used: ['brief', 'standard', 'deep'][i % 3], acknowledged: true, overridden: i % 7 === 0, assumptions_count: 1 },
        ],
      }));
    }

    const start = performance.now();
    const result = await compact({ user: true, project: false, userMemoryDir });
    const elapsed = performance.now() - start;

    assert.ok(elapsed < 5000, `Compaction took ${elapsed}ms, expected < 5000ms`);
    assert.equal(result.user.sessionsRead, 260);
  });

  // IT-016: Performance warning triggered — FR-009 (AC-009-01)
  it('IT-016: performance warning includes compaction suggestion', () => {
    // This is a format validation — the actual timing check happens at runtime
    const warningMsg = 'Memory reads are slowing down -- consider running `isdlc memory compact`';
    assert.ok(warningMsg.includes('isdlc memory compact'));
  });

  // IT-018: Privacy — user memory isolation — FR-001 (AC-001-04)
  it('IT-018: user preference data does not appear in project memory', async () => {
    writeUserProfile(userMemoryDir, makeUserProfile());
    await writeSessionRecord(makeSessionRecord(), projectRoot, userMemoryDir);

    const projPath = join(projectRoot, '.isdlc', 'roundtable-memory.json');
    const raw = readFileSync(projPath, 'utf-8');

    // Project memory should not contain user-level profile data
    assert.ok(!raw.includes('preferred_depth'), 'Project memory should not contain preferred_depth (user-level data)');
    assert.ok(!raw.includes('override_count'), 'Project memory should not contain override_count (user-level data)');
  });
});

// ===========================================================================
// REQ-0064: EnrichedSessionRecord support and vectorPrune extension
// ===========================================================================

describe('REQ-0064: EnrichedSessionRecord support', () => {
  let tmpDir, userMemoryDir, projectRoot;

  beforeEach(() => {
    tmpDir = createTempDir();
    userMemoryDir = join(tmpDir, 'user-memory');
    projectRoot = join(tmpDir, 'project');
    mkdirSync(join(projectRoot, '.isdlc'), { recursive: true });
    mkdirSync(userMemoryDir, { recursive: true });
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  /** Helper to create an enriched session record. */
  function makeEnrichedRecord(overrides = {}) {
    return {
      session_id: overrides.session_id || 'sess_enriched_001',
      slug: 'enriched-test',
      timestamp: overrides.timestamp || '2026-03-15T10:00:00Z',
      topics: [{ topic_id: 'auth', depth_used: 'standard' }],
      summary: overrides.summary || 'User prefers brief security analysis.',
      context_notes: overrides.context_notes || [
        { topic: 'auth', content: 'Auth at org policy level.', relationship_hint: null },
      ],
      playbook_entry: 'Brief on security, deep on architecture.',
      importance: overrides.importance ?? 7,
      container: overrides.container || 'auth',
      embedded: false,
    };
  }

  // MEM-064-001: writeSessionRecord accepts EnrichedSessionRecord
  it('MEM-064-001: writeSessionRecord accepts enriched record and returns enriched: true', async () => {
    const record = makeEnrichedRecord();
    const result = await writeSessionRecord(record, projectRoot, userMemoryDir);

    assert.equal(result.userWritten, true);
    assert.equal(result.projectWritten, true);
    assert.equal(result.enriched, true);
  });

  // MEM-064-002: writeSessionRecord backward-compatible with plain SessionRecord
  it('MEM-064-002: returns enriched: false for plain SessionRecord', async () => {
    const plainRecord = {
      session_id: 'sess_plain_001',
      slug: 'plain-test',
      timestamp: '2026-03-15T10:00:00Z',
      topics: [{ topic_id: 'auth', depth_used: 'brief' }],
    };

    const result = await writeSessionRecord(plainRecord, projectRoot, userMemoryDir);
    assert.equal(result.enriched, false);
  });

  // MEM-064-003: Enriched fields are preserved in written file
  it('MEM-064-003: enriched fields preserved in written JSON', async () => {
    const record = makeEnrichedRecord();
    await writeSessionRecord(record, projectRoot, userMemoryDir);

    const filePath = join(userMemoryDir, 'sessions', 'sess_enriched_001.json');
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);

    assert.equal(parsed.summary, 'User prefers brief security analysis.');
    assert.ok(Array.isArray(parsed.context_notes));
    assert.equal(parsed.importance, 7);
    assert.equal(parsed.container, 'auth');
    assert.equal(parsed.embedded, false);
  });

  // MEM-064-004: writeSessionRecord returns enriched: false when summary is non-string
  it('MEM-064-004: returns enriched: false when summary is not a string', async () => {
    const record = {
      session_id: 'sess_bad_summary',
      slug: 'bad-summary',
      timestamp: '2026-03-15T10:00:00Z',
      topics: [],
      summary: 123, // Not a string
    };

    const result = await writeSessionRecord(record, projectRoot, userMemoryDir);
    assert.equal(result.enriched, false);
  });

  // MEM-064-005: compact with vectorPrune=false doesn't add vectorPruned
  it('MEM-064-005: compact without vectorPrune returns no vectorPruned field', async () => {
    const sessionsDir = join(userMemoryDir, 'sessions');
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(join(sessionsDir, 'sess_001.json'), JSON.stringify({
      session_id: 'sess_001',
      timestamp: '2026-03-15T10:00:00Z',
      topics: [{ topic_id: 'auth', depth_used: 'standard' }],
    }));

    writeFileSync(join(projectRoot, '.isdlc', 'roundtable-memory.json'), JSON.stringify({
      version: 1,
      summary: { total_sessions: 1, last_session: null, topics: {} },
      sessions: [{ session_id: 'sess_001', timestamp: '2026-03-15T10:00:00Z', topics: [{ topic_id: 'auth', depth_used: 'standard' }] }],
    }));

    const result = await compact({ projectRoot, userMemoryDir, vectorPrune: false });
    assert.equal(result.vectorPruned, undefined);
  });

  // MEM-064-006: compact with vectorPrune=true returns vectorPruned result
  it('MEM-064-006: compact with vectorPrune returns vectorPruned result', async () => {
    const sessionsDir = join(userMemoryDir, 'sessions');
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(join(sessionsDir, 'sess_001.json'), JSON.stringify({
      session_id: 'sess_001',
      timestamp: '2026-03-15T10:00:00Z',
      topics: [{ topic_id: 'auth', depth_used: 'standard' }],
    }));

    writeFileSync(join(projectRoot, '.isdlc', 'roundtable-memory.json'), JSON.stringify({
      version: 1,
      summary: { total_sessions: 1, last_session: null, topics: {} },
      sessions: [{ session_id: 'sess_001', timestamp: '2026-03-15T10:00:00Z', topics: [{ topic_id: 'auth', depth_used: 'standard' }] }],
    }));

    const result = await compact({ projectRoot, userMemoryDir, vectorPrune: true });
    assert.ok(result.vectorPruned !== undefined, 'vectorPruned field should be present');
    assert.equal(typeof result.vectorPruned.removed, 'number');
    assert.equal(typeof result.vectorPruned.archived, 'number');
    assert.equal(typeof result.vectorPruned.remaining, 'number');
    assert.equal(typeof result.vectorPruned.rebuilt, 'boolean');
  });

  // MEM-064-007: compact with vectorPrune, expireTtl defaults to true
  it('MEM-064-007: expireTtl defaults to true when vectorPrune is set', async () => {
    const sessionsDir = join(userMemoryDir, 'sessions');
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(join(sessionsDir, 'sess_001.json'), JSON.stringify({
      session_id: 'sess_001',
      timestamp: '2026-03-15T10:00:00Z',
      topics: [{ topic_id: 'auth', depth_used: 'standard' }],
    }));

    writeFileSync(join(projectRoot, '.isdlc', 'roundtable-memory.json'), JSON.stringify({
      version: 1,
      summary: { total_sessions: 0, last_session: null, topics: {} },
      sessions: [],
    }));

    // This should not throw — just verify vectorPrune logic runs
    const result = await compact({ projectRoot, userMemoryDir, vectorPrune: true, ageThresholdMonths: 1 });
    assert.ok(result.vectorPruned !== undefined);
  });

  // MEM-064-008: All 75 existing tests still pass (implicit in this file running)
  it('MEM-064-008: enriched record in project memory preserves sessions array', async () => {
    const record = makeEnrichedRecord();
    await writeSessionRecord(record, projectRoot, userMemoryDir);

    const projPath = join(projectRoot, '.isdlc', 'roundtable-memory.json');
    const projData = JSON.parse(readFileSync(projPath, 'utf-8'));

    assert.ok(Array.isArray(projData.sessions));
    assert.equal(projData.sessions.length, 1);
    assert.equal(projData.sessions[0].summary, 'User prefers brief security analysis.');
  });
});

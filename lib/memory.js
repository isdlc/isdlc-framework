/**
 * iSDLC Roundtable Memory Layer (REQ-0063)
 *
 * Persistent memory for roundtable analysis sessions. Provides user-level
 * preferences (~/.isdlc/user-memory/) and project-level topic history
 * (.isdlc/roundtable-memory.json) so that each roundtable session starts
 * from a baseline of learned behavior rather than a blank slate.
 *
 * Exports 6 functions:
 *   - readUserProfile(userMemoryDir?)       → Promise<UserProfile|null>
 *   - readProjectMemory(projectRoot)        → Promise<ProjectMemory|null>
 *   - mergeMemory(userProfile, projectMemory) → MemoryContext
 *   - formatMemoryContext(memoryContext)     → string
 *   - writeSessionRecord(record, projectRoot, userMemoryDir?) → Promise<WriteResult>
 *   - compact(options)                      → Promise<CompactionResult>
 *
 * All read functions are fail-open: missing or corrupted files return null
 * rather than throwing. Write failures in writeSessionRecord are caught per
 * layer and reported via the return value. compact() throws on unrecoverable
 * errors (user-facing CLI command).
 *
 * REQ-0063: FR-001 through FR-010
 * Article X: Fail-Safe Defaults — all read operations fail-open
 * Article III: Security by Design — path validation, lenient schema parsing
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default user memory directory under the home directory. */
const DEFAULT_USER_MEMORY_DIR = path.join(os.homedir(), '.isdlc', 'user-memory');

/** Valid depth levels for topic preferences. */
const VALID_DEPTHS = ['brief', 'standard', 'deep'];

/** Conflict detection threshold — weak preferences (weight < 0.5) don't trigger conflicts. */
const CONFLICT_WEIGHT_THRESHOLD = 0.5;

/** Age decay factor per month — 0.95^months_old. */
const AGE_DECAY_PER_MONTH = 0.95;

/** Override weight penalty — each override reduces effective weight contribution. */
const OVERRIDE_PENALTY = 0.1;

// ---------------------------------------------------------------------------
// Schema Defaults & Validation Helpers
// ---------------------------------------------------------------------------

/**
 * Apply defaults for a topic preference entry.
 * FR-008 (AC-008-03): Partial data is accepted with defaults.
 *
 * @param {object} entry - Raw topic entry from profile.json
 * @returns {object|null} Normalized entry, or null if preferred_depth is missing
 */
function normalizeTopicPreference(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (!entry.preferred_depth || !VALID_DEPTHS.includes(entry.preferred_depth)) return null;

  return {
    preferred_depth: entry.preferred_depth,
    weight: typeof entry.weight === 'number' ? entry.weight : 0.5,
    last_updated: entry.last_updated || new Date(0).toISOString(),
    override_count: typeof entry.override_count === 'number' ? entry.override_count : 0,
    session_count: typeof entry.session_count === 'number' ? entry.session_count : 0,
  };
}

/**
 * Validate and normalize a UserProfile from parsed JSON.
 * @param {object} raw - Parsed JSON object
 * @returns {object|null} Normalized UserProfile, or null if invalid
 */
function validateUserProfile(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const profile = {
    version: typeof raw.version === 'number' ? raw.version : 1,
    last_compacted: raw.last_compacted || null,
    topics: {},
  };

  const rawTopics = raw.topics && typeof raw.topics === 'object' ? raw.topics : {};
  for (const [topicId, entry] of Object.entries(rawTopics)) {
    const normalized = normalizeTopicPreference(entry);
    if (normalized) {
      profile.topics[topicId] = normalized;
    }
    // Invalid entries are silently skipped (FR-008 AC-008-03)
  }

  return profile;
}

/**
 * Validate and normalize a ProjectMemory from parsed JSON.
 * @param {object} raw - Parsed JSON object
 * @returns {object|null} Normalized ProjectMemory, or null if invalid
 */
function validateProjectMemory(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const summary = raw.summary && typeof raw.summary === 'object'
    ? {
        total_sessions: raw.summary.total_sessions || 0,
        last_session: raw.summary.last_session || null,
        topics: raw.summary.topics && typeof raw.summary.topics === 'object' ? raw.summary.topics : {},
      }
    : { total_sessions: 0, last_session: null, topics: {} };

  const rawSessions = Array.isArray(raw.sessions) ? raw.sessions : [];
  // Filter out sessions missing topics array (UT-056)
  const sessions = rawSessions.filter((s) => s && Array.isArray(s.topics));

  return {
    version: typeof raw.version === 'number' ? raw.version : 1,
    summary,
    sessions,
  };
}

// ---------------------------------------------------------------------------
// Exported Functions
// ---------------------------------------------------------------------------

/**
 * Read user memory profile. Returns null on missing/corrupted file.
 * FR-001 (AC-001-01), FR-008 (AC-008-01..03)
 * MEM-001 (file not found), MEM-003 (malformed JSON), MEM-005 (partial schema)
 *
 * @param {string} [userMemoryDir] - Override for testing (default: ~/.isdlc/user-memory)
 * @returns {Promise<object|null>} Parsed UserProfile or null
 */
export async function readUserProfile(userMemoryDir) {
  const dir = userMemoryDir || DEFAULT_USER_MEMORY_DIR;
  const filePath = path.join(dir, 'profile.json');

  try {
    const raw = await readFile(filePath, 'utf-8');
    if (!raw || raw.trim().length === 0) return null; // Empty file (UT-005)

    const parsed = JSON.parse(raw);
    return validateUserProfile(parsed);
  } catch {
    // MEM-001 (ENOENT), MEM-003 (SyntaxError), any other error
    return null;
  }
}

/**
 * Read project memory. Returns null on missing/corrupted file.
 * FR-002 (AC-002-01..04), FR-008 (AC-008-01..03)
 * MEM-002 (file not found), MEM-004 (malformed JSON)
 *
 * @param {string} projectRoot - Project root containing .isdlc/
 * @returns {Promise<object|null>} Parsed ProjectMemory or null
 */
export async function readProjectMemory(projectRoot) {
  const filePath = path.join(projectRoot, '.isdlc', 'roundtable-memory.json');

  try {
    const raw = await readFile(filePath, 'utf-8');
    if (!raw || raw.trim().length === 0) return null;

    const parsed = JSON.parse(raw);
    return validateProjectMemory(parsed);
  } catch {
    // MEM-002 (ENOENT), MEM-004 (SyntaxError), any other error
    return null;
  }
}

/**
 * Merge user and project memory into a unified MemoryContext.
 * Detects per-topic conflicts between layers.
 * FR-003 (AC-003-02), FR-005 (AC-005-01..03)
 *
 * @param {object|null} userProfile - Parsed UserProfile
 * @param {object|null} projectMemory - Parsed ProjectMemory
 * @returns {object} MemoryContext with per-topic entries
 */
export function mergeMemory(userProfile, projectMemory) {
  const topics = {};

  // Collect all topic IDs from both sources
  const allTopicIds = new Set();

  if (userProfile && userProfile.topics) {
    for (const id of Object.keys(userProfile.topics)) {
      allTopicIds.add(id);
    }
  }

  if (projectMemory && projectMemory.summary && projectMemory.summary.topics) {
    for (const id of Object.keys(projectMemory.summary.topics)) {
      allTopicIds.add(id);
    }
  }

  // Build merged entries for each topic
  for (const topicId of allTopicIds) {
    const userTopic = userProfile?.topics?.[topicId] || null;
    const projTopic = projectMemory?.summary?.topics?.[topicId] || null;

    const userPref = userTopic
      ? { depth: userTopic.preferred_depth, weight: userTopic.weight }
      : null;

    const projHist = projTopic
      ? { avg_depth: projTopic.avg_depth, sessions: projectMemory.summary.total_sessions }
      : null;

    // Conflict detection (interface-spec.md Section 4.2):
    // - Both must exist
    // - Depths must differ
    // - User weight must be >= 0.5
    let conflict = false;
    if (userPref && projHist && userPref.depth !== projHist.avg_depth && userPref.weight >= CONFLICT_WEIGHT_THRESHOLD) {
      conflict = true;
    }

    topics[topicId] = {
      user_preference: userPref,
      project_history: projHist,
      conflict,
    };
  }

  return { topics };
}

/**
 * Format MemoryContext for prompt injection.
 * Follows PERSONA_CONTEXT/TOPIC_CONTEXT inlining pattern.
 * FR-003 (AC-003-03, AC-003-04)
 *
 * @param {object} memoryContext - Merged MemoryContext
 * @returns {string} Formatted MEMORY_CONTEXT block, or empty string if no topics
 */
export function formatMemoryContext(memoryContext) {
  if (!memoryContext || !memoryContext.topics || Object.keys(memoryContext.topics).length === 0) {
    return '';
  }

  const lines = ['MEMORY_CONTEXT:'];

  for (const [topicId, entry] of Object.entries(memoryContext.topics)) {
    lines.push(`--- topic: ${topicId} ---`);

    if (entry.user_preference) {
      lines.push(`user_preference: ${entry.user_preference.depth} (weight: ${entry.user_preference.weight})`);
    } else {
      lines.push('user_preference: none');
    }

    if (entry.project_history) {
      lines.push(`project_history: ${entry.project_history.avg_depth} (${entry.project_history.sessions} sessions)`);
    } else {
      lines.push('project_history: none');
    }

    lines.push(`conflict: ${entry.conflict}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Write a session record to both memory layers.
 * Fail-safe: catches all errors per layer independently; never throws.
 * FR-006 (AC-006-01..04), FR-008 (AC-008-05)
 * MEM-006 (user write failure), MEM-007 (project write failure), MEM-008 (dir creation failure)
 *
 * REQ-0064: Accepts EnrichedSessionRecord (backward-compatible superset of SessionRecord).
 * Returns enriched: boolean indicating presence of NL content fields.
 *
 * @param {object} record - SessionRecord or EnrichedSessionRecord
 * @param {string} projectRoot - Project root containing .isdlc/
 * @param {string} [userMemoryDir] - Override for testing
 * @returns {Promise<{userWritten: boolean, projectWritten: boolean, enriched: boolean}>}
 */
export async function writeSessionRecord(record, projectRoot, userMemoryDir) {
  const dir = userMemoryDir || DEFAULT_USER_MEMORY_DIR;
  let userWritten = false;
  let projectWritten = false;

  // REQ-0064: Detect enriched record by presence of summary field
  const enriched = !!(record && record.summary && typeof record.summary === 'string');

  // --- User session write (append-only) ---
  try {
    const sessionsDir = path.join(dir, 'sessions');
    await mkdir(sessionsDir, { recursive: true });

    // Generate a unique filename from the session_id
    const filename = `${record.session_id}.json`;
    const filePath = path.join(sessionsDir, filename);

    await writeFile(filePath, JSON.stringify(record, null, 2), 'utf-8');
    userWritten = true;
  } catch {
    // MEM-006 or MEM-008 — log internally but don't throw
    userWritten = false;
  }

  // --- Project memory write (append to sessions array) ---
  try {
    const projFilePath = path.join(projectRoot, '.isdlc', 'roundtable-memory.json');
    let projMemory;

    try {
      const raw = await readFile(projFilePath, 'utf-8');
      projMemory = JSON.parse(raw);
    } catch {
      // File doesn't exist or is corrupt — create fresh
      projMemory = {
        version: 1,
        summary: { total_sessions: 0, last_session: null, topics: {} },
        sessions: [],
      };
    }

    // Ensure sessions array exists
    if (!Array.isArray(projMemory.sessions)) {
      projMemory.sessions = [];
    }

    projMemory.sessions.push(record);
    projMemory.summary = projMemory.summary || { total_sessions: 0, last_session: null, topics: {} };
    projMemory.summary.total_sessions = projMemory.sessions.length;
    projMemory.summary.last_session = record.timestamp;

    // Write with sorted keys for deterministic output (AC-002-04)
    await writeFile(projFilePath, JSON.stringify(projMemory, null, 2), 'utf-8');
    projectWritten = true;
  } catch {
    // MEM-007 — log internally but don't throw
    projectWritten = false;
  }

  return { userWritten, projectWritten, enriched };
}

/**
 * Compact raw session logs into summaries.
 * Throws on unrecoverable errors (user-facing CLI command).
 * FR-007 (AC-007-01..05), FR-010 (AC-010-01..03)
 * MEM-009 (user read failure), MEM-010 (project read failure), MEM-011 (write failure)
 *
 * @param {object} options
 * @param {boolean} [options.user=true] - Compact user memory
 * @param {boolean} [options.project=true] - Compact project memory
 * @param {string} [options.projectRoot] - Project root (required if project=true)
 * @param {string} [options.userMemoryDir] - Override for testing
 * @returns {Promise<object>} CompactionResult
 */
export async function compact(options = {}) {
  const {
    user = true,
    project = true,
    projectRoot,
    userMemoryDir,
    vectorPrune = false,
    ageThresholdMonths = 6,
    dedupeThreshold = 0.95,
    expireTtl,
  } = options;

  // REQ-0064: expireTtl defaults to true when vectorPrune is set
  const shouldExpireTtl = expireTtl !== undefined ? expireTtl : vectorPrune;

  const result = {};

  // --- User compaction ---
  if (user) {
    const dir = userMemoryDir || DEFAULT_USER_MEMORY_DIR;
    const sessionsDir = path.join(dir, 'sessions');

    let sessionFiles;
    try {
      sessionFiles = await readdir(sessionsDir);
    } catch (err) {
      throw new Error(`User compaction failed: cannot read sessions directory: ${err.message}`);
    }

    // Read and parse all session files, skipping malformed ones
    const sessions = [];
    for (const file of sessionFiles) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await readFile(path.join(sessionsDir, file), 'utf-8');
        if (!raw || raw.trim().length === 0) continue;
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.topics)) {
          sessions.push(parsed);
        }
      } catch {
        // Skip malformed files (UT-040)
      }
    }

    // Aggregate per topic
    const topicAgg = aggregateTopics(sessions);

    // Write profile.json
    const profile = {
      version: 1,
      last_compacted: new Date().toISOString(),
      topics: topicAgg,
    };

    try {
      await writeFile(path.join(dir, 'profile.json'), JSON.stringify(profile, null, 2), 'utf-8');
    } catch (err) {
      throw new Error(`User compaction failed: cannot write profile.json: ${err.message}`);
    }

    result.user = {
      sessionsRead: sessions.length,
      topicsAggregated: Object.keys(topicAgg).length,
      profileWritten: true,
    };
  }

  // --- Project compaction ---
  if (project) {
    const projFilePath = path.join(projectRoot, '.isdlc', 'roundtable-memory.json');

    let projMemory;
    try {
      const raw = await readFile(projFilePath, 'utf-8');
      projMemory = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Project compaction failed: cannot read roundtable-memory.json: ${err.message}`);
    }

    const sessions = Array.isArray(projMemory.sessions) ? projMemory.sessions : [];
    const validSessions = sessions.filter((s) => s && Array.isArray(s.topics));

    // Aggregate per topic for project
    const projTopicAgg = aggregateProjectTopics(validSessions);

    // Update summary section while preserving sessions array
    projMemory.summary = {
      total_sessions: validSessions.length,
      last_session: validSessions.length > 0 ? validSessions[validSessions.length - 1].timestamp : null,
      topics: projTopicAgg,
    };

    try {
      await writeFile(projFilePath, JSON.stringify(projMemory, null, 2), 'utf-8');
    } catch (err) {
      throw new Error(`Project compaction failed: cannot write roundtable-memory.json: ${err.message}`);
    }

    result.project = {
      sessionsRead: validSessions.length,
      topicsAggregated: Object.keys(projTopicAgg).length,
      memoryWritten: true,
    };
  }

  // --- REQ-0064: Vector index pruning ---
  if (vectorPrune) {
    const vectorResult = { removed: 0, archived: 0, remaining: 0, rebuilt: false };

    try {
      // Dynamic import to avoid hard dependency when vectorPrune is not used
      const { createUserStore, createProjectStore } = await import('./memory-store-adapter.js');

      // Prune user store
      if (user) {
        const dir = userMemoryDir || DEFAULT_USER_MEMORY_DIR;
        const dbPath = path.join(dir, 'memory.db');
        if (existsSync(dbPath)) {
          const userStore = createUserStore(dbPath);
          try {
            // TTL expiry: archive memories past their TTL
            if (shouldExpireTtl) {
              const rows = userStore._db.prepare(
                "SELECT chunk_id FROM memories WHERE ttl IS NOT NULL AND ttl < datetime('now') AND archived = 0"
              ).all();
              for (const row of rows) {
                await userStore.archive(row.chunk_id);
                vectorResult.archived++;
              }
            }

            // Age-based pruning
            const ageDate = new Date();
            ageDate.setMonth(ageDate.getMonth() - ageThresholdMonths);
            const removeResult = await userStore.remove({ olderThan: ageDate });
            vectorResult.removed += removeResult.removed;

            vectorResult.remaining = await userStore.getCount();
          } finally {
            userStore.close();
          }
        }
      }

      // Prune project store
      if (project && projectRoot) {
        const embPath = path.join(projectRoot, 'docs', '.embeddings', 'roundtable-memory.emb');
        if (existsSync(embPath)) {
          const projStore = createProjectStore(embPath);
          try {
            // TTL expiry for project store
            if (shouldExpireTtl) {
              const projEntries = projStore._getEntries();
              for (const entry of projEntries) {
                if (entry.ttl && new Date(entry.ttl) < new Date() && !entry.archived) {
                  await projStore.archive(entry.chunkId);
                  vectorResult.archived++;
                }
              }
            }

            // Age-based pruning
            const ageDate = new Date();
            ageDate.setMonth(ageDate.getMonth() - ageThresholdMonths);
            const removeResult = await projStore.remove({ olderThan: ageDate });
            vectorResult.removed += removeResult.removed;

            vectorResult.remaining += await projStore.getCount();
          } finally {
            projStore.close();
          }
        }
      }

      vectorResult.rebuilt = vectorResult.removed > 0 || vectorResult.archived > 0;
    } catch {
      // Fail-open: vector pruning failure doesn't block flat JSON compaction
    }

    result.vectorPruned = vectorResult;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Aggregate session topics into user profile format.
 * Implements the compaction algorithm from module-design.md Section 2.4.
 *
 * @param {object[]} sessions - Array of parsed session records
 * @returns {object} Map of topic_id → TopicPreference
 */
function aggregateTopics(sessions) {
  const topicData = {};

  // Collect all topic outcomes per topic_id
  for (const session of sessions) {
    const sessionTime = session.timestamp ? new Date(session.timestamp) : new Date();
    for (const topic of session.topics) {
      if (!topic.topic_id) continue;
      if (!topicData[topic.topic_id]) {
        topicData[topic.topic_id] = [];
      }
      topicData[topic.topic_id].push({
        depth_used: topic.depth_used,
        overridden: !!topic.overridden,
        timestamp: sessionTime,
      });
    }
  }

  // Aggregate each topic
  const now = new Date();
  const result = {};

  for (const [topicId, entries] of Object.entries(topicData)) {
    // Count depth levels with age-weighted scoring
    const depthScores = { brief: 0, standard: 0, deep: 0 };
    let totalWeight = 0;
    let overrideCount = 0;

    for (const entry of entries) {
      const monthsOld = Math.max(0, (now - entry.timestamp) / (30.44 * 24 * 60 * 60 * 1000));
      const ageFactor = Math.pow(AGE_DECAY_PER_MONTH, monthsOld);
      const entryWeight = ageFactor * (entry.overridden ? (1 - OVERRIDE_PENALTY) : 1);

      if (VALID_DEPTHS.includes(entry.depth_used)) {
        depthScores[entry.depth_used] += entryWeight;
      }
      totalWeight += entryWeight;

      if (entry.overridden) {
        overrideCount++;
      }
    }

    // preferred_depth = depth with highest weighted score
    let preferredDepth = 'standard';
    let maxScore = 0;
    for (const [depth, score] of Object.entries(depthScores)) {
      if (score > maxScore) {
        maxScore = score;
        preferredDepth = depth;
      }
    }

    // Weight = (weighted count at preferred / total weighted count)
    // Penalize if many overrides
    const rawWeight = totalWeight > 0 ? maxScore / totalWeight : 0.5;
    const overridePenalty = entries.length > 0 ? (overrideCount / entries.length) * OVERRIDE_PENALTY : 0;
    const weight = Math.max(0, Math.min(1, rawWeight - overridePenalty));

    // Find most recent entry for last_updated
    const mostRecent = entries.reduce((a, b) => (a.timestamp > b.timestamp ? a : b), entries[0]);

    result[topicId] = {
      preferred_depth: preferredDepth,
      weight: Math.round(weight * 1000) / 1000, // 3 decimal places
      last_updated: mostRecent.timestamp.toISOString(),
      override_count: overrideCount,
      session_count: entries.length,
    };
  }

  return result;
}

/**
 * Aggregate session topics into project summary format.
 *
 * @param {object[]} sessions - Array of valid session records
 * @returns {object} Map of topic_id → ProjectTopicSummary
 */
function aggregateProjectTopics(sessions) {
  const topicData = {};

  for (const session of sessions) {
    for (const topic of session.topics) {
      if (!topic.topic_id) continue;
      if (!topicData[topic.topic_id]) {
        topicData[topic.topic_id] = {
          sessions_brief: 0,
          sessions_standard: 0,
          sessions_deep: 0,
          assumptions_total: 0,
          assumptions_amended: 0,
        };
      }

      const data = topicData[topic.topic_id];
      if (topic.depth_used === 'brief') data.sessions_brief++;
      else if (topic.depth_used === 'standard') data.sessions_standard++;
      else if (topic.depth_used === 'deep') data.sessions_deep++;

      data.assumptions_total += topic.assumptions_count || 0;
      // Track overrides as "amended" for project purposes
      if (topic.overridden) data.assumptions_amended++;
    }
  }

  // Determine avg_depth for each topic
  const result = {};
  for (const [topicId, data] of Object.entries(topicData)) {
    const counts = { brief: data.sessions_brief, standard: data.sessions_standard, deep: data.sessions_deep };
    let avgDepth = 'standard';
    let maxCount = 0;
    for (const [depth, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        avgDepth = depth;
      }
    }

    result[topicId] = {
      avg_depth: avgDepth,
      sessions_brief: data.sessions_brief,
      sessions_standard: data.sessions_standard,
      sessions_deep: data.sessions_deep,
      assumptions_total: data.assumptions_total,
      assumptions_amended: data.assumptions_amended,
    };
  }

  return result;
}

# Test Data Plan: Roundtable Memory Layer (REQ-0063)

**Phase**: 05 - Test Strategy
**Requirement**: REQ-0063
**Created**: 2026-03-14

---

## 1. Test Data Overview

All test data is generated programmatically in test fixtures. No external data files or databases are required. Tests use temporary directories created via `createTempDir()` from `lib/utils/test-helpers.js`.

---

## 2. Fixture Factories

### 2.1 User Profile Factory

```javascript
function createUserProfile(overrides = {}) {
  return {
    version: 1,
    last_compacted: '2026-03-13T23:00:00Z',
    topics: {
      'problem-discovery': {
        preferred_depth: 'standard',
        weight: 0.8,
        last_updated: '2026-03-13T23:00:00Z',
        override_count: 2,
        session_count: 15
      },
      'architecture': {
        preferred_depth: 'brief',
        weight: 0.9,
        last_updated: '2026-03-12T10:00:00Z',
        override_count: 1,
        session_count: 15
      }
    },
    ...overrides
  };
}
```

### 2.2 Project Memory Factory

```javascript
function createProjectMemory(overrides = {}) {
  return {
    version: 1,
    summary: {
      total_sessions: 5,
      last_session: '2026-03-13T23:00:00Z',
      topics: {
        'security': {
          avg_depth: 'deep',
          sessions_deep: 4,
          sessions_standard: 0,
          sessions_brief: 1,
          assumptions_total: 12,
          assumptions_amended: 3
        }
      }
    },
    sessions: [],
    ...overrides
  };
}
```

### 2.3 Session Record Factory

```javascript
function createSessionRecord(overrides = {}) {
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
        assumptions_count: 2
      }
    ],
    ...overrides
  };
}
```

### 2.4 Memory Context Factory

```javascript
function createMemoryContext(overrides = {}) {
  return {
    topics: {
      'problem-discovery': {
        user_preference: { depth: 'standard', weight: 0.8 },
        project_history: { avg_depth: 'standard', sessions: 5 },
        conflict: false
      },
      'security': {
        user_preference: { depth: 'brief', weight: 0.7 },
        project_history: { avg_depth: 'deep', sessions: 5 },
        conflict: true
      }
    },
    ...overrides
  };
}
```

---

## Boundary Values

### 3.1 Weight Boundaries

| Value | Description | Expected Behavior |
|-------|-------------|-------------------|
| `0.0` | Minimum weight | Preference applied but very weak; no conflict triggered |
| `0.49` | Just below conflict threshold | Conflict NOT flagged even if depths differ |
| `0.5` | Exact conflict threshold | Conflict IS flagged if depths differ |
| `0.51` | Just above conflict threshold | Conflict IS flagged if depths differ |
| `1.0` | Maximum weight | Strongest possible preference |
| `-0.1` | Below minimum (invalid) | Clamped to 0.0 or entry skipped |
| `1.1` | Above maximum (invalid) | Clamped to 1.0 or entry skipped |

### 3.2 Session Count Boundaries

| Value | Description | Expected Behavior |
|-------|-------------|-------------------|
| `0` | No sessions | Empty compaction result; valid profile with empty topics |
| `1` | Single session | Compaction produces profile with single-session data |
| `260` | One year of daily usage | Compaction completes within performance threshold |
| `1000` | Heavy usage over 4 years | Compaction completes; no memory issues |

### 3.3 Topic Count Boundaries

| Value | Description | Expected Behavior |
|-------|-------------|-------------------|
| `0` | No topics in profile/memory | Empty MEMORY_CONTEXT; omitted from prompt |
| `1` | Single topic | Valid MEMORY_CONTEXT with one topic entry |
| `6` | Standard analysis (all default topics) | Valid processing; typical usage |
| `20` | Many custom topics | All topics processed; no truncation |

### 3.4 Depth Value Boundaries

| Value | Description | Expected Behavior |
|-------|-------------|-------------------|
| `'brief'` | Valid depth level | Accepted |
| `'standard'` | Valid depth level | Accepted |
| `'deep'` | Valid depth level | Accepted |
| `'unknown'` | Invalid depth level | Entry skipped or treated as 'standard' default |
| `''` | Empty string | Entry skipped |
| `null` | Null value | Entry skipped |

### 3.5 Timestamp Boundaries

| Value | Description | Expected Behavior |
|-------|-------------|-------------------|
| Valid ISO 8601 | `'2026-03-13T23:00:00Z'` | Parsed correctly |
| Missing timezone | `'2026-03-13T23:00:00'` | Accepted (assume UTC) |
| Epoch | `'1970-01-01T00:00:00Z'` | Accepted as default for missing timestamps |
| Future date | `'2030-01-01T00:00:00Z'` | Accepted (no future-date validation) |
| Invalid string | `'not-a-date'` | Entry skipped or default applied |

---

## Invalid Inputs

### 4.1 Malformed JSON Variants

```javascript
const malformedJsonVariants = [
  '',                              // Empty string
  '{',                             // Incomplete object
  '{"topics":}',                   // Invalid value
  'null',                          // JSON null (valid JSON, invalid profile)
  '[]',                            // Array instead of object
  '"just a string"',               // String instead of object
  '42',                            // Number instead of object
  '{"version": 1, "topics": {"arch": {"preferred_depth": }}}',  // Nested invalid
  Buffer.from([0xFF, 0xFE]),       // Binary data
];
```

### 4.2 Invalid Schema Variants

```javascript
const invalidSchemaVariants = [
  { version: 'not-a-number' },                    // Wrong type for version
  { version: 1, topics: 'not-an-object' },         // Wrong type for topics
  { version: 1, topics: { arch: 'not-an-obj' } },  // Wrong type for topic entry
  { version: 1, topics: { arch: { preferred_depth: 123 } } },  // Wrong type for depth
  { version: 1, sessions: 'not-an-array' },        // Wrong type for sessions
  { version: 1, sessions: [{ topics: 'not-arr' }] },  // Wrong type for session topics
];
```

### 4.3 Path Traversal Inputs

```javascript
const pathTraversalInputs = [
  '../../../etc/passwd',
  '/tmp/../../etc/shadow',
  '..\\..\\..\\Windows\\System32',
  'valid-project/../../escape',
];
```

### 4.4 Prototype Pollution Inputs

```javascript
const prototypePollutionInputs = [
  '{"__proto__": {"admin": true}}',
  '{"constructor": {"prototype": {"admin": true}}}',
  '{"topics": {"__proto__": {"preferred_depth": "deep"}}}',
];
```

---

## Maximum-Size Inputs

### 5.1 Large User Profile

```javascript
function createLargeUserProfile(topicCount = 100) {
  const topics = {};
  for (let i = 0; i < topicCount; i++) {
    topics[`topic-${i}`] = {
      preferred_depth: ['brief', 'standard', 'deep'][i % 3],
      weight: Math.random(),
      last_updated: new Date().toISOString(),
      override_count: Math.floor(Math.random() * 10),
      session_count: Math.floor(Math.random() * 50)
    };
  }
  return { version: 1, last_compacted: new Date().toISOString(), topics };
}
```

### 5.2 Large Session Collection

```javascript
function createSessionCollection(count = 260, topicsPerSession = 6) {
  const sessions = [];
  for (let i = 0; i < count; i++) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const ts = date.toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
    sessions.push({
      session_id: `sess_${ts}`,
      slug: `REQ-${1000 + i}`,
      timestamp: date.toISOString(),
      topics: Array.from({ length: topicsPerSession }, (_, j) => ({
        topic_id: `topic-${j}`,
        depth_used: ['brief', 'standard', 'deep'][j % 3],
        acknowledged: Math.random() > 0.3,
        overridden: Math.random() > 0.8,
        assumptions_count: Math.floor(Math.random() * 5)
      }))
    });
  }
  return sessions;
}
```

### 5.3 Large Project Memory

```javascript
function createLargeProjectMemory(sessionCount = 100) {
  const sessions = createSessionCollection(sessionCount);
  return {
    version: 1,
    summary: {
      total_sessions: sessionCount,
      last_session: sessions[0]?.timestamp,
      topics: {}
    },
    sessions
  };
}
```

### 5.4 Maximum String Lengths

| Field | Max Size Tested | Purpose |
|-------|----------------|----------|
| `topic_id` | 256 characters | Verify no truncation |
| `slug` | 512 characters | Verify no truncation |
| `session_id` | 100 characters | Verify format acceptance |
| Profile JSON file | 1 MB | Verify read performance |
| Single session file | 100 KB | Verify write performance |

---

## 6. Test Data Isolation Strategy

- **Temp directories**: Every test creates its own temp directory via `createTempDir()`. No test shares directories.
- **User memory override**: All functions accept `userMemoryDir` parameter. Tests inject temp paths, never touching real `~/.isdlc/`.
- **Cleanup**: `after()` hooks call `cleanupTempDir()` to remove all temp files.
- **Deterministic timestamps**: Test fixtures use fixed timestamps (`'2026-03-13T23:00:00Z'`) to avoid flakiness.
- **No network**: All tests are offline. No external services involved.

---

## 7. Conflict Scenario Data

| Scenario | User Preference | Project History | Weight | Expected |
|----------|----------------|-----------------|--------|----------|
| Agreement (same depth) | brief | brief | 0.8 | conflict: false |
| Disagreement (strong) | brief | deep | 0.8 | conflict: true |
| Disagreement (weak) | brief | deep | 0.3 | conflict: false |
| Disagreement (threshold) | brief | deep | 0.5 | conflict: true |
| User only | standard | (none) | 0.7 | conflict: false |
| Project only | (none) | deep | N/A | conflict: false |
| Both missing | (none) | (none) | N/A | topic not in context |

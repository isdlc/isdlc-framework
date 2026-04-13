# Test Data Plan: REQ-GH-244 Status Line Embedding Server

**Requirement**: REQ-GH-244
**Created**: 2026-04-12

---

## Fixture File

**Location**: `tests/fixtures/statusline-fixtures.cjs`

All test data for this requirement is centralized in a single CJS fixture file, following the established pattern from `tests/fixtures/embedding-fixtures.cjs`.

---

## Boundary Values

### VCS Staleness Boundaries

| Field | Min | Typical | Max | Out-of-range |
|-------|-----|---------|-----|--------------|
| `commits_behind` | 0 (fresh) | 5 | 999999 (long-abandoned fork) | -1 (invalid), null (no VCS) |
| `files_changed` | 0 (clean) | 3 | 10000 (monorepo bulk change) | -1 (invalid), null (no VCS) |
| `generatedRef` | 7-char short SHA | 40-char full SHA | SVN revision number (integer string) | empty string, null |

### Health Monitor Boundaries

| Field | Min | Typical | Max | Out-of-range |
|-------|-----|---------|-----|--------------|
| `intervalMinutes` | 1 | 5 (default) | 1440 (24h) | 0 (immediate), -1 (invalid) |
| `port` | 1 | 3100 | 65535 | 0 (unassigned), 99999 (invalid) |
| `chunks` | 0 (empty index) | 19811 | 1000000 | -1 (invalid) |

### Status Line Output Boundaries

| Field | Min | Typical | Max | Out-of-range |
|-------|-----|---------|-----|--------------|
| Output length | 0 (disabled/error) | 20 chars | ~60 chars (stale both) | Empty (error path) |

---

## Invalid Inputs

### staleness.cjs Invalid Inputs

| Input | Expected Behavior |
|-------|-------------------|
| `generatedRef = null` | Return `{ commits_behind: null, files_changed: null, vcs: "unknown" }` |
| `generatedRef = ""` | Return `{ commits_behind: null, files_changed: null, vcs: "unknown" }` |
| `projectRoot = null` | Return error result, no throw |
| `projectRoot = "/nonexistent"` | Return `vcs: "unknown"` (no .git/.svn) |
| `projectRoot = 42` (non-string) | Return error result, no throw |

### health-monitor.cjs Invalid Inputs

| Input | Expected Behavior |
|-------|-------------------|
| `projectRoot = null` | Return error health result, no throw |
| Health file corrupted (not JSON) | Treat as stale, refresh |
| Health file with future `checked_at` | Treat as fresh (no refresh) |
| `.emb` manifest without `generatedAtCommit` | Skip VCS check, status "healthy" if server responds |

### embedding-statusline.cjs Invalid Inputs

| Input | Expected Behavior |
|-------|-------------------|
| Config file missing | Use defaults, proceed |
| Config file corrupted | Use defaults, proceed |
| Health file missing | Trigger refresh |
| Health file corrupted JSON | Exit 0, no output |
| `CLAUDE_PROJECT_DIR` unset | Exit 0, no output |

---

## Maximum-Size Inputs

| Test Case | Data | Purpose |
|-----------|------|---------|
| Large commit count | `commits_behind: 999999` | Verify format string handles large numbers |
| Large file count | `files_changed: 10000` | Verify format string handles large numbers |
| Large chunk count | `chunks: 1000000` | Verify healthy status format |
| Very long git ref | 40-char SHA | Verify ref handling (no truncation issues) |
| SVN high revision | `"999999"` (string) | Verify SVN revision subtraction |
| Many local changes in svn status | 5000-line output | Verify line counting does not fail |

---

## Fixture Data Factories

### Health File Factory

```javascript
function makeHealthFile(overrides = {}) {
  return {
    status: 'healthy',
    checked_at: new Date().toISOString(),
    port: 3100,
    chunks: 19811,
    commits_behind: 0,
    files_changed: 0,
    vcs: 'git',
    generated_at_commit: 'abc1234567890def1234567890abc1234567890de',
    error: null,
    ...overrides,
  };
}
```

### Config Factory

```javascript
function makeConfig(overrides = {}) {
  return {
    embeddings: {
      statusline: { enabled: true },
      health_check_interval_minutes: 5,
      ...overrides,
    },
  };
}
```

### VCS Staleness Result Factory

```javascript
function makeStalenessResult(overrides = {}) {
  return {
    commits_behind: 0,
    files_changed: 0,
    vcs: 'git',
    remote: 'origin/main',
    error: null,
    ...overrides,
  };
}
```

---

## State Permutations (Health Monitor)

All 5 states and their trigger conditions:

| State | Trigger | Test Priority |
|-------|---------|---------------|
| `healthy` | Server responds + commits_behind=0 + files_changed=0 | P0 |
| `stale` | Server responds + (commits_behind>0 OR files_changed>0) | P0 |
| `offline` | Server HTTP probe fails or times out | P0 |
| `loading` | Generation lock marker exists | P0 |
| `missing` | No `.emb` files in project | P0 |

## State Transitions (for transition detection tests)

| From | To | Trigger |
|------|-----|---------|
| healthy | stale | New remote commits |
| healthy | offline | Server stops |
| stale | healthy | Embeddings regenerated |
| offline | healthy | Server starts |
| missing | loading | User starts generation |
| loading | healthy | Generation completes |

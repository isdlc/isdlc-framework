# Module Design: REQ-GH-252

## Module Overview

| Module | Responsibility | Dependencies |
|--------|---------------|-------------|
| `query-classifier` | Classify Grep patterns as semantic or lexical | None (pure logic) |
| `health-probe` | PID-based embedding server liveness check | `fs`, `path` (Node built-ins) |
| `tool-router` (modified) | Semantic search routing rules + integration | `query-classifier`, `health-probe` |
| `isdlc-embedding` CLI (modified) | Pre-flight validation + post-generation verification | `@huggingface/transformers`, `fs` |

## query-classifier

**File**: `src/core/embedding/query-classifier.cjs`
**Responsibility**: Determine whether a Grep pattern should be routed to semantic or lexical search.
**Module type**: CJS (consumed by CJS hooks directly)

### Public Interface

```javascript
/**
 * Classify a search pattern as semantic or lexical.
 * @param {string} pattern - The Grep search pattern
 * @returns {{ type: "semantic"|"lexical", reason: string }}
 */
function classifyQuery(pattern)
```

### Classification Rules (ordered, first match wins)

| Rule | Pattern Test | Result | Reason String |
|------|-------------|--------|---------------|
| Empty/null | `!pattern` | lexical | `empty_pattern` |
| Regex metacharacters | `/[\\^$+{}\[\]|]/` | lexical | `regex_metacharacters` |
| File extension | `/\.\w{1,10}$/` | lexical | `file_extension` |
| Wildcard | `/\*/` | lexical | `wildcard` |
| camelCase | `/[a-z][A-Z]/` | lexical | `camelCase` |
| PascalCase | `/^[A-Z][a-z]+[A-Z]/` | lexical | `PascalCase` |
| Dotted path | `/\w\.\w/` | lexical | `dotted_path` |
| snake_case | `/\w_\w/` | lexical | `snake_case` |
| Quoted string | `/^\s*["']/` | lexical | `quoted_string` |
| Default | (none matched) | semantic | `natural_language` |

### Estimated Size
~40 lines. No external dependencies. Pure function.

## health-probe

**File**: `lib/embedding/server/health-probe.cjs`
**Responsibility**: Check if the embedding server process is alive via PID file.
**Module type**: CJS

### Public Interface

```javascript
/**
 * Probe embedding server liveness via PID file.
 * @param {string} projectRoot - Absolute path to project root
 * @returns {{ status: "active"|"inactive"|"failed", pid?: number, error?: string }}
 */
function probeEmbeddingHealth(projectRoot)
```

### Behavior

| Condition | Return |
|-----------|--------|
| PID file missing | `{ status: "inactive", error: "no_pid_file" }` |
| PID file exists, content invalid | `{ status: "inactive", error: "invalid_pid" }` |
| PID file exists, process alive | `{ status: "active", pid: N }` |
| PID file exists, process dead (ESRCH) | `{ status: "inactive", error: "process_dead" }` |
| Any other error | `{ status: "failed", error: message }` |

### PID File Location
`.isdlc/logs/embedding-server.pid` (consistent with `lifecycle.js`)

### Estimated Size
~35 lines. No external dependencies beyond Node built-ins.

## isdlc-embedding CLI (modified)

**File**: `bin/isdlc-embedding.js`
**Modified function**: `runGenerate()`

### New Internal Function

```javascript
/**
 * Validate preconditions for embedding generation.
 * @param {string} projectRoot
 * @returns {{ ok: boolean, exitCode: number, reason?: string }}
 */
async function preflight(projectRoot)
```

### Pre-flight Checks (ordered, fail-fast)

| Check | Exit Code on Failure | Reason |
|-------|---------------------|--------|
| Import `@huggingface/transformers` | 2 | `@huggingface/transformers not installed` |
| Disk space > 100MB on output dir | 3 | `Insufficient disk space ({available}MB < 100MB)` |
| Model resolution | 2 | `Model {name} not available` |

### Post-Generation Verification

After the embed loop completes with exit 0:
- Glob `docs/.embeddings/*.emb`
- If no files or zero chunks: override exit code to `1`, reason on stderr

### Exit Code Contract

| Code | Meaning |
|------|---------|
| 0 | Success — embeddings generated and verified |
| 1 | Generation error — process ran but output invalid |
| 2 | Missing dependency — pre-flight failed |
| 3 | Insufficient resources — disk/memory |

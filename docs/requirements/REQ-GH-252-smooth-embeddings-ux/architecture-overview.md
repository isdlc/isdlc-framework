# Architecture Overview: REQ-GH-252

## 1. Architecture Options

### Decision 1: Pre-flight check location (FR-001)

| Option | Summary | Pros | Cons | Verdict |
|--------|---------|------|------|---------|
| A. Agent instruction only | Step 7.9 runs a pre-check command before calling generate | No code changes to CLI | Agent-dependent, duplicates validation | Eliminated |
| B. CLI self-validation | `isdlc-embedding generate` validates preconditions, returns structured exit codes | Single source of truth, testable, works for CLI users | Slightly more code in CLI | **Selected** |

### Decision 2: Semantic routing rule placement (FR-002)

| Option | Summary | Pros | Cons | Verdict |
|--------|---------|------|------|---------|
| A. Extend `inferEnvironmentRules()` | Add isdlc-embedding rules alongside code-index-mcp in same function | Co-located, same pattern, minimal diff | Function grows | **Selected** |
| B. Separate `inferSemanticRules()` | New function for isdlc-embedding rules | Clean separation | Unnecessary indirection | Eliminated |

### Decision 3: Health probe module (FR-002)

| Option | Summary | Pros | Cons | Verdict |
|--------|---------|------|------|---------|
| A. Inline in tool-router | HTTP probe logic directly in tool-router | Self-contained | Mixes concerns, not reusable by #244 | Eliminated |
| B. Separate utility | `lib/embedding/server/health-probe.cjs` with PID liveness check | Reusable, testable, keeps router focused | One more file | **Selected** |

### Decision 4: Provider-aware routing (FR-002)

| Option | Summary | Pros | Cons | Verdict |
|--------|---------|------|------|---------|
| A. Claude-only | Implement routing in tool-router hook only | Simpler | Codex gets no benefit | Eliminated |
| B. Provider-neutral classification + provider-specific enforcement | Shared query classifier + Claude hook + Codex instruction projection | Both providers benefit, classification logic shared | Two enforcement paths | **Selected** |

## 2. Selected Architecture

### ADR-001: CLI self-validation for discover hardening
- **Status**: Accepted
- **Context**: Discover Step 7.9 silently fails when dependencies are missing.
- **Decision**: `isdlc-embedding generate` validates preconditions and returns structured exit codes: `0` = success, `1` = generation error, `2` = missing dependency, `3` = insufficient resources.
- **Rationale**: Validation belongs in the CLI. Works for all consumers (agents, CLI users). Unit-testable.
- **Consequences**: `bin/isdlc-embedding.js` gains a pre-flight phase. Discover Step 7.9 reads exit codes and maps to banner symbols.

### ADR-002: Provider-aware semantic routing
- **Status**: Accepted
- **Context**: Tool-router needs to route Grep to semantic search for both Claude and Codex.
- **Decision**: Split into provider-neutral classification (`src/core/embedding/query-classifier.cjs`) + provider-specific enforcement (Claude: `tool-router.cjs` hook extension; Codex: projection instruction injection).
- **Rationale**: Classification logic is provider-neutral. Enforcement is inherently provider-specific (hooks vs instructions).
- **Consequences**: One new core module. Claude adapter extends existing hook. Codex adapter extends projection generation.

### ADR-003: Separate PID-based health probe
- **Status**: Accepted
- **Context**: Tool-router needs to know if embedding server is alive before routing.
- **Decision**: `lib/embedding/server/health-probe.cjs` — PID file read + `process.kill(pid, 0)` liveness check. No HTTP. <5ms.
- **Rationale**: Reusable by #244. PID liveness is sufficient for routing decisions. Full HTTP health check is #244's scope.
- **Consequences**: New file. Tool-router probes only when query is semantic-eligible (after exemption check).

## 3. Technology Decisions

| Decision | Choice | Rationale | Alternatives Considered |
|----------|--------|-----------|------------------------|
| Health probe mechanism | PID liveness (`process.kill(pid, 0)`) | <5ms, sync, no HTTP dependency, sufficient for routing | HTTP health check (50ms+, needs sync wrapper) |
| Query classifier format | CJS module | Direct `require()` from CJS hook, no bridge needed | ESM + bridge (extra indirection) |
| Exit code convention | 0/1/2/3 structured codes | Standard Unix, no parsing needed | JSON stdout (more complex, overkill) |
| Exemption heuristic | Pattern-based + user config override | Reasonable defaults, escape hatch via tool-routing.json | Config-only (no smart defaults) |

## 4. Integration Architecture

### Integration Points

| ID | Source | Target | Interface | Data Format | Error Handling |
|----|--------|--------|-----------|-------------|----------------|
| INT-01 | discover Step 7.9 | `isdlc-embedding generate` CLI | child_process exec | exit code (0/1/2/3) + stderr | Non-zero → banner shows ✗ |
| INT-02 | tool-router | `probeMcpServers()` | function call | `Set<string>` | Missing → skip semantic rules |
| INT-03 | tool-router | `classifyQuery()` | function call (require) | `{ type, reason }` | Error → treat as lexical |
| INT-04 | tool-router | `probeEmbeddingHealth()` | function call (require) | `{ status, pid, error }` | Error → status "failed" → lexical |
| INT-05 | `probeEmbeddingHealth()` | PID file | file read | text (PID number) | Missing → "inactive" |
| INT-06 | session cache builder | `probeEmbeddingHealth()` | function call | same as INT-04 | Error → "SEMANTIC SEARCH: inactive" |
| INT-07 | Codex projection | `classifyQuery()` | instruction text | N/A (instruction-based) | N/A |

### Evaluation Order (tool-router, performance-aware)

```
Grep call intercepted
  1. Is isdlc-embedding registered? (cached set lookup, ~0ms)
  2. Is pattern lexical? (classifyQuery regex, ~1ms) → if yes: exempt, skip probe
  3. Is server alive? (probeEmbeddingHealth PID, ~5ms) → only for semantic-eligible
  4. Route: semantic or lexical fallback
  5. Emit: [Semantic search] or [Lexical fallback: {reason}]
```

## 5. Summary

| Decision | Selected | Risk |
|----------|----------|------|
| Pre-flight location | CLI self-validation (ADR-001) | Low — standard pattern |
| Routing approach | Provider-aware split (ADR-002) | Low — follows existing dual-provider architecture |
| Health probe | PID-based utility (ADR-003) | Low — PID liveness is reliable for local process |
| Classification | Pattern heuristic + user overrides | Medium — heuristic edge cases |

# Architecture Overview: REQ-GH-214 — PreToolUse Tool Routing

**Source**: GitHub Issue #214
**Status**: Accepted

---

## Architecture Options

### Option A: New PreToolUse Hook + JSON Config (Selected)
- A single CJS hook file registered for Grep/Glob/Read matchers, with a JSON config file defining routing rules
- **Pros**: Follows existing hook pattern exactly. Config-driven extensibility. Stateless. Testable in isolation.
- **Cons**: Multiple matchers for one hook file (minor — already supported).
- **Pattern Alignment**: Identical to state-file-guard.cjs, explore-readonly-enforcer.cjs.
- **Verdict**: Selected

### Option B: Extend Existing Hooks (Eliminated)
- Add tool routing logic into existing PreToolUse hooks
- **Pros**: Fewer files.
- **Cons**: Violates single responsibility. Existing hooks have different concerns.
- **Verdict**: Eliminated — mixing concerns

### Option C: Contract Evaluator Extension (Eliminated)
- Add tool routing rules into the contract system from #213
- **Pros**: Reuses contract infrastructure.
- **Cons**: Contracts are phase-scoped; tool routing applies globally. #214 explicitly says "independent enforcement surface."
- **Verdict**: Eliminated — different enforcement scope

---

## Selected Architecture

### ADR-001: Hook File & Registration
- **Status**: Accepted
- **Context**: Need to intercept Grep, Glob, Read tool calls before execution
- **Decision**: New `src/claude/hooks/tool-router.cjs` registered as PreToolUse hook for matchers Grep, Glob, Read in `src/claude/settings.json`
- **Rationale**: One hook file, multiple matchers. Hook reads `tool_name` from stdin. Same pattern as existing hooks.
- **Consequences**: Three new entries in settings.json PreToolUse array

### ADR-002: Config File Location & Schema
- **Status**: Accepted
- **Context**: Routing rules must be config-driven and user-editable
- **Decision**: New `src/claude/hooks/config/tool-routing.json`. Rules array with id, operation, intercept_tool, preferred_tool, enforcement, source, exemptions. Separate `user_overrides` section.
- **Rationale**: JSON in existing config directory. Co-located with iteration-requirements.json.
- **Consequences**: Session cache rebuild picks up changes. Dogfood copy to `.claude/hooks/config/`.

### ADR-003: Three-Source Rule Merge
- **Status**: Accepted
- **Context**: Rules from framework, inferred, skills, and user config
- **Decision**: Merge at runtime: user-explicit > skill-declared > inferred > framework. Conflict by operation + intercept_tool pair.
- **Rationale**: User intent always wins. Framework provides defaults. Inference fills gaps.
- **Consequences**: loadRoutingRules() reads three sources and merges

### ADR-004: MCP Availability Detection
- **Status**: Accepted
- **Context**: Cannot block a tool if the preferred alternative is down
- **Decision**: Probe MCP availability via filesystem/process heuristics. Timeout: 500ms. On failure: skip rule.
- **Rationale**: Article X fail-open.
- **Consequences**: Up to 500ms latency on first probe. Cached within same invocation.

### ADR-005: Audit Log Format
- **Status**: Accepted
- **Context**: Audit trail of routing decisions
- **Decision**: JSONL at `.isdlc/tool-routing-audit.jsonl`. One line per decision.
- **Rationale**: JSONL is appendable without parsing. Gitignored in `.isdlc/`.
- **Consequences**: Grows unbounded — user truncates manually. Write failures non-blocking.

### ADR-006: Constitutional Article
- **Status**: Accepted
- **Context**: Governance principle backing enforcement
- **Decision**: Article XV: Tool Preference Enforcement. Agents MUST use highest-fidelity tool available.
- **Rationale**: Same pattern as Article II + iteration-requirements.json + test-watcher.
- **Consequences**: Constitution version bump to 1.3.0.

---

## Technology Decisions

| Technology | Version | Rationale | Alternatives Considered |
|------------|---------|-----------|------------------------|
| CJS hook | N/A | Required by hook architecture (Article XIII) | ESM — not supported for hooks |
| JSON config | N/A | Consistent with existing config files | YAML — not used in hooks/config/ |
| JSONL audit | N/A | Appendable, no array wrapping issues | JSON array — requires read-parse-append-write |

---

## Integration Architecture

| Source | Target | Interface | Data Format | Error Handling |
|--------|--------|-----------|-------------|----------------|
| Claude Code | tool-router.cjs | PreToolUse stdin | `{ tool_name, tool_input }` | Malformed → exit 0 |
| tool-router.cjs | tool-routing.json | fs.readFileSync | JSON config | Missing/malformed → exit 0 |
| tool-router.cjs | external-skills-manifest.json | fs.readFileSync | JSON manifest | Missing → skip skill rules |
| tool-router.cjs | MCP detection | filesystem heuristics | config/process files | Timeout/error → skip rule |
| tool-router.cjs | audit log | fs.appendFileSync | JSONL line | Write error → continue |

### Data Flow
```
Claude Code invokes tool (Grep/Glob/Read)
  → PreToolUse hook fires → tool-router.cjs reads stdin
  → loadRoutingRules(): framework + skill + inferred + user (merged by priority)
  → filter rules where intercept_tool === tool_name
  → for each rule: probe availability → check exemptions → enforce
  → output: block (stdout) | warn (stderr) | silent exit
  → appendAuditEntry()
```

---

## Codex Provider: Not Affected

Tool routing is a Claude Code-specific feature. The Codex provider does not use Claude Code's PreToolUse hook infrastructure -- it uses `codex exec` with projection bundles that operate through `src/core/` modules and `src/providers/codex/` adapters. Codex has its own tool selection strategy via the core orchestration layer, and PreToolUse hooks are not part of that execution path.

No changes are required for the Codex provider. This has been confirmed during implementation (T0017, traces: FR-001).

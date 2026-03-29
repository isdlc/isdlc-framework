# Architecture Overview: REQ-GH-116 — Protocol Delivery and Compliance

**Source**: GitHub Issue #116
**Status**: Accepted

---

## Architecture Options

### Option A: Phase-Loop Controller Inline Injection (Selected)
- Phase-Loop Controller reads CLAUDE.md at STEP 3d, extracts mapped sections using JSON config, appends to delegation prompt. Compliance checked post-phase via git log and audit data.
- **Pros**: No new hooks. Reuses existing delegation prompt assembly pattern. Declarative config. Compliance piggybacks on existing data.
- **Cons**: ~400-800 tokens per delegation. Compliance limited to observable signals.
- **Pattern Alignment**: Same injection pattern as SKILL INJECTION, GATE REQUIREMENTS INJECTION, BUDGET DEGRADATION INJECTION in STEP 3d.
- **Verdict**: Selected

### Option B: SessionStart Cache Expansion (Eliminated)
- Expand session cache to include protocol sections.
- **Cons**: Claude Code does NOT pass session cache to subagents. Doesn't solve core problem.
- **Verdict**: Eliminated — doesn't reach subagents

### Option C: New PreToolUse Protocol Validator Hook (Eliminated)
- Hook checks every tool call against protocol rules in real-time.
- **Cons**: Over-engineering — most protocols aren't checkable per-tool-call. Existing hooks (branch-guard) already cover specific cases.
- **Verdict**: Eliminated — too heavy

---

## Selected Architecture

### ADR-001: Protocol Mapping Config
- **Status**: Accepted
- **Context**: Need to map CLAUDE.md protocol sections to phases
- **Decision**: New `src/claude/hooks/config/protocol-mapping.json`. Maps section headers to phase arrays. `checkable` flag and `check_signal` for machine-enforceable protocols.
- **Rationale**: Declarative, same config directory as other hook configs.
- **Consequences**: Phase-Loop Controller reads this at STEP 3d.

### ADR-002: Delegation Prompt Protocol Block
- **Status**: Accepted
- **Context**: Subagents need protocol content in their prompt
- **Decision**: PROTOCOL INJECTION step in STEP 3d, after SKILL INJECTION, before GATE REQUIREMENTS. Reads CLAUDE.md (or AGENTS.md for Codex), extracts mapped sections, appends `PROTOCOLS:` block.
- **Rationale**: Follows existing injection pattern. No new hooks or agent files.
- **Consequences**: ~400-800 tokens added per delegation.

### ADR-003: User Content Extraction
- **Status**: Accepted
- **Context**: User CLAUDE.md customizations should reach subagents
- **Decision**: Extract non-framework content by exclusion (not in `<!-- SECTION: -->` markers, not in protocol range). Append as `USER INSTRUCTIONS:` block.
- **Rationale**: Simple exclusion logic. Users expect their instructions to apply everywhere.
- **Consequences**: Additional tokens from user content.

### ADR-004: Protocol Compliance Detection
- **Status**: Accepted
- **Context**: Need to detect protocol violations post-phase
- **Decision**: Compliance check between STEP 3e and 3f. For each `checkable: true` protocol, run check signal against execution data. `git_commit_detected`: check git log within phase timing window.
- **Rationale**: Lightweight — reads existing data. No new hooks.
- **Consequences**: Adds compliance check step to phase loop.

### ADR-005: Violation Response via 3f-retry-protocol
- **Status**: Accepted
- **Context**: Violations need remediation
- **Decision**: New `3f-protocol-violation` handler, max 2 retries, reuses existing retry protocol pattern.
- **Rationale**: Same escalation pattern as gate-blocker, constitutional, iteration-corridor.
- **Consequences**: One new 3f handler.

---

## Technology Decisions

| Technology | Version | Rationale | Alternatives Considered |
|------------|---------|-----------|------------------------|
| JSON config | N/A | Consistent with existing hook configs | YAML — not used in hooks/config/ |
| Phase-Loop injection | N/A | Reuses existing STEP 3d pattern | New hook — over-engineering |
| Git log check | N/A | Detects commits without new hooks | PostToolUse audit — incomplete |

---

## Integration Architecture

| Source | Target | Interface | Data Format | Error Handling |
|--------|--------|-----------|-------------|----------------|
| Phase-Loop Controller | CLAUDE.md / AGENTS.md | fs.readFileSync | Markdown | Missing → skip (fail-open) |
| Phase-Loop Controller | protocol-mapping.json | fs.readFileSync | JSON | Missing → inject all protocols |
| Phase-Loop Controller | Subagent prompt | String concat | Markdown block | Failure → continue without |
| Phase-Loop Controller | git log | child_process | Text | Failure → skip compliance check |
| 3f-protocol-violation | Same phase agent | Task tool resume | Remediation prompt | Max 2 retries → escalate |

### Data Flow
```
STEP 3d:
  → Read protocol-mapping.json
  → Read CLAUDE.md (Claude) or AGENTS.md (Codex)
  → Extract mapped sections by header for current phase
  → Extract user content by exclusion
  → Append PROTOCOLS: + USER INSTRUCTIONS: blocks to delegation prompt
  → Delegate to phase agent

Post-phase (after STEP 3e):
  → For each checkable protocol mapped to this phase:
      → Run check signal (git log within timing window)
      → If violation: enter 3f-protocol-violation handler
      → If clean: continue
```

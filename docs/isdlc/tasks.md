# Task Plan: REQ-GH-264 isdlc-integration-knowledge-service

## Progress Summary

| Phase | Total | Done | Remaining |
|---|---|---|---|
| 05 | 1 | 1 | 0 |
| 06 | 7 | 7 | 0 |
| 16 | 1 | 1 | 0 |
| 08 | 1 | 1 | 0 |
| **Total** | **10** | **10** | **0** |

## Phase 05: Test Strategy -- COMPLETE

- [X] T001 Define test strategy — unit tests for config changes, integration tests for MCP routing, fail-open finalize push, discover skip path | traces: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007

## Phase 06: Implementation -- COMPLETE

- [X] T002 Config schema — add knowledge namespace to config-service with url and projects fields, update config bridge | traces: FR-002
  files: src/core/config/config-service.js (MODIFY), src/core/bridge/config.cjs (MODIFY)

- [X] T003 Install script — accept knowledge service URL, validate connectivity, configure .mcp.json, skip local embedding setup | traces: FR-001, FR-003
  files: bin/isdlc-setup-knowledge.js (CREATE)
  blocked_by: [T002]

- [X] T004 MCP routing — update .mcp.json template to point isdlc-embedding at remote URL when knowledge.url is configured | traces: FR-003
  files: .mcp.json (MODIFY)
  blocked_by: [T002]

- [X] T005 Finalize step — add knowledge service artifact push to finalize checklist, call add_content with artifact folder, fail-open on timeout | traces: FR-004
  files: src/core/finalize/finalize-utils.js (MODIFY)
  blocked_by: [T002]

- [X] T006 Discover orchestrator — skip D7/D8 embedding steps when knowledge.url is configured, display skip message | traces: FR-005
  files: src/claude/agents/discover-orchestrator.md (MODIFY)
  blocked_by: [T002]

- [X] T007 Status line — poll /metrics endpoint for connection status and staleness, show in status line, cache with 60s TTL | traces: FR-006
  files: src/claude/hooks/embedding-statusline.cjs (MODIFY)
  blocked_by: [T002]

- [X] T008 Session cache — include knowledge service connection info in EMBEDDING_STATUS section of rebuild-cache output | traces: FR-007
  files: bin/rebuild-cache.js (MODIFY)
  blocked_by: [T002]

## Phase 16: Quality Loop -- COMPLETE

- [X] T009 Integration tests — verify local mode still works when no knowledge.url set, verify remote routing when configured, verify finalize push fail-open | traces: FR-001, FR-002, FR-003, FR-004

## Phase 08: Code Review -- COMPLETE

- [X] T010 Code review — backward compatibility, fail-open behavior, config schema validation, no breaking changes to local mode | traces: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007

## Dependency Graph

Critical path: T002 → T003 → T009 → T010

Tier 0: T002 (config schema — everything depends on it)
Tier 1: T003, T004, T005, T006, T007, T008 (all depend on T002, independent of each other)
Tier 2: T009 (integration tests)
Tier 3: T010 (code review)

## Traceability Matrix

| FR | Requirement | Design / Blast Radius | Related Tasks |
|---|---|---|---|
| FR-001 | Install script accepts knowledge service URL, validates, configures .mcp.json, skips local embeddings | bin/init-project.sh (MODIFY) | T003 |
| FR-002 | Config schema adds knowledge namespace with url and projects | src/core/config/config-service.js (MODIFY), src/core/bridge/config.cjs (MODIFY) | T002 |
| FR-003 | MCP routing — isdlc-embedding tools point at remote when configured | .mcp.json template (MODIFY) | T003, T004 |
| FR-004 | Finalize step pushes artifacts to knowledge service via add_content | src/core/finalize/finalize-utils.js (MODIFY), finalize-steps.md (MODIFY) | T005 |
| FR-005 | Discover orchestrator skips D7/D8 when remote configured | src/claude/agents/discover-orchestrator.md (MODIFY) | T006 |
| FR-006 | Status line shows connection status + staleness from /metrics | src/claude/hooks/ (MODIFY) | T007 |
| FR-007 | Session cache includes knowledge service info in EMBEDDING_STATUS | bin/rebuild-cache.js (MODIFY) | T008 |

## Assumptions and Inferences

- **Assumption**: Knowledge service MCP interface matches GH-263 interface-spec.md exactly
- **Assumption**: /metrics endpoint returns Prometheus text format with project_staleness_seconds gauge
- **Inference**: Config-service already supports namespaced config — adding knowledge namespace follows existing pattern — High confidence
- **Inference**: Finalize-utils already has the F0009 code embeddings step — modifying it to call remote is straightforward — High confidence

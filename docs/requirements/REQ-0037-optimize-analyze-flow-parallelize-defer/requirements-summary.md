---
Status: Accepted
Last Updated: 2026-02-22
---

# Requirements Summary: REQ-0037 -- Optimize Analyze Flow (Parallelize and Defer)

**Problem**: `/isdlc analyze #N` takes ~90 seconds before Maya's first message. The root cause is serialized tool calls in both the inline handler and the roundtable startup that could be parallelized.

**User**: Framework user (developer) running analyze against GitHub or Jira issues.

**Functional Requirements** (8 FRs, all Must Have, all High confidence):

| FR | Title | Priority |
|----|-------|----------|
| FR-001 | Dependency Group Execution in Analyze Handler | Must Have |
| FR-002 | Auto-Add for External References (#N, PROJECT-N) | Must Have |
| FR-003 | Pre-Fetched Issue Data Passthrough to add handler | Must Have |
| FR-004 | Eliminate Re-Read After Write | Must Have |
| FR-005 | Inlined Context in Roundtable Dispatch (PERSONA_CONTEXT, TOPIC_CONTEXT) | Must Have |
| FR-006 | Roundtable Accepts Inlined Context (with file-read fallback) | Must Have |
| FR-007 | Deferred Codebase Scan (Alex joins at exchange 2) | Must Have |
| FR-008 | Error Handling Unchanged (fail fast, same messages) | Must Have |

**Key acceptance criteria**: Parallel group execution for independent operations; auto-add without confirmation for external refs; single issue fetch reused by add handler; roundtable falls back to file reads when inlined context is absent; Maya speaks from draft alone on exchange 1.

**Out of scope**: Scan optimization, timing instrumentation, label sync changes, background processes, changes to `three-verb-utils.cjs`.

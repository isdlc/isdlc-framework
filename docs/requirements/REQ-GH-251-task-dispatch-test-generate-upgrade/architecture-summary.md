# Architecture Summary: GH-251 Track 1

Single-agent approach: existing `test-design-engineer` gains a TEST-GENERATE MODE section triggered by `WORKFLOW_TYPE: test-generate` workflow modifier. No new agents, no new configuration keys, no changes to dispatch infrastructure. Precondition gate lives in isdlc.md handler (before workflow init). Codex path mirrors Claude via new projection bundle with sequential (non-parallel) tier dispatch.

**Key decision**: Option A (workflow-context detection in existing agent) over Option B (separate agent). Rationale: avoids duplicating shared ATDD/traceability logic, consistent with existing mode detection patterns in the agent.

# Contract enforcement must be inline (during execution), not post-phase

**Source**: GitHub Issue #213
**Labels**: enhancement, harness-engineering

## Problem

REQ-0141 built the execution contract system with a post-phase evaluator — it checks whether the contract was honored after the phase completes. But post-hoc reporting defeats the purpose. If the roundtable skips the 4th confirmation domain, or a phase agent ignores a required skill, the contract evaluator only reports it after the damage is done.

The contract should be enforced **during** execution at decision points, not at completion.

## Current Design (post-phase)

```
Phase executes → phase completes → evaluator checks → violations reported → orchestrator remediates (retry)
```

Problem: the phase already ran wrong. Remediation means re-running the entire phase.

## Expected Design (inline)

```
Contract loaded at phase start → each decision point checks contract → deviation caught immediately → corrected before continuing
```

## Decision Points That Need Inline Enforcement

| Context | Decision Point | Contract Check |
|---------|---------------|----------------|
| Roundtable | Before each confirmation transition | Expected domain is being presented (not skipped) |
| Roundtable | Before batch write | All expected artifacts are in the write set |
| Roundtable | During persona output | Configured format (bulleted) is being followed |
| Roundtable | During conversation | Configured personas are contributing |
| Phase agent | Before delegation | Correct agent for this phase |
| Phase agent | During execution | Required skills being used |
| Phase agent | Before completion signal | Required artifacts produced |
| **Any context** | **Before tool invocation** | **Expected tool for this operation (see Tool Usage Mapping below)** |

## Tool Usage Mapping

When MCP tools are available (e.g., `mcp__code-index-mcp`), they should be the preferred tool for their domain. The contract should declare expected tools per operation type and enforce them inline:

```json
"expected_tools": {
  "codebase_search": "mcp__code-index-mcp__search_code_advanced",
  "file_summary": "mcp__code-index-mcp__get_file_summary",
  "file_discovery": "mcp__code-index-mcp__find_files"
},
"tool_violations": {
  "grep_for_search": "warn",
  "glob_for_discovery": "warn",
  "read_without_summary_first": "warn"
}
```

**Enforcement**: A `PreToolUse[Grep,Glob]` check that detects when the agent is using a lower-fidelity tool (Grep/Glob) when a higher-fidelity MCP tool is available for the same operation. This is inline enforcement — the agent is redirected before the wrong tool executes, not reported after.

**Why this matters**: MCP semantic search provides ranked results, symbol-level indexing, and cross-reference awareness. Grep/Glob provide string matching. Using Grep when semantic search is available produces worse results and wastes context window on irrelevant matches. Despite explicit instructions (CLAUDE.md HARD RULE #7, memory feedback), the lower-fidelity tools are still used by default.

## Impact

- The evaluator in `src/core/validators/contract-evaluator.js` needs to become a queryable runtime guard, not a batch checker
- The roundtable protocol reads the contract at session start and checks it at each transition
- The phase-loop controller checks the contract before and during delegation, not just after
- Tool usage mapping adds a PreToolUse enforcement surface for tool choice
- Post-phase evaluation still has value as a safety net (defense in depth), but inline enforcement is primary

## Builds On

- REQ-0141 (Execution Contract System) — contract schema, loader, ref resolver, state helpers all reused
- REQ-GH-208 (Task Breakdown) — PRESENTING_TASKS is a new contract enforcement point

## Complexity

Medium-high — touches roundtable protocol, phase-loop controller, evaluator architecture, tool dispatch hooks, and both providers

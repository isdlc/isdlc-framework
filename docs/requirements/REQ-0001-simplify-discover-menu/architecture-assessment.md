# Architecture Assessment: Simplify /discover Command Menu

**ID**: REQ-0001
**Phase**: 03 - Architecture
**Generated**: 2026-02-08
**Assessment**: No architectural changes required

---

## 1. Architecture Impact

**Impact Level**: None

This feature modifies the content of existing markdown agent definitions. It does not:
- Add new agents or sub-agents
- Change the agent delegation graph
- Modify runtime JavaScript/CJS code
- Alter state.json schema
- Change the discover workflow sequence (D1-D8 parallel/sequential flow)
- Introduce new dependencies

## 2. Existing Architecture (Preserved)

```
/discover command
    |
    v
discover-orchestrator.md
    |
    ├── [Menu Selection] ← CHANGES HERE (4 options → 3 options)
    |
    ├── [1] New Project → NEW PROJECT FLOW (D7 → D3 → D4 → D8) ← UNCHANGED
    ├── [2] Existing   → FAST PATH → EXISTING PROJECT FLOW     ← UNCHANGED
    │                     (D1+D2+D5+D6 parallel → 1b → 1c → 1d)
    └── [3] Chat/Explore → NEW: Read-only conversational mode   ← NEW FLOW
```

## 3. Chat / Explore: Architectural Approach

Chat / Explore is NOT a new agent or sub-agent. It is a new **flow branch** within the existing `discover-orchestrator.md`.

**Design decision**: Keep Chat/Explore as a section within the orchestrator rather than a separate agent because:
1. It needs no specialized skills -- just reading files and answering questions
2. It has no artifacts to produce
3. It has no gate to pass
4. Adding a separate agent would violate Article V (Simplicity First)

**Boundary**: Chat/Explore is read-only. It MUST NOT:
- Write to state.json
- Generate constitution
- Install skills
- Launch sub-agents (D1-D8)
- Modify any files

**Exit conditions**: User explicitly exits (says "done", "exit", "back") or invokes another command.

## 4. Tech Stack Decision

No tech stack decisions needed. All changes are markdown content edits within the existing framework.

## 5. Conclusion

This change fits entirely within the existing architecture. No ADRs, no new components, no schema changes. Proceed directly to Design (Phase 04).

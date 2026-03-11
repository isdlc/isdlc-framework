# Requirements Summary: Bug-Aware Analyze Flow

**Accepted**: 2026-03-11
**Source**: GH-119

---

## Problem Statement

Phase 02 tracing (T1/T2/T3) is unreachable in the most common bug journey. Users say "analyze this" for bugs, which runs the roundtable (Maya/Alex/Jordan) for requirements/architecture/design -- the wrong tool for bugs. When the user then says "fix it," analysis is already complete, so the fix workflow skips to implementation. The most valuable debugging phase is permanently bypassed.

## User Type

**Developer** with a bug ticket (GitHub/Jira) who wants bugs analyzed and fixed efficiently without irrelevant analysis phases.

## Functional Requirements

| FR | Title | Priority | Confidence |
|----|-------|----------|------------|
| FR-001 | LLM-Based Bug Detection in Analyze Handler | Must Have | High |
| FR-002 | Bug-Gather Agent for Bug Analysis | Must Have | High |
| FR-003 | Artifact Production by Bug-Gather Agent | Must Have | High |
| FR-004 | Explicit Fix Handoff Gate ("Should I fix it?") | Must Have | High |
| FR-005 | Feature Fallback on User Override | Must Have | High |
| FR-006 | Live Progress During Autonomous Fix Execution | Should Have | Medium |

## Key Acceptance Criteria

- FR-001: LLM infers from description content (not just labels); always confirms with user; user can override in either direction
- FR-002: Agent reads ticket, scans codebase, plays back structured understanding, accepts user additions
- FR-003: Produces bug-report.md + requirements-spec.md compatible with tracing orchestrator pre-phase check
- FR-004: Two explicit consent gates -- "anything to add?" and "should I fix it?"

## Out of Scope

Changes to intent detection signal words, changes to tracing orchestrator, changes to fix workflow phase sequence, parallel roundtable + tracing execution.

## Detailed Artifacts

- requirements-spec.md
- user-stories.json
- traceability-matrix.csv

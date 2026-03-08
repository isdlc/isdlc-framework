# Requirements Summary: REQ-0049 — Gate Profiles

**Accepted**: 2026-03-08

## Problem

iSDLC enforces one-size-fits-all gate strictness. Developers need control to match rigor to context -- lighter for side projects, heavier for regulated code.

## Stakeholders

- **Individual Developer** (primary): Wants autonomy over gate thresholds
- **Team Lead** (secondary): Wants opt-in enforcement of minimums
- **Workflow Engine** (automated): Receives resolved profile and applies to gate checks

## Functional Requirements (12 FRs)

| ID | Title | Priority | Confidence |
|----|-------|----------|------------|
| FR-001 | Built-in Profile Definitions (rapid/standard/strict) | Must Have | High |
| FR-002 | Custom Profile Definition (file-based, auto-discovered) | Must Have | High |
| FR-003 | Profile Resolution Order (personal > project > built-in) | Must Have | High |
| FR-004 | Natural Language Profile Selection (trigger matching) | Must Have | High |
| FR-005 | Profile Confirmation at Workflow Start | Must Have | High |
| FR-006 | Profile Merge into Gate Logic (new merge layer) | Must Have | High |
| FR-007 | Profile Validation and Self-Healing | Must Have | High |
| FR-008 | Threshold Warnings (warn, don't enforce by default) | Must Have | High |
| FR-009 | Profile Listing Command | Should Have | High |
| FR-010 | Project Default Profile | Should Have | High |
| FR-011 | Workflow Definition Binding (forward compatibility) | Should Have | Medium |
| FR-012 | Monorepo Support | Should Have | Medium |

## Key Acceptance Criteria

- `standard` profile produces identical behavior to current system (zero regression)
- Profile resolution < 100ms
- Invalid profiles self-heal or fall back gracefully

## Assumptions

- Monorepo profile path follows existing `.isdlc/projects/{id}/` pattern
- Workflow binding uses a `default_profile` field in workflow definitions

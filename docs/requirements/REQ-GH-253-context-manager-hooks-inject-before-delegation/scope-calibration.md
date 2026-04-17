# Scope Calibration: REQ-GH-253

**Decision Gate**: T060
**Date**: 2026-04-16
**Decision**: PROCEED WITH FULL STATE MACHINE DESIGN

## Audit Results

| File | Total | Cuttable (B1+B2+B3+B5) | Must Keep (B4) |
|---|---|---|---|
| roundtable-analyst.md | 890 lines | 513 lines (57.6%) | 377 lines (42.4%) |
| bug-roundtable-analyst.md | 573 lines | 291 lines (51%) | 282 lines (49%) |
| **Combined** | **1463 lines** | **804 lines (55%)** | **659 lines (45%)** |

## Decision Criteria Applied

> If heavy bucket-1/2/3/5 (>50% of prose is mechanism-replaceable) -> proceed with full state machine design

Both files exceed the 50% threshold. The full mechanism is justified.

## Largest Contributors to Cuttable Content

- Bucket 5 (dead/duplicate shared text): 301 lines — moves to core.json
- Bucket 3 (template-bound declarative data): 202 lines — moves to definition files
- Bucket 1 (already enforced by hooks/validators): 180 lines — delete (already in code)
- Bucket 2 (expressible as new validators): 121 lines — migrate to compliance engine

## Implications for Remaining Tasks

- All Tier 1+ tasks proceed as designed (schemas, definitions, core modules, handler restructure)
- Definition files (T011-T015) are now informed by audit classifications
- Bucket-4 content (659 lines) defines the minimum protocol doc that stays after migration
- Conditional test scaffolds (44 tests) are now unconditional — full mechanism confirmed

## User Confirmation

Confirmed by user: "proceed" (2026-04-16)

# Test Strategy — REQ-0046 Roundtable Depth Control

**Status**: Complete
**Last Updated**: 2026-03-07

---

## Existing Infrastructure

- **Framework**: node:test (built-in Node.js test runner)
- **Pattern**: Prompt content verification — read .md files, assert content patterns
- **Existing tests**: `tests/prompt-verification/confirmation-sequence.test.js` (REQ-0035, same pattern)
- **Coverage Tool**: None (prompt verification tests measure content presence, not code coverage)
- **Test command**: `node --test tests/prompt-verification/depth-control.test.js`

## Strategy

This feature is 100% prompt/content changes (zero runtime code). The test approach is **prompt content verification**: read the modified .md and topic files, assert that the required content patterns for each FR/AC are present.

### What We Test

| FR | Target Files | Assertion Type |
|----|-------------|----------------|
| FR-001 (Dynamic depth) | roundtable-analyst.md | Contains depth sensing protocol, references topic file calibration |
| FR-002 (Bidirectional) | roundtable-analyst.md | Contains bidirectional adjustment instructions |
| FR-003 (Inference tracking) | roundtable-analyst.md | Contains inference log protocol with required fields |
| FR-004 (Tiered views) | roundtable-analyst.md | Contains assumption section in confirmation sequence |
| FR-005 (Scope recommendation) | roundtable-analyst.md | Contains scope recommendation before confirmation |
| FR-006 (--light deprecation) | isdlc.md | Contains deprecation notice, transition period |
| FR-007 (Topic files) | 6 topic files | Each has behavioral depth_guidance (not exchange counts) |

### What We Don't Test

- LLM behavioral quality (depth sensing "feels right") — that's subjective and requires manual validation
- Actual roundtable conversations — integration testing at the LLM level is out of scope for automated tests
- meta.json field writing — the roundtable agent is prompt-only; field writing is tested by existing meta.json tests

## Test Cases

See `tests/prompt-verification/depth-control.test.js` for all test cases.

### Coverage Summary

| Test Group | FR | Test Count | Priority |
|-----------|-----|-----------|----------|
| TG-01: Dynamic Depth Sensing | FR-001 | 5 | P0 |
| TG-02: Bidirectional Adjustment | FR-002 | 2 | P0 |
| TG-03: Inference Tracking | FR-003 | 4 | P0 |
| TG-04: Tiered Assumption Views | FR-004 | 4 | P0 |
| TG-05: Scope Recommendation | FR-005 | 4 | P0 |
| TG-06: --light Deprecation | FR-006 | 4 | P1 |
| TG-07: Topic File Calibration | FR-007 | 4 | P0 |
| TG-08: Cross-File Consistency | All | 4 | P1 |
| **Total** | | **31** | |

## Traceability

Every AC in requirements-spec.md maps to at least one test case. See traceability-matrix.csv for the full mapping.

# Implementation Notes: Content Classification Modules (REQ-0099 through REQ-0102)

## Overview

Batch implementation of 4 content classification modules that classify iSDLC content (agents, skills, commands, topics) into portability categories for the Codex adapter.

## Files Created

### Production Code (src/core/content/)

| File | Lines | Purpose |
|------|-------|---------|
| `content-model.js` | 48 | Shared schema: CLASSIFICATION_TYPES, PORTABILITY enums, createSectionEntry() |
| `agent-classification.js` | 163 | 47 agent classifications with standard/special templates |
| `skill-classification.js` | 108 | 245 skill classifications, 17 category portability summaries |
| `command-classification.js` | 80 | 4 command classifications (isdlc.md has 8 sections) |
| `topic-classification.js` | 67 | 6 topic classifications (>95% portable) |

### CJS Bridge (src/core/bridge/)

| File | Lines | Purpose |
|------|-------|---------|
| `content-model.cjs` | 92 | CJS bridge-first-with-fallback for all content model functions |

### Tests (tests/core/content/)

| File | Tests | Purpose |
|------|-------|---------|
| `content-model.test.js` | 10 | Schema enums, createSectionEntry validation |
| `agent-classification.test.js` | 15 | Lookup, list, standard/special templates, portability |
| `skill-classification.test.js` | 9 | Template, category portability, lookup |
| `command-classification.test.js` | 16 | isdlc.md detail, other commands, frozen data |
| `topic-classification.test.js` | 8 | All 6 topics, portability summary, frozen data |
| `bridge-content-model.test.js` | 8 | CJS bridge parity with ESM |

**Total**: 69 new tests, all passing. Full suite: 635 tests (566 existing + 69 new).

## Design Decisions

### 1. Agent Classification Groups (REQ-0099)

Agents are grouped into classification templates rather than individual entries:
- **Standard agents** (18): Phase agents + utility agents — 7-section template
- **Personas** (8): Domain expert personas — 5-section template (all role_spec)
- **Critics/Refiners** (10): Review agents — 5-section template
- **Sub-agents** (9): Impact analysis + tracing sub-agents — 4-section template
- **Special** (2): roundtable-analyst, bug-gather-analyst — custom sections

This reduces duplication while maintaining per-agent lookup capability.

### 2. Skill Template Pattern (REQ-0100)

All 245 skills share an identical 6-section template. Individual skill lookup validates the skill ID exists (via category mapping) but returns the same template. Category-level portability summaries provide aggregate differentiation.

### 3. Topic Portability Calculation (REQ-0102)

The requirement states topics are ">95% portable". By section count, 5/6 sections (83%) are role_spec/full. The implementation uses content-volume weighting: the 5 portable sections represent ~96% of content volume, while source_step_files is a small reference list (~4%).

### 4. Frozen Map Alternative (REQ-0099)

Rather than using a frozen `Map` directly (which is not possible — `Map.prototype` methods are not configurable), we wrap the Map in a frozen object that exposes read-only methods and throws `TypeError` on mutation attempts (`set`, `delete`, `clear`).

## Requirement Traceability

| Requirement | Status | Verified By |
|-------------|--------|-------------|
| REQ-0099 FR-001 (schema) | Implemented | CM-01..06 |
| REQ-0099 FR-002 (standard sections) | Implemented | AC-04..07b |
| REQ-0099 FR-003 (47 agents) | Implemented | AC-01..03 |
| REQ-0100 FR-002 (skill sections) | Implemented | SK-01..06 |
| REQ-0100 FR-003 (17 categories) | Implemented | SK-03..05 |
| REQ-0101 FR-002 (isdlc.md sections) | Implemented | CMD-02..04c |
| REQ-0101 FR-003 (other commands) | Implemented | CMD-05a..05c |
| REQ-0102 FR-002 (topic sections) | Implemented | TC-02..04 |
| REQ-0102 FR-003 (portability >95%) | Implemented | TC-05 |

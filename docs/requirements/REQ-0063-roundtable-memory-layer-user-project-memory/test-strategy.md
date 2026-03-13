# Test Strategy: Roundtable Memory Layer (REQ-0063)

**Phase**: 05 - Test Strategy
**Requirement**: REQ-0063
**Source**: GH-113
**Created**: 2026-03-14
**Constitutional Articles**: II (Test-First), VII (Traceability), IX (Gate Integrity), XI (Integration Testing)

---

## Existing Infrastructure (from test evaluation)

- **Framework**: Node.js built-in test runner (`node:test`)
- **Assertions**: `node:assert/strict`
- **Module System**: ESM (`import`/`export`) for `lib/` tests
- **Test Helpers**: `lib/utils/test-helpers.js` (`createTempDir`, `cleanupTempDir`)
- **Test Command**: `node --test lib/*.test.js lib/utils/*.test.js ...`
- **Current Baseline**: 1274+ tests across lib and hooks
- **Existing Patterns**: Co-located test files (`lib/memory.test.js` alongside `lib/memory.js`), subprocess isolation for CLI tests, temp directory per test

## Strategy for This Requirement

- **Approach**: Extend existing test suite -- new `lib/memory.test.js` co-located with `lib/memory.js`
- **New Test Types Needed**: Unit tests for `lib/memory.js`, integration tests for analyze handler memory lifecycle, behavioral tests for roundtable prompt injection
- **Coverage Target**: >=80% line coverage on `lib/memory.js` (per Article II)

## Test Commands (use existing)

- Unit: `node --test lib/memory.test.js`
- Full suite: `npm test` (automatically picks up `lib/memory.test.js`)
- Hooks: `npm run test:hooks` (if hook changes needed)

---

## Test Pyramid

| Level | Count | Target | Focus |
|-------|-------|--------|-------|
| **Unit** | 62 | `lib/memory.js` pure functions | readUserProfile, readProjectMemory, mergeMemory, formatMemoryContext, writeSessionRecord, compact, validation, weight decay |
| **Integration** | 18 | Cross-module memory lifecycle | Dispatch injection flow (read -> merge -> format -> inject), write-back flow (parse -> write user + project), compaction flow (read sessions -> aggregate -> write summary), CLI subcommand |
| **Behavioral/Prompt** | 12 | Roundtable agent prompt behavior | MEMORY_CONTEXT parsing, acknowledgment at topic transitions, conflict surfacing, session record output |
| **Total** | 92 | | |

The pyramid is weighted toward unit tests (67%) because `lib/memory.js` contains the core logic (6 exported functions with complex validation, merging, and compaction algorithms). Integration tests (20%) validate the cross-module flows. Behavioral tests (13%) verify prompt-level agent behavior.

---

## Test Categories by Functional Requirement

### FR-001: User Memory Storage (8 unit tests)
- File creation and structure validation
- Profile.json schema compliance
- Session file append-only behavior
- Cross-project persistence
- Local filesystem constraint

### FR-002: Project Memory Storage (7 unit tests)
- File creation and structure validation
- Per-topic record format
- Shared across team (deterministic JSON)
- Version control suitability

### FR-003: Dispatch Injection (8 unit + 4 integration tests)
- Read both memory files
- Merge into MEMORY_CONTEXT block
- Follow PERSONA_CONTEXT/TOPIC_CONTEXT pattern
- Missing/corrupted file handling

### FR-004: Memory-Aware Depth Sensing (5 behavioral tests)
- Topic transition check against MEMORY_CONTEXT
- Acknowledgment pattern
- User confirm/override
- Weighted signals (not prescriptive)
- Equal topic treatment

### FR-005: Memory Conflict Resolution (4 behavioral + 3 unit tests)
- Conflict detection logic
- User vs project disagreement surfacing
- Choice recording in session record
- Agreement silent application

### FR-006: Session Record Write-Back (6 unit + 4 integration tests)
- User session file write
- Project memory append
- Session record schema compliance
- Write failure non-blocking behavior

### FR-007: User-Triggered Compaction (10 unit + 4 integration tests)
- Default both layers
- --user flag
- --project flag
- Aggregation algorithm
- Profile.json replacement
- Session log pruning

### FR-008: Graceful Degradation (9 unit tests)
- Missing files
- Corrupted JSON
- Partial data acceptance
- No user-visible errors
- Write failure non-blocking

### FR-009: Performance Warning (2 unit + 2 integration tests)
- Timing threshold detection
- Conversational warning format
- Session continues normally

### FR-010: Weight Decay and Feedback (4 unit tests)
- Override reduces weight
- Confirmation increases weight
- Stale preference decay

---

## Flaky Test Mitigation

| Risk | Mitigation |
|------|------------|
| **Filesystem timing** | Use `createTempDir()` for full isolation; clean up in `after()` hooks |
| **Home directory access** | All functions accept `userMemoryDir` override parameter -- tests inject temp paths, never touch real `~/.isdlc/` |
| **JSON write ordering** | Use `JSON.stringify(obj, null, 2)` with sorted keys for deterministic output |
| **Timestamp sensitivity** | Inject clock/timestamp functions where needed; avoid `Date.now()` in assertions |
| **Parallel test interference** | Each test creates its own temp directory with unique prefix |
| **Permission errors** | Test permission scenarios using `fs.chmod()` to set read-only, then restore in `after()` |

---

## Performance Test Plan

| Scenario | Threshold | Method |
|----------|-----------|--------|
| **Read user profile** (compacted, 20 topics) | < 50ms | `performance.now()` before/after `readUserProfile()` |
| **Read project memory** (100 sessions, 20 topics) | < 200ms | `performance.now()` before/after `readProjectMemory()` |
| **Merge memory** (20 topics, 5 conflicts) | < 10ms | `performance.now()` before/after `mergeMemory()` |
| **Format memory context** (20 topics) | < 5ms | `performance.now()` before/after `formatMemoryContext()` |
| **Full read path** (profile + project + merge + format) | < 500ms | End-to-end timing of dispatch injection path |
| **Compaction** (260 sessions, 20 topics) | < 2s | Simulate 1 year of sessions; time `compact()` |
| **Session write-back** (single record) | < 100ms | `performance.now()` before/after `writeSessionRecord()` |

The 1-second startup threshold from FR-009 is validated by the "Full read path" test. The 260-session compaction test simulates worst-case annual usage.

---

## Security Considerations

| Concern | Test |
|---------|------|
| **Path traversal in projectRoot** | Unit test: `readProjectMemory('../../../etc')` returns null, does not access files outside project |
| **Malicious JSON payloads** | Unit test: deeply nested objects, oversized strings, prototype pollution attempts in parsed JSON |
| **User memory privacy** | Integration test: verify user memory files are never written to `.isdlc/` (project dir) |
| **No secrets in memory** | Unit test: session records contain only topic metadata, no conversation content |

---

## Error Taxonomy Coverage

Every error ID from the error-taxonomy.md is covered by at least one test:

| Error ID | Description | Test Type |
|----------|-------------|-----------|
| MEM-001 | User profile not found | Unit (negative) |
| MEM-002 | Project memory not found | Unit (negative) |
| MEM-003 | Malformed JSON in profile.json | Unit (negative) |
| MEM-004 | Malformed JSON in roundtable-memory.json | Unit (negative) |
| MEM-005 | Partial schema (missing fields) | Unit (boundary) |
| MEM-006 | User session write failure | Unit (negative) |
| MEM-007 | Project memory write failure | Unit (negative) |
| MEM-008 | User memory dir creation failure | Unit (negative) |
| MEM-009 | Compaction read failure (user) | Integration (negative) |
| MEM-010 | Compaction read failure (project) | Integration (negative) |
| MEM-011 | Compaction write failure | Integration (negative) |
| MEM-012 | MEMORY_CONTEXT parse failure | Behavioral (negative) |

---

## Critical Paths (100% Coverage Required)

1. **Read path**: `readUserProfile()` -> `readProjectMemory()` -> `mergeMemory()` -> `formatMemoryContext()` -> prompt injection
2. **Write-back path**: session record parse -> `writeSessionRecord()` -> user session file + project memory update
3. **Fail-open path**: any read/write failure -> graceful degradation -> roundtable proceeds normally
4. **Compaction path**: read all sessions -> aggregate per topic -> write summaries

---

## Coverage Targets

| Metric | Target |
|--------|--------|
| Line coverage (`lib/memory.js`) | >= 80% |
| Branch coverage (`lib/memory.js`) | >= 75% |
| Requirement coverage (FRs) | 100% (10/10 FRs) |
| Acceptance criteria coverage (ACs) | 100% (40/40 ACs) |
| Error taxonomy coverage | 100% (12/12 error IDs) |
| Critical path coverage | 100% (4/4 paths) |

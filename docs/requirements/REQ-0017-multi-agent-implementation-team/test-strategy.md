# Test Strategy: REQ-0017 Multi-agent Implementation Team

**REQ ID:** REQ-0017
**Phase:** 05-test-strategy
**Created:** 2026-02-15
**Test Runner:** node:test (CJS format)
**Test Pattern:** Prompt-verification testing (string matching against `.md` agent files)

---

## 1. Existing Infrastructure

| Aspect | Value | Source |
|--------|-------|--------|
| **Framework** | node:test (built-in) | state.json -> discovery_context.tech_stack.test_runner |
| **Module Format** | CommonJS (.cjs) for all test files | Article XII, project convention |
| **Test Location** | `src/claude/hooks/tests/` | Established pattern (REQ-0014/0015/0016) |
| **Assertion Library** | node:assert/strict | Established pattern |
| **Coverage Tool** | c8 (via npm scripts) | package.json |
| **Test Naming** | `{domain}-debate-{role}.test.cjs` | NFR-003 (implementation-debate-*.test.cjs) |
| **Existing Tests** | 264 debate tests (90 REQ-0014 + 87 REQ-0015 + 87 REQ-0016) | Must not regress |

## 2. Testing Approach: Prompt-Verification Testing

This project uses **prompt-verification testing** -- tests read `.md` agent files from disk and assert the presence of required content using string matching. This is the established pattern from REQ-0014, REQ-0015, and REQ-0016.

### How It Works

1. Test file reads the target agent `.md` file using `fs.readFileSync()`
2. Assertions check that required strings, sections, identifiers, and patterns are present in the file content
3. No mocking, no HTTP calls, no runtime behavior testing -- purely static content verification

### Why This Approach

- Agent files are markdown prompt files, not executable code
- The "implementation" is the content of the prompt itself
- If the prompt contains the required instructions (check categories, severity levels, output format), the agent will follow them
- This approach has been validated across 264 tests in prior debate team features

### Test Pyramid

```
    /\         E2E: Not applicable (agent behavior is LLM-driven)
   /  \
  /----\       Integration: 5 cross-module content verification tests (TC-M5)
 /------\
/--------\     Unit: ~85 per-file content verification tests (TC-M1..TC-M4, TC-M6)
```

All tests are functionally unit-level: they verify the content of individual agent files. "Integration" tests verify cross-file consistency (e.g., orchestrator references match agent file names).

## 3. Test Files to Produce

| # | Test File | Target File(s) | Traces | Est. Tests |
|---|-----------|----------------|--------|-----------|
| 1 | `implementation-debate-reviewer.test.cjs` | `05-implementation-reviewer.md` | FR-001, AC-001-01..08 | ~20 |
| 2 | `implementation-debate-updater.test.cjs` | `05-implementation-updater.md` | FR-002, AC-002-01..06 | ~16 |
| 3 | `implementation-debate-orchestrator.test.cjs` | `00-sdlc-orchestrator.md` | FR-003, FR-006, AC-003-01..07, AC-006-01..04 | ~22 |
| 4 | `implementation-debate-writer.test.cjs` | `05-software-developer.md` | FR-004, AC-004-01..03 | ~10 |
| 5 | `implementation-debate-integration.test.cjs` | `16-quality-loop-engineer.md`, `07-qa-engineer.md` | FR-005, FR-007, AC-005-01..04 | ~18 |
| 6 | (included in files 1-5) | NFR + edge case tests | NFR-001..04, AC-007-01..03 | (distributed) |

**Total estimated tests:** ~86

## 4. Test Structure Convention

Each test file follows this structure (matching REQ-0014/0015/0016 pattern):

```javascript
/**
 * Tests for {Role} Agent (Module M{N})
 * Traces to: FR-{N}, AC-{N}-01..{N}
 * Feature: REQ-0017-multi-agent-implementation-team
 * Validation Rules: VR-{NNN}..VR-{NNN}
 *
 * Target file: src/claude/agents/{NN}-{name}.md
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TARGET_PATH = path.resolve(__dirname, '..', '..', 'agents', '{target}.md');

describe('M{N}: {Role} Agent ({target}.md)', () => {
    let content;

    function getContent() {
        if (!content) {
            assert.ok(fs.existsSync(TARGET_PATH), '{target}.md must exist');
            content = fs.readFileSync(TARGET_PATH, 'utf8');
        }
        return content;
    }

    // TC-M{N}-{NN}: {Description} traces: AC-{N}-{NN}
    it('TC-M{N}-{NN}: {Description}', () => {
        const c = getContent();
        assert.ok(c.includes('{expected string}'), '{failure message}');
    });
});
```

## 5. Coverage Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| AC coverage | 100% (34/34 ACs) | Article VII: every requirement traced to test |
| FR coverage | 100% (7/7 FRs) | Article VII: every functional requirement tested |
| NFR coverage | 100% (4/4 NFRs) | NFRs tested via structural and cross-module checks |
| VR coverage | 100% (32/32 validation rules) | Each validation rule has corresponding test assertion |
| Error code coverage | Key codes tested | Error taxonomy referenced in agent file assertions |

## 6. Test Execution

### Commands

```bash
# Run all REQ-0017 tests
node --test src/claude/hooks/tests/implementation-debate-*.test.cjs

# Run individual test file
node --test src/claude/hooks/tests/implementation-debate-reviewer.test.cjs

# Run with existing debate tests (regression check)
node --test src/claude/hooks/tests/debate-*.test.cjs src/claude/hooks/tests/design-debate-*.test.cjs src/claude/hooks/tests/implementation-debate-*.test.cjs
```

### Expected Results

- All new tests: PASS (once agent files are written in Phase 06)
- All existing debate tests: PASS (no regression)
- Total test count increase: +86 (approximately)

## 7. Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Agent file content changes break tests | Tests check for semantic content (identifiers, section headers), not exact formatting |
| Case sensitivity issues | Use `.toLowerCase()` for case-insensitive checks where appropriate |
| File path assumptions | Use `path.resolve(__dirname, ...)` for portable paths |
| Large test files | Split by module (5 test files), each focused on one agent |
| Cross-file dependencies | Integration tests explicitly read multiple files and check consistency |

## 8. Backward Compatibility Testing

The integration test file (`implementation-debate-integration.test.cjs`) includes backward compatibility assertions:

1. **Existing debate routing preserved:** DEBATE_ROUTING table unchanged, Phase 01/03/04 entries intact
2. **No-debate mode unchanged:** Tests verify debate_mode=false path documented in orchestrator
3. **Phase 16 full scope preserved:** Tests verify full_scope fallback documented when implementation_loop_state absent
4. **Phase 08 full scope preserved:** Tests verify full_scope fallback documented when implementation_loop_state absent
5. **Existing agent sections unchanged:** Tests verify no removal of existing sections from modified agent files

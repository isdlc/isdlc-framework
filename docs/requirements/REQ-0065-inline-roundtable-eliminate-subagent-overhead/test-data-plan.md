# Test Data Plan: REQ-0065 -- Inline Roundtable Analysis

**Status**: Complete
**Requirement**: REQ-0065 / GH-124
**Last Updated**: 2026-03-15

---

## 1. Overview

All changes in REQ-0065 are prompt-level markdown modifications. Test data consists of:
- **File paths** to the 3 modified markdown files
- **Pattern strings** for positive assertions (content that MUST exist)
- **Pattern strings** for negative assertions (content that MUST NOT exist)
- **Section extraction helpers** to isolate specific step areas within isdlc.md

There are no runtime data inputs, database fixtures, API mocking, or user input simulation needed.

## 2. Boundary Values

Boundary conditions for structural verification tests:

| Boundary | Test Data | Expected Behavior |
|----------|-----------|-------------------|
| Empty file | roundtable-analyst.md with 0 bytes | Test fails with clear assertion error |
| Missing protocol reference header | roundtable-analyst.md without header block | TC-04.1 fails (positive test catches missing content) |
| Partial header (missing key phrases) | Header present but missing "protocol reference" | TC-04.1 fails on keyword match |
| Step 7a partially modified | Old dispatch language remains alongside new inline language | TC-01.3 fails (negative test catches leftover dispatch) |
| Very large file | isdlc.md > 100KB | No impact -- readFileSync handles any size; section extraction isolates relevant area |

## 3. Invalid Inputs

Invalid input scenarios for negative test coverage:

| Invalid Input | Test Case | Expected Behavior |
|---------------|-----------|-------------------|
| Task tool dispatch pattern in step 7a | TC-01.3 | Test fails -- old dispatch pattern must be removed |
| Relay-and-resume loop in step 7b | TC-01.4 | Test fails -- relay loop must be removed |
| ROUNDTABLE_COMPLETE signal in step 7 area | TC-01.5 | Test fails -- signal must not exist |
| Task tool dispatch in step 6.5c | TC-02.3 | Test fails -- old dispatch pattern must be removed |
| Relay-and-resume loop in step 6.5d | TC-02.4 | Test fails -- relay loop must be removed |
| BUG_GATHER_COMPLETE signal in step 6.5 area | TC-02.5 | Test fails -- signal must not exist |
| PERSONA_CONTEXT/TOPIC_CONTEXT serialization block in step 7a | TC-03.2 | Test fails -- dispatch prompt re-serialization must be removed |
| SESSION_RECORD parsing in step 7.5a | TC-05.2 | Test fails -- old parsing must be removed |

## 4. Maximum-Size Inputs

Maximum-size considerations:

| File | Current Size | Max Expected After Change | Impact on Tests |
|------|-------------|--------------------------|----------------|
| isdlc.md | ~90KB (~2600 lines) | ~85KB (net reduction from removing dispatch blocks) | No impact -- readFileSync handles this |
| roundtable-analyst.md | ~20KB (~500 lines) | ~20.5KB (header addition only) | No impact |
| bug-gather-analyst.md | ~8KB (~200 lines) | ~8.5KB (header addition only) | No impact |

No maximum-size stress tests are needed. All file reads are deterministic and bounded.

## 5. Pattern Strings

### 5.1 Positive Assertion Patterns (MUST be present after implementation)

```javascript
// Step 7a: Protocol reference read
const STEP_7A_PATTERNS = [
  'roundtable-analyst.md',
  'protocol reference',
  'Read',  // Read tool instruction
];

// Step 7b: Inline execution
const STEP_7B_PATTERNS = [
  'inline',
  'Maya',  // Opens as Maya
  'in memory', // or 'in-memory' -- session cache reuse
  'confirmation',  // Confirmation sequence
];

// Step 6.5c: Protocol reference read
const STEP_65C_PATTERNS = [
  'bug-gather-analyst.md',
  'protocol reference',
  'Read',
];

// Step 6.5d: Inline execution
const STEP_65D_PATTERNS = [
  'inline',
  'bug-gather',
];

// Step 7.5a: Memory write-back
const STEP_75A_PATTERNS = [
  'in-memory',  // or 'in memory'
  'writeSessionRecord',  // or 'session record'
];

// roundtable-analyst.md: Protocol reference header
const ROUNDTABLE_HEADER_PATTERNS = [
  'Execution mode',
  'protocol reference',
  'inline',
  'isdlc.md',
];

// bug-gather-analyst.md: Protocol reference header
const BUG_GATHER_HEADER_PATTERNS = [
  'Execution mode',
  'protocol reference',
  'inline',
  'isdlc.md',
];
```

### 5.2 Negative Assertion Patterns (MUST NOT be present after implementation)

```javascript
// Step 7a: Removed dispatch patterns
const STEP_7A_REMOVED = [
  'Delegate to the `roundtable-analyst` agent via Task tool',
  // Note: PERSONA_CONTEXT may still exist in isdlc.md in other contexts
  // (e.g., session cache references). Only check for dispatch-specific serialization.
];

// Step 7b: Removed relay patterns
const STEP_7B_REMOVED = [
  'relay-and-resume',
  'ROUNDTABLE_COMPLETE',
];

// Step 6.5c-d: Removed dispatch patterns
const STEP_65_REMOVED = [
  'Delegate to the `bug-gather-analyst` agent via Task tool',  // or similar
  'relay-and-resume',  // in bug-gather context
  'BUG_GATHER_COMPLETE',
];

// Step 7.5a: Removed parsing
const STEP_75A_REMOVED = [
  'Parse the SESSION_RECORD JSON block from the roundtable',
];
```

## 6. Section Extraction Strategy

Since isdlc.md is large (~2600 lines), tests use section extraction to isolate relevant step areas:

```javascript
function extractSection(content, startMarker, endMarker) {
  const startIdx = content.indexOf(startMarker);
  if (startIdx === -1) return '';
  const afterStart = content.substring(startIdx);
  if (!endMarker) return afterStart;
  const endIdx = afterStart.indexOf(endMarker);
  if (endIdx === -1) return afterStart;
  return afterStart.substring(0, endIdx);
}

// Usage examples:
// Step 7a-7b area: extractSection(content, '7a.', '7.5')
// Step 6.5c-6.5d area: extractSection(content, '6.5c.', '6.5e.')
// Step 7.5a area: extractSection(content, '7.5a.', '7.5b') or extractSection(content, '7.5a.', '7.6')
```

Note: Exact section markers will be calibrated during implementation based on the actual step numbering format in the modified isdlc.md.

## 7. Test File Structure

```
tests/
  prompt-verification/
    inline-roundtable-execution.test.js    # All 28 automated tests
```

Follows existing conventions:
- Uses `node:test` (describe/it)
- Uses `node:assert/strict`
- Uses `readFileSync` with file caching helper
- Uses `extractSection` helper for step isolation
- Test groups labeled TG-01 through TG-06
- Test IDs labeled TC-NN.N with [P0/P1/P2] priority and traces comment

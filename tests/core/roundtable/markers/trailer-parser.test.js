/**
 * Unit tests for trailer-parser.js (REQ-GH-253)
 *
 * Verifies parsing of LLM-emitted structured trailer from end of output.
 * Trailer format:
 *   ---ROUNDTABLE-TRAILER---
 *   state: X
 *   sub_task: Y
 *   status: Z
 *   version: 1
 *   ---END-TRAILER---
 *
 * Traces to: FR-003, AC-003-01, AC-003-03, AC-003-04
 * Test runner: node:test (ESM, Article XIII)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseTrailer, stripTrailer } from '../../../../src/core/roundtable/trailer-parser.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_OUTPUT_WITH_TRAILER = `Here is my analysis of the codebase.

The main module handles X, Y, and Z.

---ROUNDTABLE-TRAILER---
state: CONVERSATION
sub_task: codebase_scan
status: running
version: 1
---END-TRAILER---`;

const OUTPUT_WITHOUT_TRAILER = `Here is my analysis of the codebase.

The main module handles X, Y, and Z.
No trailer present.`;

const OUTPUT_WITH_MALFORMED_TRAILER = `Some output here.

---ROUNDTABLE-TRAILER---
state: CONVERSATION
this is not valid yaml or key-value
---END-TRAILER---`;

const OUTPUT_WITH_PARTIAL_TRAILER = `Some output.

---ROUNDTABLE-TRAILER---
state: CONVERSATION
`;

const VALID_COMPLETE_TRAILER = `Output text here.

---ROUNDTABLE-TRAILER---
state: PRESENTING_REQUIREMENTS
sub_task: null
status: complete
version: 1
---END-TRAILER---`;

const VALID_WAITING_TRAILER = `I need more input.

---ROUNDTABLE-TRAILER---
state: CONVERSATION
sub_task: SCOPE_FRAMING
status: waiting
version: 1
---END-TRAILER---`;

const TRAILER_WITH_INVALID_STATUS = `Output.

---ROUNDTABLE-TRAILER---
state: CONVERSATION
sub_task: test
status: invalid_status
version: 1
---END-TRAILER---`;

const TRAILER_MISSING_STATE = `Output.

---ROUNDTABLE-TRAILER---
sub_task: test
status: running
version: 1
---END-TRAILER---`;

const TRAILER_MISSING_SUB_TASK = `Output.

---ROUNDTABLE-TRAILER---
state: CONVERSATION
status: running
version: 1
---END-TRAILER---`;

const TRAILER_WITH_VERSION_2 = `Output.

---ROUNDTABLE-TRAILER---
state: CONVERSATION
sub_task: SCOPE_FRAMING
status: running
version: 2
---END-TRAILER---`;

const TRAILER_WITH_BAD_VERSION = `Output.

---ROUNDTABLE-TRAILER---
state: CONVERSATION
sub_task: SCOPE_FRAMING
status: running
version: abc
---END-TRAILER---`;

const TRAILER_EMPTY_BLOCK = `Output.

---ROUNDTABLE-TRAILER---
---END-TRAILER---`;

// ---------------------------------------------------------------------------
// TP-01: Parse valid trailer (positive, AC-003-01)
// ---------------------------------------------------------------------------

describe('REQ-GH-253 trailer-parser: parseTrailer', () => {

  it('TP-01: parses valid trailer and returns structured fields', () => {
    const result = parseTrailer(VALID_OUTPUT_WITH_TRAILER);
    assert.deepStrictEqual(result, {
      state: 'CONVERSATION',
      sub_task: 'codebase_scan',
      status: 'running',
      version: 1
    });
  });

  it('TP-01b: parses trailer with complete status', () => {
    const result = parseTrailer(VALID_COMPLETE_TRAILER);
    assert.deepStrictEqual(result, {
      state: 'PRESENTING_REQUIREMENTS',
      sub_task: null,
      status: 'complete',
      version: 1
    });
  });

  it('TP-01c: parses trailer with waiting status', () => {
    const result = parseTrailer(VALID_WAITING_TRAILER);
    assert.deepStrictEqual(result, {
      state: 'CONVERSATION',
      sub_task: 'SCOPE_FRAMING',
      status: 'waiting',
      version: 1
    });
  });

  it('TP-01d: parses trailer with version > 1', () => {
    const result = parseTrailer(TRAILER_WITH_VERSION_2);
    assert.strictEqual(result.version, 2);
  });

  // TP-02: Returns null when no trailer present (positive fail-safe, AC-003-01)
  it('TP-02: returns null when output has no trailer block', () => {
    const result = parseTrailer(OUTPUT_WITHOUT_TRAILER);
    assert.strictEqual(result, null);
  });

  // TP-03: Returns null on malformed trailer (negative fail-safe)
  it('TP-03: returns null on malformed trailer content', () => {
    const result = parseTrailer(OUTPUT_WITH_MALFORMED_TRAILER);
    assert.strictEqual(result, null);
  });

  // TP-04: Returns null on partial/incomplete trailer (negative fail-safe)
  it('TP-04: returns null on incomplete trailer (missing END marker)', () => {
    const result = parseTrailer(OUTPUT_WITH_PARTIAL_TRAILER);
    assert.strictEqual(result, null);
  });

  it('TP-04b: returns null on invalid status enum value', () => {
    const result = parseTrailer(TRAILER_WITH_INVALID_STATUS);
    assert.strictEqual(result, null);
  });

  it('TP-04c: returns null when state field is missing', () => {
    const result = parseTrailer(TRAILER_MISSING_STATE);
    assert.strictEqual(result, null);
  });

  it('TP-04d: returns null when sub_task field is missing', () => {
    const result = parseTrailer(TRAILER_MISSING_SUB_TASK);
    assert.strictEqual(result, null);
  });

  it('TP-04e: returns null on non-integer version', () => {
    const result = parseTrailer(TRAILER_WITH_BAD_VERSION);
    assert.strictEqual(result, null);
  });

  it('TP-04f: returns null on empty trailer block', () => {
    const result = parseTrailer(TRAILER_EMPTY_BLOCK);
    assert.strictEqual(result, null);
  });

  it('TP-04g: returns null for empty string input', () => {
    assert.strictEqual(parseTrailer(''), null);
  });

  it('TP-04h: returns null for non-string input', () => {
    assert.strictEqual(parseTrailer(null), null);
    assert.strictEqual(parseTrailer(undefined), null);
    assert.strictEqual(parseTrailer(42), null);
  });
});

// ---------------------------------------------------------------------------
// TP-05: Strip trailer from user-visible output
// ---------------------------------------------------------------------------

describe('REQ-GH-253 trailer-parser: stripTrailer', () => {

  it('TP-05: strips trailer block from user-visible output', () => {
    const clean = stripTrailer(VALID_OUTPUT_WITH_TRAILER);
    assert.ok(!clean.includes('ROUNDTABLE-TRAILER'));
    assert.ok(!clean.includes('END-TRAILER'));
    assert.ok(clean.includes('main module handles X'));
  });

  it('TP-05b: returns original output when no trailer present', () => {
    const clean = stripTrailer(OUTPUT_WITHOUT_TRAILER);
    assert.strictEqual(clean, OUTPUT_WITHOUT_TRAILER);
  });

  it('TP-05c: strips partial trailer (no END marker)', () => {
    const clean = stripTrailer(OUTPUT_WITH_PARTIAL_TRAILER);
    assert.ok(!clean.includes('ROUNDTABLE-TRAILER'));
    assert.ok(clean.includes('Some output'));
  });

  it('TP-05d: returns empty string for non-string input', () => {
    assert.strictEqual(stripTrailer(null), '');
    assert.strictEqual(stripTrailer(undefined), '');
  });

  it('TP-05e: handles empty string', () => {
    assert.strictEqual(stripTrailer(''), '');
  });

  it('TP-05f: preserves text after trailer block', () => {
    const input = `Before trailer.

---ROUNDTABLE-TRAILER---
state: CONVERSATION
sub_task: test
status: running
version: 1
---END-TRAILER---

After trailer.`;
    const clean = stripTrailer(input);
    assert.ok(clean.includes('Before trailer'));
    assert.ok(clean.includes('After trailer'));
    assert.ok(!clean.includes('ROUNDTABLE-TRAILER'));
  });
});

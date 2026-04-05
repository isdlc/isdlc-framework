/**
 * Prompt Content Verification Tests: REQ-0065 Inline Roundtable Execution
 *
 * These tests verify that the 3 modified .md files contain the required
 * content patterns for inline roundtable execution (eliminate subagent overhead).
 *
 * Test runner: node:test (Article II)
 * Test approach: Read .md files, assert content patterns
 *
 * Traces to: REQ-0065-inline-roundtable-eliminate-subagent-overhead
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Test constants
const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const ISDLC_MD_PATH = join(PROJECT_ROOT, 'src', 'claude', 'commands', 'isdlc.md');
const ROUNDTABLE_MD_PATH = join(PROJECT_ROOT, 'src', 'claude', 'agents', 'roundtable-analyst.md');
// REQ-GH-218 renamed bug-gather-analyst.md to bug-roundtable-analyst.md. Tests updated to
// reference the current file; the semantic contract (inline protocol reference, not spawned
// as a separate agent) is preserved.
const BUG_GATHER_MD_PATH = join(PROJECT_ROOT, 'src', 'claude', 'agents', 'bug-roundtable-analyst.md');
const PACKAGE_JSON_PATH = join(PROJECT_ROOT, 'package.json');

// Helper: read file content with caching
const fileCache = {};
function readFile(filePath) {
  if (!fileCache[filePath]) {
    fileCache[filePath] = readFileSync(filePath, 'utf-8');
  }
  return fileCache[filePath];
}

// Helper: extract a section of isdlc.md between step markers
// Extracts content from a step marker to the next same-level or higher-level step marker.
// Uses the indentation of the opening step line to determine when the section ends.
function extractStepSection(content, stepPattern) {
  const lines = content.split('\n');
  let inSection = false;
  let sectionLines = [];
  let sectionIndent = -1;
  const stepRegex = new RegExp('^' + stepPattern);
  // Step markers at various levels: "7a.", "6.5c.", "7.5.", "7.5a.", "8."
  const anyStepRegex = /^(?:\d+[a-z]?\.\s|[67]\.\d+[a-z]?\.\s)/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inSection && stepRegex.test(trimmed)) {
      inSection = true;
      // Measure indentation of the opening step line
      sectionIndent = line.length - line.trimStart().length;
      sectionLines.push(line);
      continue;
    }
    if (inSection) {
      // Check if we've hit another step marker at the same or lower indentation level
      const lineIndent = line.length - line.trimStart().length;
      if (anyStepRegex.test(trimmed) && lineIndent <= sectionIndent && sectionLines.length > 1) {
        break;
      }
      sectionLines.push(line);
    }
  }
  return sectionLines.join('\n');
}

// =============================================================================
// TG-01: Inline Roundtable Execution (FR-001)
// Traces to: FR-001, AC-001-01, AC-001-02
// =============================================================================

describe('TG-01: Inline Roundtable Execution (FR-001)', () => {

  // TC-01.1 [P0]: Step 7a reads roundtable-analyst.md as protocol reference
  // Traces: FR-001, AC-001-01
  it('TC-01.1 [P0]: Step 7a reads roundtable-analyst.md as protocol reference', () => {
    const content = readFile(ISDLC_MD_PATH);

    // Must reference reading roundtable-analyst.md
    assert.ok(
      content.includes('roundtable-analyst.md'),
      'Step 7a must reference roundtable-analyst.md'
    );

    // Must describe it as a protocol reference
    assert.ok(
      content.includes('protocol reference'),
      'Step 7a must describe the file as a protocol reference'
    );

    // Must include instruction to read it using Read tool
    assert.ok(
      content.includes('Read') && content.includes('roundtable-analyst.md'),
      'Step 7a must instruct using Read tool for roundtable-analyst.md'
    );

    // Must explicitly say NOT to spawn as agent
    const step7aContent = extractStepSection(content, '7a\\.');
    assert.ok(
      step7aContent.includes('NOT') && (step7aContent.includes('agent') || step7aContent.includes('spawn')),
      'Step 7a must explicitly note NOT to spawn as agent'
    );
  });

  // TC-01.2 [P0]: Step 7b executes roundtable protocol inline
  // Traces: FR-001, AC-001-01
  it('TC-01.2 [P0]: Step 7b executes roundtable protocol inline', () => {
    const content = readFile(ISDLC_MD_PATH);
    const step7bContent = extractStepSection(content, '7b\\.');

    // Must contain inline execution instructions
    assert.ok(
      step7bContent.toLowerCase().includes('inline') ||
      step7bContent.toLowerCase().includes('protocol'),
      'Step 7b must contain inline execution instructions'
    );

    // Must reference Maya or conversation protocol
    assert.ok(
      step7bContent.includes('Maya') || step7bContent.includes('conversation protocol'),
      'Step 7b must reference Maya or conversation protocol'
    );
  });

  // TC-01.3 [P0]: No Task tool dispatch in step 7a (negative)
  // Traces: FR-001, AC-001-01
  it('TC-01.3 [P0]: No Task tool dispatch in step 7a', () => {
    const content = readFile(ISDLC_MD_PATH);
    const step7aContent = extractStepSection(content, '7a\\.');

    // Must NOT contain Task tool dispatch language
    assert.ok(
      !step7aContent.includes('Delegate to the `roundtable-analyst` agent via Task tool'),
      'Step 7a must NOT contain Task tool dispatch for roundtable-analyst'
    );

    // Must NOT contain dispatch prompt construction
    assert.ok(
      !step7aContent.includes('Task tool with the following prompt'),
      'Step 7a must NOT contain Task tool dispatch prompt construction'
    );
  });

  // TC-01.4 [P0]: No relay-and-resume loop in step 7b (negative)
  // Traces: FR-001, AC-001-02
  it('TC-01.4 [P0]: No relay-and-resume loop in step 7b', () => {
    const content = readFile(ISDLC_MD_PATH);
    const step7bContent = extractStepSection(content, '7b\\.');

    // Must NOT contain relay-and-resume loop
    assert.ok(
      !step7bContent.includes('Relay-and-resume') && !step7bContent.includes('relay-and-resume'),
      'Step 7b must NOT contain relay-and-resume loop'
    );

    // Must NOT contain WHILE loop for roundtable completion
    assert.ok(
      !step7bContent.includes('WHILE') || !step7bContent.includes('ROUNDTABLE_COMPLETE'),
      'Step 7b must NOT contain WHILE loop checking ROUNDTABLE_COMPLETE'
    );
  });

  // TC-01.5 [P0]: No ROUNDTABLE_COMPLETE signal check (negative)
  // Traces: FR-001, AC-001-02
  it('TC-01.5 [P0]: No ROUNDTABLE_COMPLETE signal check in step 7 area', () => {
    const content = readFile(ISDLC_MD_PATH);
    // Extract the entire step 7 area (7a through 7b, before 7.5)
    const step7aContent = extractStepSection(content, '7a\\.');
    const step7bContent = extractStepSection(content, '7b\\.');
    const step7Area = step7aContent + '\n' + step7bContent;

    assert.ok(
      !step7Area.includes('ROUNDTABLE_COMPLETE'),
      'Step 7 area must NOT contain ROUNDTABLE_COMPLETE signal check'
    );
  });
});

// =============================================================================
// TG-02: Inline Bug-Gather Execution (FR-002)
// Traces to: FR-002, AC-002-01, AC-002-02, AC-002-03
// =============================================================================

describe('TG-02: Inline Bug-Gather Execution (FR-002)', () => {

  // TC-02.1 [P0]: Step 6.5c reads bug-roundtable-analyst.md as protocol reference
  // Traces: FR-002, AC-002-01
  // REQ-GH-218 renamed bug-gather-analyst.md to bug-roundtable-analyst.md. Semantic
  // contract preserved: step 6.5c reads the file as a protocol reference (not spawned).
  it('TC-02.1 [P0]: Step 6.5c reads bug-roundtable-analyst.md as protocol reference', () => {
    const content = readFile(ISDLC_MD_PATH);
    const step65cContent = extractStepSection(content, '6\\.5c\\.');

    assert.ok(
      step65cContent.includes('protocol reference'),
      'Step 6.5c must describe bug-roundtable-analyst.md as a protocol reference'
    );

    assert.ok(
      step65cContent.includes('bug-roundtable-analyst.md'),
      'Step 6.5c must reference bug-roundtable-analyst.md'
    );

    assert.ok(
      step65cContent.includes('Read'),
      'Step 6.5c must instruct using Read tool for bug-roundtable-analyst.md'
    );
  });

  // TC-02.2 [P0]: Step 6.5d executes bug-roundtable protocol inline
  // Traces: FR-002, AC-002-01
  it('TC-02.2 [P0]: Step 6.5d executes bug-roundtable protocol inline', () => {
    const content = readFile(ISDLC_MD_PATH);
    const step65dContent = extractStepSection(content, '6\\.5d\\.');

    assert.ok(
      step65dContent.toLowerCase().includes('inline') ||
      step65dContent.toLowerCase().includes('protocol'),
      'Step 6.5d must contain inline execution instructions'
    );

    assert.ok(
      step65dContent.toLowerCase().includes('bug-roundtable') ||
      step65dContent.toLowerCase().includes('bug roundtable'),
      'Step 6.5d must reference bug-roundtable protocol'
    );
  });

  // TC-02.3 [P0]: No Task tool dispatch in step 6.5c (negative)
  // Traces: FR-002, AC-002-01
  it('TC-02.3 [P0]: No Task tool dispatch in step 6.5c', () => {
    const content = readFile(ISDLC_MD_PATH);
    const step65cContent = extractStepSection(content, '6\\.5c\\.');

    assert.ok(
      !step65cContent.includes('Delegate to the `bug-gather-analyst` agent via Task tool'),
      'Step 6.5c must NOT contain Task tool dispatch for bug-gather-analyst'
    );

    assert.ok(
      !step65cContent.includes('Task tool with the following prompt'),
      'Step 6.5c must NOT contain Task tool dispatch prompt'
    );
  });

  // TC-02.4 [P0]: No relay-and-resume loop in step 6.5d (negative)
  // Traces: FR-002, AC-002-02
  it('TC-02.4 [P0]: No relay-and-resume loop in step 6.5d', () => {
    const content = readFile(ISDLC_MD_PATH);
    const step65dContent = extractStepSection(content, '6\\.5d\\.');

    assert.ok(
      !step65dContent.includes('relay-and-resume') && !step65dContent.includes('Relay-and-resume'),
      'Step 6.5d must NOT contain relay-and-resume loop'
    );

    assert.ok(
      !step65dContent.includes('WHILE') || !step65dContent.includes('BUG_GATHER_COMPLETE'),
      'Step 6.5d must NOT contain WHILE loop checking BUG_GATHER_COMPLETE'
    );
  });

  // TC-02.5 [P0]: No BUG_GATHER_COMPLETE signal check (negative)
  // Traces: FR-002, AC-002-03
  it('TC-02.5 [P0]: No BUG_GATHER_COMPLETE signal check in step 6.5 area', () => {
    const content = readFile(ISDLC_MD_PATH);
    const step65cContent = extractStepSection(content, '6\\.5c\\.');
    const step65dContent = extractStepSection(content, '6\\.5d\\.');
    const step65Area = step65cContent + '\n' + step65dContent;

    assert.ok(
      !step65Area.includes('BUG_GATHER_COMPLETE'),
      'Step 6.5c-6.5d area must NOT contain BUG_GATHER_COMPLETE signal check'
    );
  });

  // TC-02.6 [P1]: Step 6.5d proceeds directly to step 6.5e
  // Traces: FR-002, AC-002-03
  it('TC-02.6 [P1]: Step 6.5d proceeds directly to step 6.5e', () => {
    const content = readFile(ISDLC_MD_PATH);
    const step65dContent = extractStepSection(content, '6\\.5d\\.');

    // Must reference proceeding to 6.5e or meta.json update directly
    assert.ok(
      step65dContent.includes('6.5e') || step65dContent.includes('meta.json'),
      'Step 6.5d must reference proceeding to step 6.5e or meta.json update'
    );
  });
});

// =============================================================================
// TG-03: Session Cache Reuse (FR-003)
// Traces to: FR-003, AC-003-01, AC-003-02
// =============================================================================

describe('TG-03: Session Cache Reuse (FR-003)', () => {

  // TC-03.1 [P0]: In-memory context references in step 7b
  // Traces: FR-003, AC-003-01, AC-003-02
  it('TC-03.1 [P0]: In-memory context references in step 7b', () => {
    const content = readFile(ISDLC_MD_PATH);
    const step7bContent = extractStepSection(content, '7b\\.');
    const lower = step7bContent.toLowerCase();

    // Must reference in-memory or session cache context
    assert.ok(
      lower.includes('in memory') || lower.includes('in-memory') || lower.includes('session cache'),
      'Step 7b must reference in-memory or session cache context'
    );
  });

  // TC-03.2 [P0]: No dispatch prompt re-serialization in step 7a (negative)
  // Traces: FR-003, AC-003-01
  it('TC-03.2 [P0]: No dispatch prompt re-serialization in step 7a', () => {
    const content = readFile(ISDLC_MD_PATH);
    const step7aContent = extractStepSection(content, '7a\\.');

    // Must NOT contain PERSONA_CONTEXT serialization block
    assert.ok(
      !step7aContent.includes('PERSONA_CONTEXT:'),
      'Step 7a must NOT contain PERSONA_CONTEXT serialization'
    );

    // Must NOT contain TOPIC_CONTEXT serialization block
    assert.ok(
      !step7aContent.includes('TOPIC_CONTEXT:'),
      'Step 7a must NOT contain TOPIC_CONTEXT serialization'
    );

    // Must NOT contain DISCOVERY_CONTEXT serialization block for dispatch
    assert.ok(
      !step7aContent.includes('DISCOVERY_CONTEXT:'),
      'Step 7a must NOT contain DISCOVERY_CONTEXT serialization'
    );

    // Must NOT contain MEMORY_CONTEXT serialization block for dispatch
    assert.ok(
      !step7aContent.includes('MEMORY_CONTEXT:'),
      'Step 7a must NOT contain MEMORY_CONTEXT serialization'
    );
  });

  // TC-03.3 [P1]: No redundant Read tool calls - context already available
  // Traces: FR-003, AC-003-02
  it('TC-03.3 [P1]: Explicit statement that context is already in memory', () => {
    const content = readFile(ISDLC_MD_PATH);
    const step7bContent = extractStepSection(content, '7b\\.');
    const lower = step7bContent.toLowerCase();

    // Must state context is already available from earlier steps
    assert.ok(
      lower.includes('already in memory') || lower.includes('no reads needed') ||
      lower.includes('from step') || lower.includes('from earlier'),
      'Step 7b must state context is already in memory from earlier steps'
    );
  });
});

// =============================================================================
// TG-04: Protocol Reference Headers (FR-006)
// Traces to: FR-006, AC-006-01, AC-006-02
// =============================================================================

describe('TG-04: Protocol Reference Headers (FR-006)', () => {

  // TC-04.1 [P0]: Roundtable-analyst.md has protocol reference header
  // Traces: FR-006, AC-006-01
  it('TC-04.1 [P0]: roundtable-analyst.md has protocol reference header', () => {
    const content = readFile(ROUNDTABLE_MD_PATH);

    assert.ok(
      content.includes('protocol reference'),
      'roundtable-analyst.md must contain "protocol reference" in header'
    );

    assert.ok(
      content.includes('NOT spawned') || content.includes('is NOT spawned') ||
      content.includes('not spawned') || content.includes('NOT spawned as'),
      'roundtable-analyst.md must indicate it is NOT spawned as an agent'
    );
  });

  // TC-04.2 [P0]: Bug-gather-analyst.md has protocol reference header
  // Traces: FR-006, AC-006-02
  it('TC-04.2 [P0]: bug-gather-analyst.md has protocol reference header', () => {
    const content = readFile(BUG_GATHER_MD_PATH);

    assert.ok(
      content.includes('protocol reference'),
      'bug-gather-analyst.md must contain "protocol reference" in header'
    );

    assert.ok(
      content.includes('NOT spawned') || content.includes('is NOT spawned') ||
      content.includes('not spawned') || content.includes('NOT spawned as'),
      'bug-gather-analyst.md must indicate it is NOT spawned as an agent'
    );
  });

  // TC-04.3 [P1]: Roundtable header mentions inline execution by isdlc.md
  // Traces: FR-006, AC-006-01
  it('TC-04.3 [P1]: roundtable-analyst.md header mentions isdlc.md and inline', () => {
    const content = readFile(ROUNDTABLE_MD_PATH);

    assert.ok(
      content.includes('isdlc.md'),
      'roundtable-analyst.md header must mention isdlc.md'
    );

    assert.ok(
      content.includes('inline'),
      'roundtable-analyst.md header must mention inline execution'
    );
  });

  // TC-04.4 [P1]: Bug-gather header mentions inline execution by isdlc.md
  // Traces: FR-006, AC-006-02
  it('TC-04.4 [P1]: bug-gather-analyst.md header mentions isdlc.md and inline', () => {
    const content = readFile(BUG_GATHER_MD_PATH);

    assert.ok(
      content.includes('isdlc.md'),
      'bug-gather-analyst.md header must mention isdlc.md'
    );

    assert.ok(
      content.includes('inline'),
      'bug-gather-analyst.md header must mention inline execution'
    );
  });
});

// =============================================================================
// TG-05: Inline Memory Write-Back (FR-007)
// Traces to: FR-007, AC-007-01
// =============================================================================

describe('TG-05: Inline Memory Write-Back (FR-007)', () => {

  // TC-05.1 [P0]: Step 7.5a constructs session record from in-memory state
  // Traces: FR-007, AC-007-01
  it('TC-05.1 [P0]: Step 7.5a constructs session record from in-memory state', () => {
    const content = readFile(ISDLC_MD_PATH);
    const step75aContent = extractStepSection(content, '7\\.5a\\.');
    const lower = step75aContent.toLowerCase();

    // Must reference in-memory construction
    assert.ok(
      lower.includes('in-memory') || lower.includes('in memory'),
      'Step 7.5a must reference in-memory session record construction'
    );

    // Must reference session record or writeSessionRecord
    assert.ok(
      lower.includes('session record') || lower.includes('writesessionrecord'),
      'Step 7.5a must reference session record or writeSessionRecord'
    );
  });

  // TC-05.2 [P0]: No SESSION_RECORD parsing from agent output (negative)
  // Traces: FR-007, AC-007-01
  it('TC-05.2 [P0]: No SESSION_RECORD parsing from agent output in step 7.5a', () => {
    const content = readFile(ISDLC_MD_PATH);
    const step75aContent = extractStepSection(content, '7\\.5a\\.');

    assert.ok(
      !step75aContent.includes('Parse the SESSION_RECORD JSON block from the roundtable'),
      'Step 7.5a must NOT contain SESSION_RECORD parsing from roundtable output'
    );

    assert.ok(
      !step75aContent.includes("Parse the SESSION_RECORD"),
      'Step 7.5a must NOT reference parsing SESSION_RECORD'
    );
  });
});

// =============================================================================
// TG-06: Cross-File Consistency (Integration)
// Traces to: FR-001, FR-002, FR-006, Architecture constraints
// =============================================================================

describe('TG-06: Cross-File Consistency (Integration)', () => {

  // TC-06.1 [P0]: isdlc.md references reading roundtable-analyst.md
  // Traces: FR-001, FR-006
  it('TC-06.1 [P0]: isdlc.md references reading roundtable-analyst.md', () => {
    const content = readFile(ISDLC_MD_PATH);

    // Must contain roundtable-analyst.md in Read context
    assert.ok(
      content.includes('roundtable-analyst.md') && content.includes('Read'),
      'isdlc.md must reference reading roundtable-analyst.md'
    );
  });

  // TC-06.2 [P0]: isdlc.md references reading bug-roundtable-analyst.md
  // Traces: FR-002, FR-006
  // REQ-GH-218 renamed bug-gather-analyst.md to bug-roundtable-analyst.md. Semantic
  // contract preserved: isdlc.md reads the bug protocol file with Read tool.
  it('TC-06.2 [P0]: isdlc.md references reading bug-roundtable-analyst.md', () => {
    const content = readFile(ISDLC_MD_PATH);

    // Must contain bug-roundtable-analyst.md in Read context
    assert.ok(
      content.includes('bug-roundtable-analyst.md') && content.includes('Read'),
      'isdlc.md must reference reading bug-roundtable-analyst.md'
    );
  });

  // TC-06.3 [P0]: roundtable-analyst.md mentions Execution mode
  // Traces: FR-006, AC-006-01
  it('TC-06.3 [P0]: roundtable-analyst.md mentions Execution mode', () => {
    const content = readFile(ROUNDTABLE_MD_PATH);

    assert.ok(
      content.includes('Execution mode'),
      'roundtable-analyst.md must contain "Execution mode" label in header'
    );
  });

  // TC-06.4 [P0]: bug-gather-analyst.md mentions Execution mode
  // Traces: FR-006, AC-006-02
  it('TC-06.4 [P0]: bug-gather-analyst.md mentions Execution mode', () => {
    const content = readFile(BUG_GATHER_MD_PATH);

    assert.ok(
      content.includes('Execution mode'),
      'bug-gather-analyst.md must contain "Execution mode" label in header'
    );
  });

  // TC-06.5 [P0]: No new dependencies added
  // Traces: NFR (Article V)
  it('TC-06.5 [P0]: No new runtime dependencies added', () => {
    const pkg = JSON.parse(readFile(PACKAGE_JSON_PATH));
    const deps = Object.keys(pkg.dependencies || {}).sort();

    // Expected dependencies (snapshot from before REQ-0065)
    const expectedDeps = [
      'chalk',
      'fs-extra',
      'js-yaml',
      'onnxruntime-node',
      'prompts',
      'semver'
    ];

    assert.deepStrictEqual(
      deps,
      expectedDeps,
      'Runtime dependencies must not change for REQ-0065 (prompt-only changes)'
    );
  });

  // TC-06.6 [P1]: All 3 target files exist and are non-empty
  // Traces: Architecture constraint
  it('TC-06.6 [P1]: All 3 target files exist and are non-empty', () => {
    const files = [ISDLC_MD_PATH, ROUNDTABLE_MD_PATH, BUG_GATHER_MD_PATH];

    for (const filePath of files) {
      assert.ok(
        existsSync(filePath),
        `Target file must exist: ${filePath}`
      );

      const content = readFile(filePath);
      assert.ok(
        content.length > 0,
        `Target file must be non-empty: ${filePath}`
      );
    }
  });
});

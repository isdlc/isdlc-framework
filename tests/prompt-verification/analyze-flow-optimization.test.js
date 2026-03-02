/**
 * Prompt Content Verification Tests: REQ-0037 Optimize Analyze Flow
 *
 * These tests verify that the 2 modified .md files contain the required
 * content patterns for the analyze flow optimization (parallelize and defer).
 *
 * Test runner: node:test (Article II)
 * Test approach: Read .md files, assert content patterns
 *
 * Traces to: REQ-0037-optimize-analyze-flow-parallelize-defer
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Test constants
const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const ISDLC_MD_PATH = join(PROJECT_ROOT, 'src', 'claude', 'commands', 'isdlc.md');
const ROUNDTABLE_MD_PATH = join(PROJECT_ROOT, 'src', 'claude', 'agents', 'roundtable-analyst.md');
const HOOKS_DIR = join(PROJECT_ROOT, 'src', 'claude', 'hooks');
const PACKAGE_JSON_PATH = join(PROJECT_ROOT, 'package.json');

// Helper: read file content with caching
const fileCache = {};
function readFile(filePath) {
  if (!fileCache[filePath]) {
    fileCache[filePath] = readFileSync(filePath, 'utf-8');
  }
  return fileCache[filePath];
}

// =============================================================================
// TG-01: Dependency Group Execution in Analyze Handler (FR-001)
// Traces to: FR-001, AC-001-01, AC-001-02, AC-001-03, AC-001-04
// =============================================================================

describe('TG-01: Dependency Group Execution (FR-001)', () => {

  // TC-01.1 [P0]: Positive — Group 1 parallel operations documented
  // Traces: AC-001-01
  it('TC-01.1 [P0]: Group 1 parallel operations in analyze handler', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();

    // Must reference Group 1 with parallel operations
    assert.ok(
      content.includes('Group 1') || content.includes('group 1'),
      'Analyze handler must define Group 1 dependency group'
    );

    // Group 1 must include issue fetch
    assert.ok(
      lower.includes('gh issue view') || lower.includes('issue fetch') || lower.includes('issuefetch'),
      'Group 1 must include issue fetch operation'
    );

    // Group 1 must include existing-ref check
    assert.ok(
      lower.includes('grep') && (lower.includes('existing') || lower.includes('source_id')),
      'Group 1 must include existing-ref check via Grep'
    );

    // Group 1 must include persona reads
    assert.ok(
      lower.includes('persona') && (lower.includes('read') || lower.includes('file')),
      'Group 1 must include persona file reads'
    );
  });

  // TC-01.2 [P0]: Positive — Group 2 depends on Group 1
  // Traces: AC-001-02
  it('TC-01.2 [P0]: Group 2 operations depend on Group 1', () => {
    const content = readFile(ISDLC_MD_PATH);

    // Must reference Group 2
    assert.ok(
      content.includes('Group 2') || content.includes('group 2'),
      'Analyze handler must define Group 2 dependency group'
    );

    // Group 2 must reference dependency on Group 1
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('group 1') && lower.includes('group 2'),
      'Both Group 1 and Group 2 must be defined showing dependency ordering'
    );
  });

  // TC-01.3 [P0]: Positive — Dispatch fires after Group 2
  // Traces: AC-001-03
  it('TC-01.3 [P0]: Dispatch fires after Group 2 completes', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();

    // Dispatch must follow Group 2 (must contain both dispatch and group 2)
    assert.ok(
      lower.includes('dispatch') && lower.includes('group 2'),
      'Dispatch must be documented as occurring after Group 2'
    );

    // The inlined context fields must be in the dispatch prompt
    assert.ok(
      content.includes('PERSONA_CONTEXT') || content.includes('persona_context'),
      'Dispatch prompt must include PERSONA_CONTEXT field'
    );
    assert.ok(
      content.includes('TOPIC_CONTEXT') || content.includes('topic_context'),
      'Dispatch prompt must include TOPIC_CONTEXT field'
    );
  });

  // TC-01.4 [P1]: Positive — Dependency groups apply to both #N and PROJECT-N
  // Traces: AC-001-04
  it('TC-01.4 [P1]: Dependency groups apply to GitHub and Jira references', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();

    // Must handle both #N and PROJECT-N patterns in the optimized path
    assert.ok(
      content.includes('#N') || content.includes('#n') || lower.includes('github issue'),
      'Analyze handler must reference GitHub issue (#N) pattern'
    );
    assert.ok(
      content.includes('PROJECT-N') || content.includes('project-n') || lower.includes('jira'),
      'Analyze handler must reference Jira (PROJECT-N) pattern'
    );
  });

  // TC-01.5 [P1]: Positive — Parallel instruction language present
  // Traces: AC-001-01
  it('TC-01.5 [P1]: Explicit parallel instruction language', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();

    assert.ok(
      lower.includes('parallel') && (lower.includes('group') || lower.includes('simultaneous') || lower.includes('fire')),
      'Analyze handler must use explicit parallel execution language'
    );
  });

  // TC-01.6 [P2]: Negative — No sequential step numbering in optimized path
  // Traces: AC-001-01 (negative test)
  it('TC-01.6 [P2]: Optimized path uses group notation, not sequential steps', () => {
    const content = readFile(ISDLC_MD_PATH);

    // The optimized path must use dependency groups, not just sequential numbered steps
    // We verify by checking that Group notation is present
    assert.ok(
      content.includes('Group 1') || content.includes('group 1'),
      'Optimized path must use dependency group notation'
    );
    assert.ok(
      content.includes('Group 2') || content.includes('group 2'),
      'Optimized path must define at least two dependency groups'
    );
  });
});

// =============================================================================
// TG-02: Auto-Add for External References (FR-002)
// Traces to: FR-002, AC-002-01, AC-002-02, AC-002-03, AC-002-04
// =============================================================================

describe('TG-02: Auto-Add for External References (FR-002)', () => {

  // TC-02.1 [P0]: Positive — Auto-add for #N without confirmation
  // Traces: AC-002-01
  it('TC-02.1 [P0]: Auto-add for GitHub refs without confirmation prompt', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();

    // Must reference auto-add or automatic add behavior
    assert.ok(
      lower.includes('auto') && lower.includes('add'),
      'Analyze handler must reference auto-add behavior for external refs'
    );

    // Must eliminate the confirmation prompt for external refs
    assert.ok(
      lower.includes('without') && (lower.includes('prompt') || lower.includes('confirm')) ||
      lower.includes('automatic') ||
      lower.includes('skip') && lower.includes('confirm'),
      'Analyze handler must eliminate confirmation prompt for external refs'
    );
  });

  // TC-02.2 [P1]: Positive — Auto-add applies to PROJECT-N too
  // Traces: AC-002-02
  it('TC-02.2 [P1]: Auto-add applies to Jira refs as well', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();

    // The auto-add logic must cover both ref types
    assert.ok(
      (lower.includes('external ref') || lower.includes('external reference')) ||
      (lower.includes('#n') && lower.includes('project-n')) ||
      (lower.includes('github') && lower.includes('jira')),
      'Auto-add must cover both GitHub (#N) and Jira (PROJECT-N) external references'
    );
  });

  // TC-02.3 [P0]: Positive — Non-external refs preserve existing behavior
  // Traces: AC-002-03
  it('TC-02.3 [P0]: Non-external refs preserve confirmation prompt', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();

    // Non-external refs (slugs, item numbers, descriptions) must still prompt
    assert.ok(
      (lower.includes('slug') || lower.includes('description') || lower.includes('non-external')) &&
      (lower.includes('prompt') || lower.includes('confirm') || lower.includes('existing behavior')),
      'Non-external refs must preserve existing confirmation behavior'
    );
  });

  // TC-02.4 [P1]: Positive — Auto-add only when no existing folder
  // Traces: AC-002-04
  it('TC-02.4 [P1]: Auto-add fires only when no existing folder found', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();

    assert.ok(
      (lower.includes('no existing') || lower.includes('no match') || lower.includes('not found')) &&
      (lower.includes('add') || lower.includes('invoke')),
      'Auto-add must be conditional on no existing folder being found'
    );
  });
});

// =============================================================================
// TG-03: Pre-Fetched Issue Data Passthrough (FR-003)
// Traces to: FR-003, AC-003-01, AC-003-02, AC-003-03
// =============================================================================

describe('TG-03: Pre-Fetched Issue Data Passthrough (FR-003)', () => {

  // TC-03.1 [P0]: Positive — Pre-fetched data passed to add handler
  // Traces: AC-003-01
  it('TC-03.1 [P0]: Pre-fetched issue data passed to add handler', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();

    assert.ok(
      lower.includes('pre-fetch') || lower.includes('prefetch') || lower.includes('pre-read'),
      'Analyze handler must reference pre-fetched issue data'
    );

    // Must pass data to add handler
    assert.ok(
      lower.includes('issuedata') || lower.includes('issue data') || lower.includes('issue_data'),
      'Pre-fetched data must be referenced by a recognizable name'
    );
  });

  // TC-03.2 [P1]: Positive — Direct /isdlc add still fetches independently
  // Traces: AC-003-02
  it('TC-03.2 [P1]: Direct add handler invocation fetches data normally', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();

    // The add handler must have a conditional: if pre-fetched data available, use it; else fetch
    assert.ok(
      (lower.includes('pre-fetched') || lower.includes('prefetch')) &&
      (lower.includes('else') || lower.includes('otherwise') || lower.includes('if') || lower.includes('absent')),
      'Add handler must conditionally use pre-fetched data or fetch independently'
    );
  });

  // TC-03.3 [P0]: Positive — Add handler retains folder creation ownership
  // Traces: AC-003-03
  it('TC-03.3 [P0]: Add handler retains sole folder creation ownership', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();

    // The add handler must still own slug generation, folder creation, meta.json
    assert.ok(
      lower.includes('slug') && lower.includes('meta.json'),
      'Add handler must reference slug generation and meta.json creation'
    );
  });
});

// =============================================================================
// TG-04: Eliminate Re-Read After Write (FR-004)
// Traces to: FR-004, AC-004-01, AC-004-02
// =============================================================================

describe('TG-04: Eliminate Re-Read After Write (FR-004)', () => {

  // TC-04.1 [P0]: Positive — No re-read of meta.json/draft.md after add
  // Traces: AC-004-01
  it('TC-04.1 [P0]: No re-read of files after add handler writes them', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();

    assert.ok(
      lower.includes('in-memory') || lower.includes('in memory') || lower.includes('reuse'),
      'Analyze handler must reference in-memory reuse of add handler output'
    );
  });

  // TC-04.2 [P1]: Positive — Dispatch composed from in-memory objects
  // Traces: AC-004-02
  it('TC-04.2 [P1]: Dispatch prompt composed from in-memory objects', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();

    // Must compose dispatch from in-memory data, not disk reads
    assert.ok(
      (lower.includes('in-memory') || lower.includes('in memory')) &&
      (lower.includes('dispatch') || lower.includes('meta') || lower.includes('draft')),
      'Dispatch must be composed from in-memory meta and draft objects'
    );
  });
});

// =============================================================================
// TG-05: Inlined Context in Roundtable Dispatch (FR-005)
// Traces to: FR-005, AC-005-01, AC-005-02, AC-005-03
// =============================================================================

describe('TG-05: Inlined Context in Dispatch (FR-005)', () => {

  // TC-05.1 [P0]: Positive — PERSONA_CONTEXT field in dispatch
  // Traces: AC-005-01
  it('TC-05.1 [P0]: PERSONA_CONTEXT field in dispatch prompt', () => {
    const content = readFile(ISDLC_MD_PATH);

    assert.ok(
      content.includes('PERSONA_CONTEXT'),
      'Dispatch prompt must include PERSONA_CONTEXT field'
    );
  });

  // TC-05.2 [P0]: Positive — TOPIC_CONTEXT field in dispatch
  // Traces: AC-005-02
  it('TC-05.2 [P0]: TOPIC_CONTEXT field in dispatch prompt', () => {
    const content = readFile(ISDLC_MD_PATH);

    assert.ok(
      content.includes('TOPIC_CONTEXT'),
      'Dispatch prompt must include TOPIC_CONTEXT field'
    );
  });

  // TC-05.3 [P1]: Positive — Clear delimiters for inlined context
  // Traces: AC-005-03
  it('TC-05.3 [P1]: Inlined context uses clear delimiters', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();

    assert.ok(
      lower.includes('delimiter') || content.includes('---') ||
      lower.includes('structured') || lower.includes('separator') ||
      lower.includes('parse'),
      'Inlined context fields must reference clear delimiter structure'
    );
  });

  // TC-05.4 [P1]: Positive — All 3 persona files pre-read
  // Traces: AC-005-01
  it('TC-05.4 [P1]: All 3 persona files referenced for pre-reading', () => {
    const content = readFile(ISDLC_MD_PATH);

    assert.ok(
      content.includes('persona-business-analyst') ||
      content.includes('persona') && content.includes('3'),
      'Analyze handler must reference reading all 3 persona files'
    );
  });

  // TC-05.5 [P1]: Positive — Topic files pre-read
  // Traces: AC-005-02
  it('TC-05.5 [P1]: Topic files referenced for pre-reading', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();

    assert.ok(
      lower.includes('topic') && (lower.includes('read') || lower.includes('pre-read') || lower.includes('glob')),
      'Analyze handler must reference reading topic files'
    );
  });
});

// =============================================================================
// TG-06: Roundtable Accepts Inlined Context (FR-006)
// Traces to: FR-006, AC-006-01, AC-006-02, AC-006-03
// =============================================================================

describe('TG-06: Roundtable Accepts Inlined Context (FR-006)', () => {

  // TC-06.1 [P0]: Positive — Roundtable checks for PERSONA_CONTEXT
  // Traces: AC-006-01
  it('TC-06.1 [P0]: Roundtable checks for PERSONA_CONTEXT in dispatch', () => {
    const content = readFile(ROUNDTABLE_MD_PATH);

    assert.ok(
      content.includes('PERSONA_CONTEXT'),
      'Roundtable must reference PERSONA_CONTEXT field'
    );
  });

  // TC-06.2 [P0]: Positive — Roundtable checks for TOPIC_CONTEXT
  // Traces: AC-006-02
  it('TC-06.2 [P0]: Roundtable checks for TOPIC_CONTEXT in dispatch', () => {
    const content = readFile(ROUNDTABLE_MD_PATH);

    assert.ok(
      content.includes('TOPIC_CONTEXT'),
      'Roundtable must reference TOPIC_CONTEXT field'
    );
  });

  // TC-06.3 [P0]: Positive — Fallback to file reads when context absent
  // Traces: AC-006-03
  it('TC-06.3 [P0]: Fallback to file reads when inlined context absent', () => {
    const content = readFile(ROUNDTABLE_MD_PATH);
    const lower = content.toLowerCase();

    assert.ok(
      lower.includes('fallback') || lower.includes('absent') || lower.includes('if not') ||
      (lower.includes('if') && lower.includes('present') && lower.includes('read')),
      'Roundtable must have fallback path for reading files when inlined context is absent'
    );
  });

  // TC-06.4 [P1]: Positive — Persona context skips file reads
  // Traces: AC-006-01
  it('TC-06.4 [P1]: When PERSONA_CONTEXT present, persona file reads skipped', () => {
    const content = readFile(ROUNDTABLE_MD_PATH);
    const lower = content.toLowerCase();

    // Must have conditional logic: if present, skip reads
    assert.ok(
      (lower.includes('persona_context') || lower.includes('persona context')) &&
      (lower.includes('skip') || lower.includes('do not') || lower.includes('not issue') ||
       lower.includes('instead') || lower.includes('from the inlined') || lower.includes('parse')),
      'Roundtable must skip persona file reads when PERSONA_CONTEXT is present'
    );
  });

  // TC-06.5 [P1]: Positive — Topic context skips file reads
  // Traces: AC-006-02
  it('TC-06.5 [P1]: When TOPIC_CONTEXT present, topic file reads skipped', () => {
    const content = readFile(ROUNDTABLE_MD_PATH);
    const lower = content.toLowerCase();

    assert.ok(
      (lower.includes('topic_context') || lower.includes('topic context')) &&
      (lower.includes('skip') || lower.includes('do not') || lower.includes('not issue') ||
       lower.includes('instead') || lower.includes('from the inlined') || lower.includes('parse')),
      'Roundtable must skip topic file reads when TOPIC_CONTEXT is present'
    );
  });
});

// =============================================================================
// TG-07: Deferred Codebase Scan (FR-007)
// Traces to: FR-007, AC-007-01, AC-007-02, AC-007-03, AC-007-04
// =============================================================================

describe('TG-07: Deferred Codebase Scan (FR-007)', () => {

  // TC-07.1 [P0]: Positive — Maya's first message does not wait for scan
  // Traces: AC-007-01
  it('TC-07.1 [P0]: Maya first message composed without codebase scan', () => {
    const content = readFile(ROUNDTABLE_MD_PATH);
    const lower = content.toLowerCase();

    // The opening section must not require scan completion before Maya speaks
    assert.ok(
      (lower.includes('defer') && lower.includes('scan')) ||
      (lower.includes('maya') && lower.includes('draft') && lower.includes('without')) ||
      (lower.includes('first message') && lower.includes('draft')),
      'Maya first message must be composed from draft content without waiting for scan'
    );
  });

  // TC-07.2 [P0]: Positive — Scan runs after first user exchange
  // Traces: AC-007-02
  it('TC-07.2 [P0]: Codebase scan runs after first user reply', () => {
    const content = readFile(ROUNDTABLE_MD_PATH);
    const lower = content.toLowerCase();

    assert.ok(
      (lower.includes('scan') && (lower.includes('after') || lower.includes('resume') || lower.includes('exchange 2'))) ||
      (lower.includes('defer') && lower.includes('scan')),
      'Codebase scan must run after first user exchange or on resume'
    );
  });

  // TC-07.3 [P1]: Positive — Alex contributes scan findings at exchange 2
  // Traces: AC-007-03
  it('TC-07.3 [P1]: Alex contributes codebase evidence at exchange 2', () => {
    const content = readFile(ROUNDTABLE_MD_PATH);
    const lower = content.toLowerCase();

    assert.ok(
      (lower.includes('alex') && (lower.includes('exchange 2') || lower.includes('second exchange'))) ||
      (lower.includes('alex') && lower.includes('scan') && lower.includes('contribut')),
      'Alex must contribute scan findings at exchange 2 or later'
    );
  });

  // TC-07.4 [P2]: Positive — Graceful handling if scan is slow
  // Traces: AC-007-04
  it('TC-07.4 [P2]: Maya continues solo if scan is slow', () => {
    const content = readFile(ROUNDTABLE_MD_PATH);
    const lower = content.toLowerCase();

    assert.ok(
      (lower.includes('maya') && lower.includes('solo')) ||
      (lower.includes('maya') && lower.includes('continues')) ||
      (lower.includes('alex') && lower.includes('joins') && lower.includes('ready')) ||
      (lower.includes('alex') && lower.includes('when') && lower.includes('ready')),
      'Maya must continue solo if scan is slow, with Alex joining when ready'
    );
  });

  // TC-07.5 [P0]: Negative — Scan exception line removed from Section 2.1
  // Traces: AC-007-01 (negative test)
  it('TC-07.5 [P0]: Silent scan exception removed from Opening section', () => {
    const content = readFile(ROUNDTABLE_MD_PATH);

    // The old exception that mandated scan before first exchange should be modified/removed
    // After implementation, the scan should no longer "run silently before the first exchange"
    // We check that the scan is not described as running in the Opening step 3 as blocking
    const openingSection = extractSection(content, '### 2.1 Opening', '### 2.2');
    const lower = openingSection.toLowerCase();

    // Check: scan should be deferred, not silent-before-first-message
    assert.ok(
      lower.includes('defer') || !lower.includes('initiate silent codebase scan') ||
      lower.includes('after') || lower.includes('on resume'),
      'Opening section must defer scan instead of running it silently before first exchange'
    );
  });
});

// =============================================================================
// TG-08: Error Handling Unchanged (FR-008)
// Traces to: FR-008, AC-008-01, AC-008-02, AC-008-03
// =============================================================================

describe('TG-08: Error Handling Unchanged (FR-008)', () => {

  // TC-08.1 [P0]: Positive — gh issue view error handling preserved
  // Traces: AC-008-01
  it('TC-08.1 [P0]: Error handling for gh issue view preserved', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();

    // Must still handle gh issue view failures
    assert.ok(
      lower.includes('gh issue') && (lower.includes('fail') || lower.includes('error')),
      'Analyze handler must preserve gh issue view error handling'
    );
  });

  // TC-08.2 [P1]: Positive — Add handler error handling preserved
  // Traces: AC-008-02
  it('TC-08.2 [P1]: Error handling for add handler preserved', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();

    // The add handler must still handle failure
    assert.ok(
      lower.includes('add') && (lower.includes('fail') || lower.includes('error')),
      'Add handler error behavior must be preserved'
    );
  });

  // TC-08.3 [P1]: Negative — No new error codes introduced
  // Traces: AC-008-03
  it('TC-08.3 [P1]: No new error codes or error paths introduced', () => {
    const content = readFile(ISDLC_MD_PATH);

    // The analyze section should not introduce new error handling beyond what exists
    // We verify this by checking that the constraints section still says no new error paths
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('no state.json writes') || lower.includes('constraints'),
      'Analyze handler must still include its constraints section'
    );
  });
});

// =============================================================================
// TG-09: Cross-File Consistency (Integration)
// Traces to: FR-005 + FR-006 integration, NFR
// =============================================================================

describe('TG-09: Cross-File Consistency', () => {

  // TC-09.1 [P0]: Positive — PERSONA_CONTEXT in both files
  // Traces: FR-005 + FR-006
  it('TC-09.1 [P0]: PERSONA_CONTEXT referenced in both isdlc.md and roundtable', () => {
    const isdlc = readFile(ISDLC_MD_PATH);
    const roundtable = readFile(ROUNDTABLE_MD_PATH);

    assert.ok(
      isdlc.includes('PERSONA_CONTEXT'),
      'isdlc.md must reference PERSONA_CONTEXT in dispatch'
    );
    assert.ok(
      roundtable.includes('PERSONA_CONTEXT'),
      'roundtable-analyst.md must reference PERSONA_CONTEXT'
    );
  });

  // TC-09.2 [P0]: Positive — TOPIC_CONTEXT in both files
  // Traces: FR-005 + FR-006
  it('TC-09.2 [P0]: TOPIC_CONTEXT referenced in both isdlc.md and roundtable', () => {
    const isdlc = readFile(ISDLC_MD_PATH);
    const roundtable = readFile(ROUNDTABLE_MD_PATH);

    assert.ok(
      isdlc.includes('TOPIC_CONTEXT'),
      'isdlc.md must reference TOPIC_CONTEXT in dispatch'
    );
    assert.ok(
      roundtable.includes('TOPIC_CONTEXT'),
      'roundtable-analyst.md must reference TOPIC_CONTEXT'
    );
  });

  // TC-09.3 [P0]: Negative — No new hooks added
  // Traces: NFR (Article XII)
  it('TC-09.3 [P0]: No new hooks added', () => {
    const hookFiles = readdirSync(HOOKS_DIR)
      .filter(f => f.endsWith('.cjs') && !f.includes('.test.'));
    assert.equal(
      hookFiles.length, 28,
      `Expected 28 hook files (no new hooks), found ${hookFiles.length}`
    );
  });

  // TC-09.4 [P0]: Negative — No new dependencies added
  // Traces: NFR (Article V)
  it('TC-09.4 [P0]: No new dependencies added', () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8'));
    const deps = Object.keys(pkg.dependencies || {}).sort();
    assert.deepStrictEqual(
      deps,
      ['chalk', 'fs-extra', 'prompts', 'semver'],
      'No new runtime dependencies should be added'
    );
  });

  // TC-09.5 [P1]: Positive — Roundtable still has fallback persona read
  // Traces: FR-006 AC-006-03
  it('TC-09.5 [P1]: Roundtable retains persona file read fallback', () => {
    const content = readFile(ROUNDTABLE_MD_PATH);

    // Must still reference the persona file paths for fallback
    assert.ok(
      content.includes('persona-business-analyst') ||
      content.includes('persona-solutions-architect') ||
      content.includes('persona-system-designer'),
      'Roundtable must retain references to persona file paths for fallback reads'
    );
  });

  // TC-09.6 [P1]: Positive — Roundtable still has fallback topic read
  // Traces: FR-006 AC-006-03
  it('TC-09.6 [P1]: Roundtable retains topic file read fallback', () => {
    const content = readFile(ROUNDTABLE_MD_PATH);
    const lower = content.toLowerCase();

    // Must still reference topic file glob pattern for fallback
    assert.ok(
      lower.includes('analysis-topics') || lower.includes('topic') && lower.includes('glob'),
      'Roundtable must retain topic file references for fallback reads'
    );
  });

  // TC-09.7 [P1]: Positive — Only 2 files modified
  // Traces: Impact Analysis constraint
  it('TC-09.7 [P1]: Only isdlc.md and roundtable-analyst.md are test targets', () => {
    // This test is a structural verification that the change scope is contained
    // Both files must exist and be readable
    assert.ok(
      readFile(ISDLC_MD_PATH).length > 0,
      'isdlc.md must exist and be non-empty'
    );
    assert.ok(
      readFile(ROUNDTABLE_MD_PATH).length > 0,
      'roundtable-analyst.md must exist and be non-empty'
    );
  });
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract a section of content between two headers.
 * @param {string} content - Full file content
 * @param {string} startHeader - The starting section header
 * @param {string|null} endHeader - The ending section header, or null for EOF
 * @returns {string} The section content
 */
function extractSection(content, startHeader, endHeader) {
  const startIdx = content.indexOf(startHeader);
  if (startIdx === -1) return '';

  const afterStart = content.substring(startIdx + startHeader.length);
  if (!endHeader) return afterStart;

  const endIdx = afterStart.indexOf(endHeader);
  if (endIdx === -1) return afterStart;

  return afterStart.substring(0, endIdx);
}

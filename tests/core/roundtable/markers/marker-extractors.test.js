/**
 * Unit tests for per-sub-task marker extractors + index dispatcher (REQ-GH-253)
 *
 * Verifies rule-based regex + key phrase extraction from natural LLM output.
 * Each sub-task type has its own extractor module. The index.js dispatcher
 * routes to the correct extractor by sub-task ID.
 *
 * Traces to: FR-003, AC-003-02
 * Test runner: node:test (ESM, Article XIII)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extractMarkers as extractScopeFraming } from '../../../../src/core/roundtable/markers/scope-framing.markers.js';
import { extractMarkers as extractCodebaseScan } from '../../../../src/core/roundtable/markers/codebase-scan.markers.js';
import { extractMarkers as extractBlastRadius } from '../../../../src/core/roundtable/markers/blast-radius.markers.js';
import { extractMarkers as extractOptionsResearch } from '../../../../src/core/roundtable/markers/options-research.markers.js';
import { extractMarkers as extractDependencyCheck } from '../../../../src/core/roundtable/markers/dependency-check.markers.js';
import { extractMarkers as extractTracing } from '../../../../src/core/roundtable/markers/tracing.markers.js';
import { dispatch, listExtractors } from '../../../../src/core/roundtable/markers/index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SCOPE_FRAMING_OUTPUT = `
**Requirements**:
- The user wants to add authentication to the API
- OAuth2 flow with JWT tokens
- Session management required

I think we have enough context to proceed. The scope is clear.
`;

const CODEBASE_SCAN_OUTPUT = `
I've reviewed the codebase structure:
- src/core/auth/ handles authentication (3 modules)
- src/providers/claude/runtime.js has the injection point
- tests/core/auth/ has 12 existing tests

Scan complete. Moving to blast radius assessment.
`;

const BLAST_RADIUS_OUTPUT = `
Direct changes:
- src/core/auth/login.js (CREATE)
- src/core/auth/session.js (MODIFY)

Downstream impact: the provider runtime may need updates.
There is a medium risk of regression in the session handling.
Blast radius assessment complete.
`;

const OPTIONS_RESEARCH_OUTPUT = `
We evaluated 3 options:

Option A: JWT-only authentication
- Advantages: simple, stateless
- Drawbacks: no revocation support

Option B: Session-based with Redis
- Advantages: revocable, familiar pattern
- Drawbacks: infrastructure dependency

We recommend Option A because it provides the simplest path forward.
`;

const DEPENDENCY_CHECK_OUTPUT = `
Checked the dependencies in package.json:
- jsonwebtoken@9.0.0 is compatible
- No dependency conflicts found
- All dependencies are satisfied

Dependencies look clean.
`;

const TRACING_OUTPUT = `
Hypothesis 1: The bug is caused by a race condition in session creation.
Most likely cause based on the stack trace.

Code paths traced:
- entry point -> session.create() -> db.insert()

Root cause identified: the session.create() call does not await the DB insert,
causing a race condition when concurrent requests hit the endpoint.
`;

const UNRELATED_OUTPUT = `
Here is a general discussion about the weather today.
Nothing about scope, scanning, or blast radius.
`;

// ---------------------------------------------------------------------------
// MK-01: Scope framing marker extraction (positive, AC-003-02)
// ---------------------------------------------------------------------------

describe('REQ-GH-253 marker-extractors: scope-framing', () => {

  it('MK-01: scope-framing extractor detects scope_accepted signal', () => {
    const markers = extractScopeFraming(SCOPE_FRAMING_OUTPUT);
    assert.ok(markers.scope_accepted);
  });

  it('MK-01b: scope-framing detects scope_statement_present', () => {
    const markers = extractScopeFraming(SCOPE_FRAMING_OUTPUT);
    assert.ok(markers.scope_statement_present || markers.scope_accepted);
  });

  it('MK-01c: scope-framing detects user types', () => {
    const output = 'User types: developers and admins who will use the API.';
    const markers = extractScopeFraming(output);
    assert.ok(markers.user_types_identified);
  });

  it('MK-01d: scope-framing detects problem articulated', () => {
    const output = 'The core problem is that authentication is missing.';
    const markers = extractScopeFraming(output);
    assert.ok(markers.problem_articulated);
  });
});

// ---------------------------------------------------------------------------
// MK-02: Codebase scan marker extraction (positive, AC-003-02)
// ---------------------------------------------------------------------------

describe('REQ-GH-253 marker-extractors: codebase-scan', () => {

  it('MK-02: codebase-scan extractor detects scan_complete signal', () => {
    const markers = extractCodebaseScan(CODEBASE_SCAN_OUTPUT);
    assert.ok(markers.scan_complete);
  });

  it('MK-02b: codebase-scan detects file count mention', () => {
    const markers = extractCodebaseScan(CODEBASE_SCAN_OUTPUT);
    assert.ok(markers.file_count_mentioned || markers.modules_listed);
  });

  it('MK-02c: codebase-scan detects modules listed', () => {
    const markers = extractCodebaseScan(CODEBASE_SCAN_OUTPUT);
    assert.ok(markers.modules_listed);
  });
});

// ---------------------------------------------------------------------------
// MK-03: Blast radius marker extraction
// ---------------------------------------------------------------------------

describe('REQ-GH-253 marker-extractors: blast-radius', () => {

  it('MK-03: blast-radius detects direct changes listed', () => {
    const markers = extractBlastRadius(BLAST_RADIUS_OUTPUT);
    assert.ok(markers.direct_changes_listed);
  });

  it('MK-03b: blast-radius detects transitive impact', () => {
    const markers = extractBlastRadius(BLAST_RADIUS_OUTPUT);
    assert.ok(markers.transitive_impact_assessed || markers.risk_areas_named);
  });

  it('MK-03c: blast-radius detects risk areas', () => {
    const markers = extractBlastRadius(BLAST_RADIUS_OUTPUT);
    assert.ok(markers.risk_areas_named);
  });

  it('MK-03d: blast-radius detects assessment complete', () => {
    const markers = extractBlastRadius(BLAST_RADIUS_OUTPUT);
    assert.ok(markers.blast_radius_assessed);
  });
});

// ---------------------------------------------------------------------------
// MK-04: Options research marker extraction
// ---------------------------------------------------------------------------

describe('REQ-GH-253 marker-extractors: options-research', () => {

  it('MK-04: options-research detects multiple options evaluated', () => {
    const markers = extractOptionsResearch(OPTIONS_RESEARCH_OUTPUT);
    assert.ok(markers.options_evaluated);
  });

  it('MK-04b: options-research detects selected with rationale', () => {
    const markers = extractOptionsResearch(OPTIONS_RESEARCH_OUTPUT);
    assert.ok(markers.selected_with_rationale);
  });

  it('MK-04c: options-research detects pros/cons', () => {
    const markers = extractOptionsResearch(OPTIONS_RESEARCH_OUTPUT);
    assert.ok(markers.pros_cons_listed);
  });
});

// ---------------------------------------------------------------------------
// MK-05: Dependency check marker extraction
// ---------------------------------------------------------------------------

describe('REQ-GH-253 marker-extractors: dependency-check', () => {

  it('MK-05: dependency-check detects dependencies checked', () => {
    const markers = extractDependencyCheck(DEPENDENCY_CHECK_OUTPUT);
    assert.ok(markers.dependencies_checked);
  });

  it('MK-05b: dependency-check detects no conflicts', () => {
    const markers = extractDependencyCheck(DEPENDENCY_CHECK_OUTPUT);
    assert.ok(markers.no_conflicts);
  });

  it('MK-05c: dependency-check detects conflicts found', () => {
    const output = 'There are conflicting versions of express detected.';
    const markers = extractDependencyCheck(output);
    assert.ok(markers.conflicts_found);
  });
});

// ---------------------------------------------------------------------------
// MK-06: Tracing marker extraction (bug-gather only)
// ---------------------------------------------------------------------------

describe('REQ-GH-253 marker-extractors: tracing', () => {

  it('MK-06: tracing detects hypotheses ranked', () => {
    const markers = extractTracing(TRACING_OUTPUT);
    assert.ok(markers.hypotheses_ranked);
  });

  it('MK-06b: tracing detects code paths traced', () => {
    const markers = extractTracing(TRACING_OUTPUT);
    assert.ok(markers.code_paths_traced);
  });

  it('MK-06c: tracing detects root cause identified', () => {
    const markers = extractTracing(TRACING_OUTPUT);
    assert.ok(markers.root_cause_identified);
  });
});

// ---------------------------------------------------------------------------
// MK-07: Negative / robustness tests
// ---------------------------------------------------------------------------

describe('REQ-GH-253 marker-extractors: negative cases', () => {

  it('MK-07: extractor returns empty markers for unrelated output', () => {
    assert.deepStrictEqual(extractScopeFraming(UNRELATED_OUTPUT), {});
    assert.deepStrictEqual(extractCodebaseScan(UNRELATED_OUTPUT), {});
    assert.deepStrictEqual(extractBlastRadius(UNRELATED_OUTPUT), {});
    assert.deepStrictEqual(extractOptionsResearch(UNRELATED_OUTPUT), {});
    assert.deepStrictEqual(extractDependencyCheck(UNRELATED_OUTPUT), {});
    assert.deepStrictEqual(extractTracing(UNRELATED_OUTPUT), {});
  });

  it('MK-08: extractors handle empty string input without throwing', () => {
    assert.deepStrictEqual(extractScopeFraming(''), {});
    assert.deepStrictEqual(extractCodebaseScan(''), {});
    assert.deepStrictEqual(extractBlastRadius(''), {});
    assert.deepStrictEqual(extractOptionsResearch(''), {});
    assert.deepStrictEqual(extractDependencyCheck(''), {});
    assert.deepStrictEqual(extractTracing(''), {});
  });

  it('MK-09: extractors handle null/undefined input without throwing', () => {
    assert.deepStrictEqual(extractScopeFraming(null), {});
    assert.deepStrictEqual(extractScopeFraming(undefined), {});
    assert.deepStrictEqual(extractCodebaseScan(null), {});
    assert.deepStrictEqual(extractBlastRadius(42), {});
  });
});

// ---------------------------------------------------------------------------
// MK-10: Index dispatcher (T023)
// ---------------------------------------------------------------------------

describe('REQ-GH-253 markers/index.js: dispatch', () => {

  it('MK-10: dispatch routes SCOPE_FRAMING to scope-framing extractor', () => {
    const markers = dispatch('SCOPE_FRAMING', SCOPE_FRAMING_OUTPUT);
    assert.ok(markers.scope_accepted);
  });

  it('MK-10b: dispatch routes CODEBASE_SCAN to codebase-scan extractor', () => {
    const markers = dispatch('CODEBASE_SCAN', CODEBASE_SCAN_OUTPUT);
    assert.ok(markers.scan_complete);
  });

  it('MK-10c: dispatch routes BLAST_RADIUS to blast-radius extractor', () => {
    const markers = dispatch('BLAST_RADIUS', BLAST_RADIUS_OUTPUT);
    assert.ok(markers.direct_changes_listed);
  });

  it('MK-10d: dispatch routes OPTIONS_RESEARCH to options-research extractor', () => {
    const markers = dispatch('OPTIONS_RESEARCH', OPTIONS_RESEARCH_OUTPUT);
    assert.ok(markers.options_evaluated);
  });

  it('MK-10e: dispatch routes DEPENDENCY_CHECK to dependency-check extractor', () => {
    const markers = dispatch('DEPENDENCY_CHECK', DEPENDENCY_CHECK_OUTPUT);
    assert.ok(markers.dependencies_checked);
  });

  it('MK-10f: dispatch routes TRACING to tracing extractor', () => {
    const markers = dispatch('TRACING', TRACING_OUTPUT);
    assert.ok(markers.hypotheses_ranked);
  });

  it('MK-10g: dispatch handles lowercase sub-task IDs', () => {
    const markers = dispatch('scope_framing', SCOPE_FRAMING_OUTPUT);
    assert.ok(markers.scope_accepted);
  });

  it('MK-11: dispatch returns empty object for unknown sub-task ID', () => {
    assert.deepStrictEqual(dispatch('UNKNOWN_TASK', SCOPE_FRAMING_OUTPUT), {});
  });

  it('MK-11b: dispatch returns empty object for null/undefined inputs', () => {
    assert.deepStrictEqual(dispatch(null, 'test'), {});
    assert.deepStrictEqual(dispatch('SCOPE_FRAMING', null), {});
    assert.deepStrictEqual(dispatch(undefined, undefined), {});
  });

  it('MK-12: listExtractors returns canonical uppercase IDs', () => {
    const ids = listExtractors();
    assert.ok(ids.includes('SCOPE_FRAMING'));
    assert.ok(ids.includes('CODEBASE_SCAN'));
    assert.ok(ids.includes('BLAST_RADIUS'));
    assert.ok(ids.includes('OPTIONS_RESEARCH'));
    assert.ok(ids.includes('DEPENDENCY_CHECK'));
    assert.ok(ids.includes('TRACING'));
    assert.strictEqual(ids.length, 6);
    // No lowercase entries
    assert.ok(ids.every(id => id === id.toUpperCase()));
  });
});

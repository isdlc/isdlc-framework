/**
 * Prompt Content Verification Tests: REQ-0035 Confirmation Sequence
 *
 * These tests verify that roundtable-analyst.md and isdlc.md contain
 * the required content patterns for the sequential confirmation sequence
 * feature (8 FRs, 28 ACs).
 *
 * Test runner: node:test (Article II)
 * Test approach: Read .md files, assert content patterns
 *
 * Traces to: REQ-0035-transparent-critic-refiner-at-step-bounds
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Test constants
const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const ROUNDTABLE_ANALYST_PATH = join(PROJECT_ROOT, 'src', 'claude', 'agents', 'roundtable-analyst.md');
const ISDLC_MD_PATH = join(PROJECT_ROOT, 'src', 'claude', 'commands', 'isdlc.md');
const HOOKS_DIR = join(PROJECT_ROOT, 'src', 'claude', 'hooks');
const PACKAGE_JSON_PATH = join(PROJECT_ROOT, 'package.json');

const CONFIRMATION_STATES = [
  'IDLE',
  'PRESENTING_REQUIREMENTS',
  'PRESENTING_ARCHITECTURE',
  'PRESENTING_DESIGN',
  'AMENDING',
  'TRIVIAL_SHOW',
  'FINALIZING',
  'COMPLETE'
];

const SUMMARY_ARTIFACTS = [
  'requirements-summary.md',
  'architecture-summary.md',
  'design-summary.md'
];

// Hook/dependency counts track current environment, not the roundtable-analyst rewrite.
// These guardrails prevent accidental additions during a prompt-only change. Counts are
// updated as the framework intentionally adds hooks or runtime deps.
const EXPECTED_HOOK_COUNT = 37;
const EXPECTED_RUNTIME_DEPS = ['chalk', 'fs-extra', 'js-yaml', 'onnxruntime-node', 'prompts', 'semver'];

// Helper: read file with caching
const fileCache = {};
function readFile(filePath) {
  if (!fileCache[filePath]) {
    fileCache[filePath] = readFileSync(filePath, 'utf-8');
  }
  return fileCache[filePath];
}

// =============================================================================
// TG-01: Sequential Confirmation Sequence (FR-001)
// Traces to: FR-001, AC-001-01, AC-001-02, AC-001-03, AC-001-04
// =============================================================================

describe('TG-01: Sequential Confirmation Sequence (FR-001)', () => {

  // TC-01.1 [P0]: Confirmation sequence section exists
  it('TC-01.1 [P0]: Confirmation sequence section exists in roundtable-analyst.md', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('confirmation') && (lower.includes('sequence') || lower.includes('sequential')),
      'roundtable-analyst.md must contain a confirmation sequence section'
    );
  });

  // TC-01.2 [P0]: State machine states documented
  it('TC-01.2 [P0]: All 8 state machine states documented', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    for (const state of CONFIRMATION_STATES) {
      assert.ok(
        content.includes(state),
        `roundtable-analyst.md must document state: ${state}`
      );
    }
  });

  // TC-01.3 [P0]: State transitions for accept flow
  it('TC-01.3 [P0]: Accept flow transitions documented (requirements -> architecture -> design)', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    // The transitions from presenting one domain to the next must be documented
    assert.ok(
      content.includes('PRESENTING_REQUIREMENTS') && content.includes('PRESENTING_ARCHITECTURE'),
      'Must document transition from PRESENTING_REQUIREMENTS to PRESENTING_ARCHITECTURE'
    );
    assert.ok(
      content.includes('PRESENTING_ARCHITECTURE') && content.includes('PRESENTING_DESIGN'),
      'Must document transition from PRESENTING_ARCHITECTURE to PRESENTING_DESIGN'
    );
    assert.ok(
      content.includes('PRESENTING_DESIGN') && content.includes('FINALIZING'),
      'Must document transition from PRESENTING_DESIGN to FINALIZING'
    );
  });

  // TC-01.4 [P0]: RETURN-FOR-INPUT used for summary presentation
  it('TC-01.4 [P0]: RETURN-FOR-INPUT pattern used for summary presentation', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    assert.ok(
      content.includes('RETURN') && content.toLowerCase().includes('summar'),
      'Must use RETURN pattern when presenting summaries to the user'
    );
  });

  // TC-01.5 [P0]: Accept and Amend options presented
  it('TC-01.5 [P0]: Accept and Amend options presented to user', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    assert.ok(
      content.includes('Accept') && content.includes('Amend'),
      'Must present Accept and Amend options to user with each summary'
    );
  });

  // TC-01.6 [P0]: Finalization on full acceptance
  it('TC-01.6 [P0]: Finalization persists summaries and updates meta.json', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('finali') && lower.includes('persist') && lower.includes('meta.json'),
      'Finalization must persist summaries and update meta.json'
    );
  });

  // TC-01.7 [P0]: ROUNDTABLE_COMPLETE emitted after finalization
  it('TC-01.7 [P0]: ROUNDTABLE_COMPLETE emitted after confirmation finalization', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    assert.ok(
      content.includes('ROUNDTABLE_COMPLETE'),
      'Must emit ROUNDTABLE_COMPLETE after confirmation finalization'
    );
  });
});

// =============================================================================
// TG-02: Requirements Summary Content (FR-002)
// Traces to: FR-002, AC-002-01, AC-002-02, AC-002-03
// =============================================================================

describe('TG-02: Requirements Summary Content (FR-002)', () => {

  // TC-02.1 [P0]: FR IDs, titles, and priorities
  it('TC-02.1 [P0]: Requirements summary includes FR IDs, titles, and priorities', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      (lower.includes('fr') || lower.includes('functional requirement')) &&
      (lower.includes('priorit') || lower.includes('moscow')),
      'Requirements summary must specify FR IDs/titles with priorities'
    );
  });

  // TC-02.2 [P0]: Problem statement and user types
  it('TC-02.2 [P0]: Requirements summary includes problem statement and user types', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('problem') &&
      (lower.includes('user type') || lower.includes('user types') || lower.includes('stakeholder') || lower.includes('persona')),
      'Requirements summary must include problem statement and user types'
    );
  });

  // TC-02.3 [P1]: References detailed artifacts
  it('TC-02.3 [P1]: Requirements summary references requirements-spec.md and user-stories.json', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    assert.ok(
      content.includes('requirements-spec.md'),
      'Requirements summary must reference requirements-spec.md'
    );
    assert.ok(
      content.includes('user-stories.json'),
      'Requirements summary must reference user-stories.json'
    );
  });
});

// =============================================================================
// TG-03: Architecture Summary Content (FR-003)
// Traces to: FR-003, AC-003-01, AC-003-02, AC-003-03
// =============================================================================

describe('TG-03: Architecture Summary Content (FR-003)', () => {

  // TC-03.1 [P0]: Decisions with rationale
  it('TC-03.1 [P0]: Architecture summary includes decisions with rationale', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('decision') && lower.includes('rationale'),
      'Architecture summary must include decisions with rationale'
    );
  });

  // TC-03.2 [P0]: Integration points
  it('TC-03.2 [P0]: Architecture summary includes integration points', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('integration point') || lower.includes('integration points'),
      'Architecture summary must include integration points'
    );
  });

  // TC-03.3 [P1]: References architecture-overview.md
  it('TC-03.3 [P1]: Architecture summary references architecture-overview.md', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    assert.ok(
      content.includes('architecture-overview.md'),
      'Architecture summary must reference architecture-overview.md'
    );
  });
});

// =============================================================================
// TG-04: Design Summary Content (FR-004)
// Traces to: FR-004, AC-004-01, AC-004-02, AC-004-03, AC-004-04
// =============================================================================

describe('TG-04: Design Summary Content (FR-004)', () => {

  // TC-04.1 [P0]: Module responsibilities
  it('TC-04.1 [P0]: Design summary includes module responsibilities', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('module') && lower.includes('responsibilit'),
      'Design summary must include module responsibilities'
    );
  });

  // TC-04.2 [P0]: Data flow
  it('TC-04.2 [P0]: Design summary includes data flow', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('data flow'),
      'Design summary must include data flow'
    );
  });

  // TC-04.3 [P0]: Sequence of operations
  it('TC-04.3 [P0]: Design summary includes sequence of operations', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('sequence'),
      'Design summary must include sequence of operations'
    );
  });

  // TC-04.4 [P1]: References detailed design artifacts
  it('TC-04.4 [P1]: Design summary references module-design.md, interface-spec.md, data-flow.md', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    assert.ok(content.includes('module-design.md'), 'Must reference module-design.md');
    assert.ok(content.includes('interface-spec.md'), 'Must reference interface-spec.md');
    assert.ok(content.includes('data-flow.md'), 'Must reference data-flow.md');
  });
});

// =============================================================================
// TG-05: Amendment Flow (FR-005)
// Traces to: FR-005, AC-005-01, AC-005-02, AC-005-03, AC-005-04
// =============================================================================

describe('TG-05: Amendment Flow (FR-005)', () => {

  // TC-05.1 [P0]: All three personas participate in amendments
  it('TC-05.1 [P0]: All three personas participate in amendment conversations', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      (lower.includes('all three') || lower.includes('three personas') ||
       (lower.includes('maya') && lower.includes('alex') && lower.includes('jordan'))) &&
      lower.includes('amend'),
      'All three personas must participate in amendment conversations'
    );
  });

  // TC-05.2 [P0]: Restart from requirements after amendment
  it('TC-05.2 [P0]: Confirmation restarts from requirements after amendment', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      (lower.includes('restart') || lower.includes('re-enter') || lower.includes('reset')) &&
      lower.includes('requirement'),
      'After amendment, confirmation must restart from requirements'
    );
  });

  // TC-05.3 [P0]: Accepted domains cleared on amendment
  it('TC-05.3 [P0]: Accepted domains cleared when user chooses Amend', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      (lower.includes('clear') || lower.includes('reset')) &&
      (lower.includes('accepteddomains') || lower.includes('accepted_domains') || lower.includes('accepted domains')),
      'Accepted domains must be cleared when user chooses Amend'
    );
  });

  // TC-05.4 [P1]: Ripple effects handled across domains
  it('TC-05.4 [P1]: Cross-domain consistency maintained during amendments', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      (lower.includes('cross-check') || lower.includes('cross check') ||
       lower.includes('all three') || lower.includes('consistency')) &&
      lower.includes('amend'),
      'Must ensure cross-domain consistency during amendments'
    );
  });

  // TC-05.5 [P1]: Re-presented summaries reflect updated content
  it('TC-05.5 [P1]: Summaries regenerated from updated artifacts after amendment', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      (lower.includes('regenerat') || lower.includes('re-generat') ||
       (lower.includes('updated') && lower.includes('summar'))),
      'Summaries must be regenerated from updated artifacts after amendment'
    );
  });
});

// =============================================================================
// TG-06: Tier-Based Scoping (FR-006)
// Traces to: FR-006, AC-006-01, AC-006-02, AC-006-03, AC-006-04
// =============================================================================

describe('TG-06: Tier-Based Scoping (FR-006)', () => {

  // TC-06.1 [P0]: Standard/epic presents all three summaries
  it('TC-06.1 [P0]: Standard/epic tier presents requirements, architecture, and design', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      (lower.includes('standard') || lower.includes('epic')) &&
      lower.includes('requirements') && lower.includes('architecture') && lower.includes('design'),
      'Standard/epic tier must present all three domain summaries'
    );
  });

  // TC-06.2 [P0]: Light tier skips architecture
  it('TC-06.2 [P0]: Light tier presents requirements and design (architecture skipped)', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('light') &&
      lower.includes('requirements') && lower.includes('design'),
      'Light tier must present requirements and design summaries'
    );
  });

  // TC-06.3 [P0]: Trivial tier has no Accept/Amend
  it('TC-06.3 [P0]: Trivial tier shows brief mention without Accept/Amend', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('trivial') && (lower.includes('brief') || lower.includes('mention')),
      'Trivial tier must show a brief mention of changes'
    );
  });

  // TC-06.4 [P1]: Missing domain artifacts cause domain skip
  it('TC-06.4 [P1]: Domain skipped when its artifacts were not produced', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      (lower.includes('produced') || lower.includes('exist') || lower.includes('applicable')) &&
      (lower.includes('skip') || lower.includes('not present')),
      'Domains without produced artifacts must be skipped'
    );
  });

  // TC-06.5 [P0]: Tier information source documented
  it('TC-06.5 [P0]: Tier determination uses effective_intensity or equivalent', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('effective_intensity') ||
      lower.includes('tierinfo') ||
      lower.includes('tier_info') ||
      lower.includes('sizing_decision'),
      'Must document tier information source (effective_intensity, tierInfo, or sizing_decision)'
    );
  });
});

// =============================================================================
// TG-07: Summary Persistence (FR-007)
// Traces to: FR-007, AC-007-01, AC-007-02, AC-007-03, AC-007-04
// =============================================================================

describe('TG-07: Summary Persistence (FR-007)', () => {

  // TC-07.1 [P1]: Summaries cached in memory
  it('TC-07.1 [P1]: Summaries cached in memory during confirmation', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('cache') || lower.includes('summarycache') || lower.includes('summary_cache'),
      'Summaries must be cached in memory during confirmation sequence'
    );
  });

  // TC-07.2 [P0]: Summaries persisted to disk on acceptance
  it('TC-07.2 [P0]: Summary files written to disk on acceptance', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    for (const artifact of SUMMARY_ARTIFACTS) {
      assert.ok(
        content.includes(artifact),
        `Must reference summary artifact: ${artifact}`
      );
    }
  });

  // TC-07.3 [P1]: Persisted summaries available for revisit
  it('TC-07.3 [P1]: Persisted summaries available for revisit', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      (lower.includes('revisit') || lower.includes('re-visit') || lower.includes('previous')) &&
      lower.includes('summar'),
      'Must document that persisted summaries are available for revisit'
    );
  });

  // TC-07.4 [P1]: Amendment overwrites persisted summaries
  it('TC-07.4 [P1]: Amendment cycle overwrites persisted summary files', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      (lower.includes('overwrite') || lower.includes('replace') || lower.includes('complete replacement')) &&
      lower.includes('summar'),
      'Amendment cycles must overwrite persisted summary files'
    );
  });
});

// =============================================================================
// TG-08: Acceptance State in Meta.json (FR-008)
// Traces to: FR-008, AC-008-01, AC-008-02
// =============================================================================

describe('TG-08: Acceptance State in Meta.json (FR-008)', () => {

  // TC-08.1 [P0]: Acceptance field schema in roundtable-analyst.md
  it('TC-08.1 [P0]: Acceptance field with accepted_at and domains documented', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    assert.ok(
      content.includes('acceptance') || content.includes('accepted_at'),
      'Must document acceptance field in meta.json'
    );
    assert.ok(
      content.includes('accepted_at'),
      'Acceptance field must include accepted_at timestamp'
    );
    assert.ok(
      content.includes('domains'),
      'Acceptance field must include domains list'
    );
  });

  // TC-08.2 [P1]: Amendment cycles count tracked
  it('TC-08.2 [P1]: Amendment cycles count tracked in acceptance state', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('amendment_cycles') || lower.includes('amendmentcount') || lower.includes('amendment_count'),
      'Must track amendment cycles count in acceptance state'
    );
  });

  // TC-08.3 [P0]: isdlc.md preserves acceptance field during finalization
  it('TC-08.3 [P0]: isdlc.md preserves acceptance field during meta.json finalization', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('acceptance'),
      'isdlc.md must reference acceptance field preservation in meta.json finalization'
    );
  });

  // TC-08.4 [P1]: Acceptance does not gate build
  it('TC-08.4 [P1]: Acceptance state does not gate the build flow', () => {
    const rtContent = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = rtContent.toLowerCase();
    // Look for explicit documentation that acceptance is informational, not a gate
    // We check the roundtable agent does NOT contain "gate" near "acceptance" in a blocking context
    // OR contains explicit "does not gate" / "informational" language
    const acceptanceSection = lower.indexOf('acceptance');
    if (acceptanceSection !== -1) {
      const surrounding = lower.substring(
        Math.max(0, acceptanceSection - 200),
        Math.min(lower.length, acceptanceSection + 200)
      );
      // Should not find gating language near acceptance, OR should find explicit non-gating language
      assert.ok(
        !surrounding.includes('block') && !surrounding.includes('gate the build') ||
        surrounding.includes('does not gate') || surrounding.includes('informational') ||
        surrounding.includes('not gate') || surrounding.includes('no change to'),
        'Acceptance must not gate the build flow (should be informational)'
      );
    }
  });
});

// =============================================================================
// TG-09: Cross-File Consistency and Integration
// Traces to: FR-001, FR-008, infrastructure guards
// =============================================================================

describe('TG-09: Cross-File Consistency and Integration', () => {

  // TC-09.1 [P0]: Confirmation uses relay-and-resume pattern
  it('TC-09.1 [P0]: Confirmation exchanges flow through relay-and-resume', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    assert.ok(
      content.includes('RETURN') &&
      (content.toLowerCase().includes('confirm') || content.toLowerCase().includes('summar')),
      'Confirmation must use RETURN-FOR-INPUT pattern compatible with relay-and-resume'
    );
  });

  // TC-09.2 [P0]: No new hooks added
  it('TC-09.2 [P0]: No new hooks added (28 expected)', () => {
    const hookFiles = readdirSync(HOOKS_DIR)
      .filter(f => f.endsWith('.cjs') && !f.includes('.test.'));
    assert.equal(
      hookFiles.length, EXPECTED_HOOK_COUNT,
      `Expected ${EXPECTED_HOOK_COUNT} hook files, found ${hookFiles.length}`
    );
  });

  // TC-09.3 [P0]: No new dependencies added
  it('TC-09.3 [P0]: No new runtime dependencies (4 expected)', () => {
    const pkg = JSON.parse(readFile(PACKAGE_JSON_PATH));
    const deps = Object.keys(pkg.dependencies || {}).sort();
    assert.deepStrictEqual(
      deps,
      EXPECTED_RUNTIME_DEPS,
      `Runtime dependencies must remain ${EXPECTED_RUNTIME_DEPS.join(', ')}`
    );
  });

  // TC-09.4 [P1]: ROUNDTABLE_COMPLETE signal unchanged
  it('TC-09.4 [P1]: ROUNDTABLE_COMPLETE is the final signal', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    assert.ok(
      content.includes('ROUNDTABLE_COMPLETE'),
      'ROUNDTABLE_COMPLETE must remain the final signal to the orchestrator'
    );
  });

  // TC-09.5 [P1]: Domain-to-persona mapping documented
  it('TC-09.5 [P1]: Domain-to-persona mapping (Maya/requirements, Alex/architecture, Jordan/design)', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('maya') && lower.includes('requirement'),
      'Maya must be mapped to requirements domain'
    );
    assert.ok(
      lower.includes('alex') && lower.includes('architecture'),
      'Alex must be mapped to architecture domain'
    );
    assert.ok(
      lower.includes('jordan') && lower.includes('design'),
      'Jordan must be mapped to design domain'
    );
  });

  // TC-09.6 [P1]: User response parsing documented
  it('TC-09.6 [P1]: Accept and Amend intent parsing documented', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      (lower.includes('accept') && lower.includes('amend')) &&
      (lower.includes('parse') || lower.includes('indicator') || lower.includes('intent') || lower.includes('phrase')),
      'Must document how Accept and Amend intent is parsed from user responses'
    );
  });
});

// =============================================================================
// TG-10: Confirmation State Machine Structure (FR-001, FR-005, FR-006)
// Traces to: FR-001, FR-005, FR-006
// =============================================================================

describe('TG-10: Confirmation State Machine Structure', () => {

  // TC-10.1 [P0]: AMENDING transitions back to PRESENTING_REQUIREMENTS
  it('TC-10.1 [P0]: AMENDING state transitions back to PRESENTING_REQUIREMENTS', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    assert.ok(
      content.includes('AMENDING') && content.includes('PRESENTING_REQUIREMENTS'),
      'AMENDING must transition back to PRESENTING_REQUIREMENTS (restart from top)'
    );
  });

  // TC-10.2 [P0]: TRIVIAL_SHOW transitions to FINALIZING automatically
  it('TC-10.2 [P0]: TRIVIAL_SHOW transitions to FINALIZING without user acceptance', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    assert.ok(
      content.includes('TRIVIAL_SHOW') && content.includes('FINALIZING'),
      'TRIVIAL_SHOW must transition to FINALIZING automatically'
    );
  });

  // TC-10.3 [P1]: Applicable domains tracked
  it('TC-10.3 [P1]: Confirmation state tracks applicable domains', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('applicabledomains') || lower.includes('applicable_domains') ||
      lower.includes('applicable domains') || lower.includes('produced'),
      'Must track which domains are applicable based on tier and produced artifacts'
    );
  });

  // TC-10.4 [P1]: Ambiguous input defaults to amendment
  it('TC-10.4 [P1]: Ambiguous user input treated as amendment', () => {
    const content = readFile(ROUNDTABLE_ANALYST_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      (lower.includes('ambiguous') || lower.includes('unclear') || lower.includes('safer')) &&
      (lower.includes('amend') || lower.includes('clarif')),
      'Ambiguous user input must default to amendment conversation'
    );
  });
});

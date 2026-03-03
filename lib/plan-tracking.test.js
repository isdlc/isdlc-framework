/**
 * plan-tracking.test.js — Structural validation of plan tracking instructions
 * in isdlc.md and 00-sdlc-orchestrator.md against workflows.json.
 *
 * BUG-0003-fix-plan-tracking: Validates sequential numbering, strikethrough,
 * task cleanup, and phase key alignment across all instruction files.
 *
 * 12 test cases covering 3 fix requirements, 5 acceptance criteria, 6 root causes.
 *
 * @module plan-tracking.test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = join(__dirname, '..');

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

const WORKFLOWS_PATH = join(ROOT, 'src', 'isdlc', 'config', 'workflows.json');
const ISDLC_MD_PATH = join(ROOT, 'src', 'claude', 'commands', 'isdlc.md');
const ORCHESTRATOR_PATH = join(ROOT, 'src', 'claude', 'agents', '00-sdlc-orchestrator.md');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadWorkflows() {
  return JSON.parse(readFileSync(WORKFLOWS_PATH, 'utf8'));
}

function loadIsdlcMd() {
  return readFileSync(ISDLC_MD_PATH, 'utf8');
}

function loadOrchestrator() {
  return readFileSync(ORCHESTRATOR_PATH, 'utf8');
}

/**
 * Extract phase keys from a markdown table that has `phase_key` or `Phase Key`
 * as the first column. Matches rows like: | `05-test-strategy` | ... |
 */
function extractTablePhaseKeys(content) {
  const keys = [];
  const tableRowRegex = /^\|\s*`([^`]+)`\s*\|/gm;
  let match;
  while ((match = tableRowRegex.exec(content)) !== null) {
    const key = match[1];
    // Skip header-like rows and non-phase entries
    if (key.includes('Phase Key') || key === 'phase_key') continue;
    keys.push(key);
  }
  return keys;
}

/**
 * Get all unique phase keys used across all workflows in workflows.json
 * (excluding reverse-engineer which is deprecated/alias).
 */
function getAllCanonicalPhaseKeys(workflows) {
  const keys = new Set();
  for (const [name, def] of Object.entries(workflows.workflows)) {
    if (name === 'reverse-engineer') continue; // deprecated alias
    for (const phase of def.phases) {
      keys.add(phase);
    }
  }
  return keys;
}

/**
 * Extract the section between two markdown headers from content.
 */
function extractSection(content, startHeader, endHeaderOrEof) {
  const startIdx = content.indexOf(startHeader);
  if (startIdx === -1) return '';
  const afterStart = startIdx + startHeader.length;
  let endIdx;
  if (endHeaderOrEof) {
    endIdx = content.indexOf(endHeaderOrEof, afterStart);
    if (endIdx === -1) endIdx = content.length;
  } else {
    endIdx = content.length;
  }
  return content.substring(afterStart, endIdx);
}

// ---------------------------------------------------------------------------
// TC-01: Phase key alignment — isdlc.md STEP 2 table
// ---------------------------------------------------------------------------

describe('BUG-0003: Plan Tracking — Phase Key Alignment', () => {
  const workflows = loadWorkflows();
  const isdlcMd = loadIsdlcMd();
  const orchestrator = loadOrchestrator();
  const canonicalKeys = getAllCanonicalPhaseKeys(workflows);

  it('TC-01: isdlc.md STEP 2 lookup table keys match workflows.json', () => {
    // Extract the STEP 2 section
    const step2Section = extractSection(isdlcMd, '#### STEP 2: FOREGROUND TASKS', '#### STEP 3:');
    const tableKeys = extractTablePhaseKeys(step2Section);

    assert.ok(tableKeys.length > 0, 'STEP 2 table should contain phase keys');

    // Every canonical key must be in the table
    for (const key of canonicalKeys) {
      assert.ok(
        tableKeys.includes(key),
        `Canonical phase key "${key}" missing from isdlc.md STEP 2 table`
      );
    }
  });

  // ---------------------------------------------------------------------------
  // TC-02: Phase key alignment — orchestrator table
  // ---------------------------------------------------------------------------

  it('TC-02: orchestrator Task Definitions table keys match workflows.json', () => {
    // The orchestrator has a similar table
    const tableKeys = extractTablePhaseKeys(orchestrator);

    assert.ok(tableKeys.length > 0, 'Orchestrator table should contain phase keys');

    // Every canonical key must be in the table (possibly multiple times due to override rows)
    for (const key of canonicalKeys) {
      assert.ok(
        tableKeys.includes(key),
        `Canonical phase key "${key}" missing from orchestrator table`
      );
    }
  });

  // ---------------------------------------------------------------------------
  // TC-03: Fix workflow inline phases match workflows.json
  // ---------------------------------------------------------------------------

  it('TC-03: fix workflow inline phases in isdlc.md match workflows.json', () => {
    const fixPhases = workflows.workflows.fix.phases;

    // Find the inline phases array for fix workflow in isdlc.md
    // Pattern: phases `["01-requirements", "02-tracing", ...]`
    const inlineMatch = isdlcMd.match(/type\s*`?"fix"`?\s*and\s*phases\s*`?\[([^\]]+)\]/);
    assert.ok(inlineMatch, 'isdlc.md should contain inline fix phases definition');

    // Parse the inline array
    const inlinePhases = inlineMatch[1]
      .split(',')
      .map(s => s.trim().replace(/"/g, '').replace(/'/g, ''));

    assert.deepStrictEqual(
      inlinePhases,
      fixPhases,
      'Inline fix phases should exactly match workflows.json fix.phases'
    );
  });
});

// ---------------------------------------------------------------------------
// TC-04, TC-05, TC-06: Strikethrough and task-ID mapping
// ---------------------------------------------------------------------------

describe('BUG-0003: Plan Tracking — Strikethrough Instructions', () => {
  const isdlcMd = loadIsdlcMd();

  it('TC-04: STEP 2 tasks all start as pending (GH-60 init-only mode)', () => {
    const step2Section = extractSection(isdlcMd, '#### STEP 2: FOREGROUND TASKS', '#### STEP 3:');

    // GH-60: init-only mode means no phase is pre-completed during init.
    // All tasks start as pending -- no strikethrough in STEP 2.
    assert.ok(
      step2Section.includes('pending'),
      'STEP 2 should state all tasks start as pending'
    );
    // Must NOT mention pre-completing Phase 01
    assert.ok(
      !step2Section.includes('Mark Phase 01'),
      'STEP 2 should not mention marking Phase 01 as completed (init-only mode)'
    );
  });

  it('TC-05: STEP 3e contains strikethrough on phase completion', () => {
    const step3Section = extractSection(isdlcMd, '#### STEP 3: PHASE LOOP', '#### STEP 4:');

    // Must mention strikethrough
    assert.ok(
      step3Section.includes('strikethrough'),
      'STEP 3 should mention strikethrough for phase completion'
    );
    // Must use ~~ pattern
    assert.ok(
      /~~\[N\]/.test(step3Section),
      'STEP 3 should show ~~[N] strikethrough pattern'
    );
  });

  it('TC-06: STEP 2 contains task-ID mapping instructions', () => {
    const step2Section = extractSection(isdlcMd, '#### STEP 2: FOREGROUND TASKS', '#### STEP 3:');

    // Must instruct maintaining a mapping of phase_key → task_id
    assert.ok(
      step2Section.includes('phase_key') && step2Section.includes('task_id'),
      'STEP 2 should instruct maintaining a phase_key → task_id mapping'
    );
  });
});

// ---------------------------------------------------------------------------
// TC-07: STEP 4 cleanup instructions
// ---------------------------------------------------------------------------

describe('BUG-0003: Plan Tracking — Task Cleanup', () => {
  const isdlcMd = loadIsdlcMd();

  it('TC-07: STEP 4 contains task cleanup instructions', () => {
    const step4Section = extractSection(isdlcMd, '#### STEP 4: FINALIZE', '#### Flow Summary');

    // Must mention TaskList
    assert.ok(
      step4Section.includes('TaskList'),
      'STEP 4 should reference TaskList to find remaining tasks'
    );

    // Must mention TaskUpdate with deletion or completion
    assert.ok(
      step4Section.includes('TaskUpdate') && (step4Section.includes('deleted') || step4Section.includes('completed')),
      'STEP 4 should instruct cleaning up tasks via TaskUpdate (deleted or completed)'
    );

    // Must mention cleanup of all/remaining tasks
    assert.ok(
      step4Section.includes('ALL tasks') || step4Section.includes('remaining') || step4Section.includes('stale'),
      'STEP 4 should reference cleaning up all remaining/stale tasks'
    );
  });
});

// ---------------------------------------------------------------------------
// TC-08, TC-09: Workflow example phase counts
// ---------------------------------------------------------------------------

describe('BUG-0003: Plan Tracking — Workflow Examples', () => {
  const workflows = loadWorkflows();
  const orchestrator = loadOrchestrator();

  it('TC-08: orchestrator has task definitions for all fix workflow phases', () => {
    const fixPhases = workflows.workflows.fix.phases;

    // Verify orchestrator task definition table covers all fix phases
    for (const phase of fixPhases) {
      assert.ok(
        orchestrator.includes(phase),
        `Orchestrator task definitions missing phase: ${phase}`
      );
    }
  });

  it('TC-09: orchestrator has task definitions for all feature workflow phases', () => {
    const featurePhases = workflows.workflows.feature.phases;

    // Verify orchestrator task definition table covers all feature phases
    for (const phase of featurePhases) {
      assert.ok(
        orchestrator.includes(phase),
        `Orchestrator task definitions missing phase: ${phase}`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// TC-10: Sequential numbering instructions
// ---------------------------------------------------------------------------

describe('BUG-0003: Plan Tracking — Sequential Numbering', () => {
  const isdlcMd = loadIsdlcMd();

  it('TC-10: STEP 2 contains sequential numbering instructions', () => {
    const step2Section = extractSection(isdlcMd, '#### STEP 2: FOREGROUND TASKS', '#### STEP 3:');

    // Must mention sequential
    assert.ok(
      step2Section.includes('sequential'),
      'STEP 2 should mention sequential numbering'
    );

    // Must mention starting at 1
    assert.ok(
      step2Section.includes('starting at 1'),
      'STEP 2 should specify numbering starts at 1'
    );

    // Must mention [N] format
    assert.ok(
      step2Section.includes('[N]'),
      'STEP 2 should specify [N] format for task numbering'
    );
  });
});

// ---------------------------------------------------------------------------
// TC-11: All workflows.json phases have table entries
// ---------------------------------------------------------------------------

describe('BUG-0003: Plan Tracking — Completeness', () => {
  const workflows = loadWorkflows();
  const isdlcMd = loadIsdlcMd();
  const orchestrator = loadOrchestrator();
  const canonicalKeys = getAllCanonicalPhaseKeys(workflows);

  it('TC-11: every workflow phase in workflows.json has an entry in both lookup tables', () => {
    const step2Section = extractSection(isdlcMd, '#### STEP 2: FOREGROUND TASKS', '#### STEP 3:');
    const isdlcTableKeys = extractTablePhaseKeys(step2Section);
    const orchestratorTableKeys = extractTablePhaseKeys(orchestrator);

    const missingInIsdlc = [];
    const missingInOrchestrator = [];

    for (const key of canonicalKeys) {
      if (!isdlcTableKeys.includes(key)) missingInIsdlc.push(key);
      if (!orchestratorTableKeys.includes(key)) missingInOrchestrator.push(key);
    }

    assert.deepStrictEqual(
      missingInIsdlc,
      [],
      `Phase keys missing from isdlc.md STEP 2 table: ${missingInIsdlc.join(', ')}`
    );
    assert.deepStrictEqual(
      missingInOrchestrator,
      [],
      `Phase keys missing from orchestrator table: ${missingInOrchestrator.join(', ')}`
    );
  });

  // ---------------------------------------------------------------------------
  // TC-12: No stale/orphaned phase keys
  // ---------------------------------------------------------------------------

  it('TC-12: no orphaned phase keys in lookup tables (all keys exist in some workflow)', () => {
    const step2Section = extractSection(isdlcMd, '#### STEP 2: FOREGROUND TASKS', '#### STEP 3:');
    const isdlcTableKeys = extractTablePhaseKeys(step2Section);

    const orphaned = isdlcTableKeys.filter(key => !canonicalKeys.has(key));
    assert.deepStrictEqual(
      orphaned,
      [],
      `Orphaned phase keys in isdlc.md STEP 2 table (not in any workflow): ${orphaned.join(', ')}`
    );
  });
});

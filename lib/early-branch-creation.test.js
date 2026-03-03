/**
 * early-branch-creation.test.js -- Structural validation that branch creation
 * timing has been moved from post-GATE-01 to workflow initialization time.
 *
 * BUG-0014-early-branch-creation: 22 test cases (T01-T22) covering orchestrator
 * Section 3a retiming, isdlc.md phase-loop controller updates, stale reference
 * removal, regression guards (branch naming, plan generation, git commands),
 * cross-file consistency, and generate-plan skill documentation.
 *
 * Follows the pattern established by lib/invisible-framework.test.js.
 *
 * @module early-branch-creation.test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');

// ---------------------------------------------------------------------------
// File Paths
// ---------------------------------------------------------------------------

const ORCHESTRATOR_PATH = resolve(__dirname, '..', 'src', 'claude', 'agents', '00-sdlc-orchestrator.md');
const ISDLC_MD_PATH = resolve(__dirname, '..', 'src', 'claude', 'commands', 'isdlc.md');
const GENERATE_PLAN_PATH = resolve(__dirname, '..', 'src', 'claude', 'skills', 'orchestration', 'generate-plan', 'SKILL.md');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract content between a heading marker and the next heading of the same
 * or higher level.  Returns null if the marker heading is not found.
 *
 * @param {string} content  Full markdown text
 * @param {string} marker   The heading text (without leading ##)
 * @param {number} level    Heading level (default 2 for ##)
 * @returns {string|null}
 */
function extractSection(content, marker, level = 2) {
  const prefix = '#'.repeat(level) + ' ';
  const idx = content.indexOf(prefix + marker);
  if (idx === -1) return null;
  const rest = content.slice(idx + prefix.length + marker.length);
  // Find next heading at the same level (## but not ### when level=2)
  const pattern = new RegExp(`\\n${'#'.repeat(level)} [^#]`);
  const nextH = rest.search(pattern);
  return nextH === -1 ? rest : rest.slice(0, nextH);
}

/**
 * Extract a section using a regex pattern for the heading.
 */
function extractSectionByPattern(content, headingPattern, level = 2) {
  const prefix = '#'.repeat(level) + ' ';
  const lines = content.split('\n');
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(prefix) && headingPattern.test(lines[i])) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) return null;
  // Find next heading at same level
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith(prefix) && !lines[i].startsWith(prefix + '#')) {
      return lines.slice(startIdx, i).join('\n');
    }
  }
  return lines.slice(startIdx).join('\n');
}

/**
 * Extract the feature workflow section from the orchestrator.
 * It is under "### Workflow-Specific Behavior" -> "**feature workflow:**"
 */
function extractFeatureWorkflowSection(content) {
  const marker = '**feature workflow:**';
  const idx = content.indexOf(marker);
  if (idx === -1) return null;
  const rest = content.slice(idx);
  // Next bold workflow marker or next ## heading
  const nextSection = rest.slice(marker.length).search(/\n\*\*\w+ workflow:\*\*|\n## /);
  return nextSection === -1 ? rest : rest.slice(0, marker.length + nextSection);
}

/**
 * Extract the fix workflow section from the orchestrator.
 */
function extractFixWorkflowSection(content) {
  const marker = '**fix workflow:**';
  const idx = content.indexOf(marker);
  if (idx === -1) return null;
  const rest = content.slice(idx);
  const nextSection = rest.slice(marker.length).search(/\n\*\*\w+ workflow:\*\*|\n## /);
  return nextSection === -1 ? rest : rest.slice(0, marker.length + nextSection);
}

/**
 * Extract the feature action section from isdlc.md.
 */
function extractFeatureActionSection(content) {
  const marker = '**feature** - Implement a new feature end-to-end';
  const idx = content.indexOf(marker);
  if (idx === -1) return null;
  const rest = content.slice(idx);
  // Next bold action header (e.g., **fix**, **test run**)
  const nextAction = rest.slice(marker.length).search(/\n\*\*\w/);
  return nextAction === -1 ? rest : rest.slice(0, marker.length + nextAction);
}

/**
 * Extract the fix action section from isdlc.md.
 */
function extractFixActionSection(content) {
  const marker = '**fix** - Fix a bug or defect with TDD';
  const idx = content.indexOf(marker);
  if (idx === -1) return null;
  const rest = content.slice(idx);
  const nextAction = rest.slice(marker.length).search(/\n\*\*[\w]/);
  return nextAction === -1 ? rest : rest.slice(0, marker.length + nextAction);
}

/**
 * Extract STEP 1 section from isdlc.md.
 */
function extractStep1Section(content) {
  const marker = '#### STEP 1: INIT';
  const idx = content.indexOf(marker);
  if (idx === -1) return null;
  const rest = content.slice(idx);
  const nextStep = rest.slice(marker.length).search(/\n#### STEP \d/);
  return nextStep === -1 ? rest : rest.slice(0, marker.length + nextStep);
}

/**
 * Extract the init-and-phase-01 mode description from orchestrator.
 * This is the bullet under "### Mode Behavior" that starts with "1. **init-and-phase-01**"
 */
function extractInitAndPhase01Description(content) {
  const marker = '### Mode Behavior';
  const idx = content.indexOf(marker);
  if (idx === -1) return null;
  const rest = content.slice(idx);
  // Find the init-and-phase-01 entry
  const entryMarker = '**init-and-phase-01**';
  const entryIdx = rest.indexOf(entryMarker);
  if (entryIdx === -1) return null;
  const entryRest = rest.slice(entryIdx);
  // Ends at next numbered entry or next heading
  const nextEntry = entryRest.slice(entryMarker.length).search(/\n\d\.\s\*\*|\n##/);
  return nextEntry === -1 ? entryRest : entryRest.slice(0, entryMarker.length + nextEntry);
}

/**
 * Extract the Section 3a content from orchestrator.
 */
function extractSection3a(content) {
  return extractSectionByPattern(content, /3a\.\s+Git Branch Lifecycle/i, 2);
}

/**
 * Extract the Section 3b content from orchestrator.
 */
function extractSection3b(content) {
  return extractSectionByPattern(content, /3b\.\s+Plan Generation/i, 2);
}

/**
 * Extract the init step 7 content from orchestrator.
 * Step 7 is under "### Initialization Process" list item 7.
 */
function extractInitStep7(content) {
  // Look for the requires_branch check step in the initialization process
  // (was step 7, now step 8 after BUG-0017 inserted step 7 "Delegate to the first phase agent")
  const match = content.match(/\d+\.\s+\*\*Check `requires_branch`\*\*[^\n]*(?:\n(?!\d+\.\s).*?)*/);
  if (!match) return null;
  return match[0];
}

/**
 * Extract Mode Definitions table from orchestrator.
 */
function extractModeDefinitionsTable(content) {
  const marker = '### Mode Definitions';
  const idx = content.indexOf(marker);
  if (idx === -1) return null;
  const rest = content.slice(idx);
  const nextSection = rest.slice(marker.length).search(/\n### /);
  return nextSection === -1 ? rest : rest.slice(0, marker.length + nextSection);
}

// ---------------------------------------------------------------------------
// Read files once for all tests
// ---------------------------------------------------------------------------

const orchestratorContent = readFileSync(ORCHESTRATOR_PATH, 'utf-8');
const isdlcMdContent = readFileSync(ISDLC_MD_PATH, 'utf-8');
const generatePlanContent = readFileSync(GENERATE_PLAN_PATH, 'utf-8');

// Pre-extract sections
const section3a = extractSection3a(orchestratorContent);
const section3b = extractSection3b(orchestratorContent);
const featureWorkflow = extractFeatureWorkflowSection(orchestratorContent);
const fixWorkflow = extractFixWorkflowSection(orchestratorContent);
const featureAction = extractFeatureActionSection(isdlcMdContent);
const fixAction = extractFixActionSection(isdlcMdContent);
const step1Section = extractStep1Section(isdlcMdContent);
const initAndPhase01Desc = extractInitAndPhase01Description(orchestratorContent);
const initStep7 = extractInitStep7(orchestratorContent);
const modeDefTable = extractModeDefinitionsTable(orchestratorContent);

// ===========================================================================
// Test Group 1: Orchestrator Section 3a -- New Timing (FR-02)
// ===========================================================================

describe('Group 1: Orchestrator Section 3a -- New Timing (FR-02)', () => {
  it('T01: Section 3a header says "At Initialization" not "Post-GATE-01" | traces: AC-02a', () => {
    assert.ok(section3a, 'Section 3a must exist in orchestrator');
    // Positive: header contains "At Initialization" or "Initialization" timing
    assert.ok(
      /Branch Creation \(At Initialization\)/i.test(orchestratorContent) ||
      /Branch Creation \(During Initialization\)/i.test(orchestratorContent) ||
      /Branch Creation \(Workflow Initialization\)/i.test(orchestratorContent),
      'Section 3a header must contain "At Initialization", "During Initialization", or "Workflow Initialization"'
    );
    // Negative: no "Post-GATE-01" in the branch creation heading
    assert.ok(
      !/Branch Creation \(Post-GATE-01\)/i.test(orchestratorContent),
      'Section 3a header must NOT contain "Branch Creation (Post-GATE-01)"'
    );
  });

  it('T02: Section 3a trigger condition references "initializing a workflow" not "GATE-01 passes" | traces: AC-02a', () => {
    assert.ok(section3a, 'Section 3a must exist');
    // Positive: trigger mentions initialization
    const hasInitTrigger =
      /initializ(?:ing|ation|e)\s+(?:a\s+)?workflow/i.test(section3a) ||
      /workflow\s+initializ/i.test(section3a) ||
      /during\s+(?:workflow\s+)?init/i.test(section3a);
    assert.ok(hasInitTrigger, 'Section 3a must reference "initializing a workflow" or "workflow initialization" as the trigger');
    // Negative: not "When GATE-01 passes" as the trigger
    assert.ok(
      !/When GATE-01 passes AND/i.test(section3a),
      'Section 3a must NOT contain "When GATE-01 passes AND" as the trigger for branch creation'
    );
  });

  it('T03: init-and-phase-01 mode shows branch creation before Phase 01 | traces: AC-02b, AC-01d', () => {
    assert.ok(initAndPhase01Desc, 'init-and-phase-01 mode description must exist');
    // The description should mention branch creation before Phase 01
    // Pattern: "create branch" appears before "Phase 01" or "delegate to Phase 01"
    const branchIdx = initAndPhase01Desc.search(/creat(?:e|ion)\s+(?:the\s+)?branch/i);
    const phase01Idx = initAndPhase01Desc.search(/Phase 01|delegate to.*01/i);
    assert.ok(branchIdx !== -1, 'init-and-phase-01 description must mention branch creation');
    assert.ok(phase01Idx !== -1, 'init-and-phase-01 description must mention Phase 01');
    assert.ok(branchIdx < phase01Idx, 'Branch creation must be mentioned BEFORE Phase 01 in init-and-phase-01 mode');
  });

  it('T04: init-and-phase-01 mode table row reflects new ordering | traces: AC-02b', () => {
    assert.ok(modeDefTable, 'Mode Definitions table must exist');
    // The init-and-phase-01 row should mention "create branch" before "run Phase 01"
    const row = modeDefTable.match(/init-and-phase-01[^\n]*/);
    assert.ok(row, 'init-and-phase-01 row must exist in Mode Definitions table');
    const rowText = row[0];
    const branchIdx = rowText.search(/creat(?:e|ion)\s+branch/i);
    const phase01Idx = rowText.search(/(?:run\s+)?Phase 01/i);
    assert.ok(branchIdx !== -1, 'Table row must mention branch creation');
    assert.ok(branchIdx < phase01Idx, 'Branch creation must appear before Phase 01 in the table row');
  });
});

// ===========================================================================
// Test Group 2: isdlc.md Phase-Loop Controller -- New Timing (FR-03)
// ===========================================================================

describe('Group 2: isdlc.md Phase-Loop Controller -- New Timing (FR-03)', () => {
  it('T05: Feature action describes branch creation at init time | traces: AC-03a, AC-01a', () => {
    assert.ok(featureAction, 'Feature action section must exist in isdlc.md');
    // Positive: mentions branch creation during init or before Phase 01
    const hasInitBranch =
      /(?:During|At)\s+init(?:ialization)?.*branch/i.test(featureAction) ||
      /branch.*(?:during|at)\s+init/i.test(featureAction) ||
      /creates?\s+.*branch.*(?:before|during)\s+(?:Phase\s+01|init)/i.test(featureAction) ||
      /init.*creates?\s+.*branch/i.test(featureAction);
    assert.ok(hasInitBranch, 'Feature action must describe branch creation at init time, not "After GATE-01"');
    // Negative: no "After GATE-01" branch creation
    assert.ok(
      !/After GATE-01.*creates?\s+.*branch/i.test(featureAction),
      'Feature action must NOT say "After GATE-01: creates branch"'
    );
  });

  it('T06: Fix action describes branch creation at init time | traces: AC-03a, AC-01b', () => {
    assert.ok(fixAction, 'Fix action section must exist in isdlc.md');
    // Positive: mentions branch creation during init or before Phase 01
    const hasInitBranch =
      /(?:During|At)\s+init(?:ialization)?.*branch/i.test(fixAction) ||
      /branch.*(?:during|at)\s+init/i.test(fixAction) ||
      /creates?\s+.*branch.*(?:before|during)\s+(?:Phase\s+01|init)/i.test(fixAction) ||
      /init.*creates?\s+.*branch/i.test(fixAction);
    assert.ok(hasInitBranch, 'Fix action must describe branch creation at init time, not "After GATE-01"');
    // Negative: no "After GATE-01" branch creation
    assert.ok(
      !/After GATE-01.*creates?\s+.*branch/i.test(fixAction),
      'Fix action must NOT say "After GATE-01: creates branch"'
    );
  });

  it('T07: STEP 1 description mentions branch creation before Phase 01 | traces: AC-03a, AC-03b', () => {
    assert.ok(step1Section, 'STEP 1 section must exist in isdlc.md');
    // STEP 1 description should include branch creation as part of init
    const hasBranchInStep1 =
      /creates?\s+(?:the\s+)?branch/i.test(step1Section) ||
      /branch\s+creat/i.test(step1Section);
    assert.ok(hasBranchInStep1, 'STEP 1 must mention branch creation');
    // Ordering: branch before phase 01 in the description
    const branchIdx = step1Section.search(/(?:creates?\s+(?:the\s+)?branch|branch\s+creat)/i);
    const phase01Idx = step1Section.search(/(?:runs?\s+Phase\s+01|Phase\s+01\s+\(requirements)|01-requirements/i);
    assert.ok(branchIdx !== -1, 'STEP 1 must mention branch creation');
    assert.ok(phase01Idx !== -1, 'STEP 1 must mention Phase 01');
    assert.ok(branchIdx < phase01Idx, 'Branch creation must be mentioned BEFORE Phase 01 in STEP 1');
  });

  it('T08: No "after GATE-01" branch creation reference in isdlc.md STEP 1 | traces: AC-03b', () => {
    assert.ok(step1Section, 'STEP 1 section must exist');
    // No "after GATE-01" followed by "creates" or "create" and "branch"
    assert.ok(
      !/after\s+GATE-01.*creat(?:es?)?\s+.*branch/i.test(step1Section),
      'STEP 1 must NOT contain "after GATE-01 creates branch"'
    );
    assert.ok(
      !/validates?\s+GATE-01.*creates?\s+(?:the\s+)?branch/i.test(step1Section),
      'STEP 1 must NOT say "validates GATE-01, creates the branch" (old ordering)'
    );
  });
});

// ===========================================================================
// Test Group 3: Removal of Stale "After GATE-01" Branch References
// ===========================================================================

describe('Group 3: Removal of Stale "After GATE-01" Branch References (FR-01, FR-02, FR-03)', () => {
  it('T09: No "After GATE-01" branch creation in orchestrator feature workflow | traces: AC-01a, AC-02a', () => {
    assert.ok(featureWorkflow, 'Feature workflow section must exist');
    assert.ok(
      !/After GATE-01:\s*create branch/i.test(featureWorkflow),
      'Feature workflow must NOT contain "After GATE-01: create branch"'
    );
    assert.ok(
      !/After GATE-01.*create\s+branch\s+`feature/i.test(featureWorkflow),
      'Feature workflow must NOT contain "After GATE-01" followed by "create branch `feature/"'
    );
  });

  it('T10: No "After GATE-01" branch creation in orchestrator fix workflow | traces: AC-01b, AC-02a', () => {
    assert.ok(fixWorkflow, 'Fix workflow section must exist');
    assert.ok(
      !/After GATE-01:\s*create branch/i.test(fixWorkflow),
      'Fix workflow must NOT contain "After GATE-01: create branch"'
    );
    assert.ok(
      !/After GATE-01.*create\s+branch\s+`bugfix/i.test(fixWorkflow),
      'Fix workflow must NOT contain "After GATE-01" followed by "create branch `bugfix/"'
    );
  });

  it('T11: No "GATE-01 passes" trigger in Section 3a | traces: AC-02a', () => {
    assert.ok(section3a, 'Section 3a must exist');
    assert.ok(
      !/When GATE-01 passes/i.test(section3a),
      'Section 3a must NOT contain "When GATE-01 passes" as the trigger'
    );
  });

  it('T12: Step 7 no longer says "Branch will be created after GATE-01" | traces: AC-02a', () => {
    assert.ok(initStep7, 'Init step 7 must exist');
    assert.ok(
      !/Branch will be created after GATE-01/i.test(initStep7),
      'Step 7 must NOT say "Branch will be created after GATE-01 passes"'
    );
    assert.ok(
      !/after GATE-01 passes/i.test(initStep7),
      'Step 7 must NOT reference "after GATE-01 passes"'
    );
  });

  it('T13: Section 3b does not reference "branch creation (3a)" as a next step | traces: AC-02c, NFR-03', () => {
    assert.ok(section3b, 'Section 3b must exist');
    assert.ok(
      !/proceed to branch creation \(3a\)/i.test(section3b),
      'Section 3b must NOT say "proceed to branch creation (3a)"'
    );
    assert.ok(
      !/branch creation \(3a\)/i.test(section3b),
      'Section 3b must NOT reference "branch creation (3a)" since the branch already exists'
    );
  });
});

// ===========================================================================
// Test Group 4: Preserved Content -- Regression Guards (NFR-01, NFR-03)
// ===========================================================================

describe('Group 4: Preserved Content -- Regression Guards (NFR-01, NFR-03)', () => {
  it('T14: Feature branch naming convention preserved | traces: AC-01c, NFR-01', () => {
    assert.ok(
      orchestratorContent.includes('feature/{artifact_folder}'),
      'Orchestrator must preserve `feature/{artifact_folder}` branch naming convention'
    );
  });

  it('T15: Bugfix branch naming convention preserved | traces: AC-01c, NFR-01', () => {
    assert.ok(
      orchestratorContent.includes('bugfix/{artifact_folder}'),
      'Orchestrator must preserve `bugfix/{artifact_folder}` branch naming convention'
    );
  });

  it('T16: Plan Generation section header still says "Post-GATE-01" | traces: AC-02c, AC-03c, NFR-03', () => {
    assert.ok(
      orchestratorContent.includes('Plan Generation (Post-GATE-01)'),
      'Orchestrator must preserve "Plan Generation (Post-GATE-01)" header -- plan timing unchanged'
    );
  });

  it('T17: git checkout -b command preserved in Section 3a | traces: AC-01d, NFR-01', () => {
    assert.ok(section3a, 'Section 3a must exist');
    assert.ok(
      section3a.includes('git checkout -b'),
      'Section 3a must preserve the `git checkout -b` command'
    );
  });
});

// ===========================================================================
// Test Group 5: Cross-File Consistency (FR-01)
// ===========================================================================

describe('Group 5: Cross-File Consistency (FR-01)', () => {
  it('T18: Orchestrator and isdlc.md agree -- no "after GATE-01" for branch creation | traces: AC-01a, AC-01b, AC-01d', () => {
    // Check orchestrator: no "After GATE-01: create branch" in workflow definitions
    const orchHasStaleRef =
      /After GATE-01:\s*create branch/i.test(featureWorkflow) ||
      /After GATE-01:\s*create branch/i.test(fixWorkflow);
    assert.ok(!orchHasStaleRef, 'Orchestrator must not have "After GATE-01: create branch" in workflow definitions');

    // Check isdlc.md: no "After GATE-01" + "creates" + "branch" in feature/fix actions
    const isdlcHasStaleRef =
      /After GATE-01.*creates?\s+.*branch/i.test(featureAction || '') ||
      /After GATE-01.*creates?\s+.*branch/i.test(fixAction || '');
    assert.ok(!isdlcHasStaleRef, 'isdlc.md must not have "After GATE-01 creates branch" in feature/fix actions');
  });

  it('T19: Pre-flight checks documented in orchestrator Section 3a | traces: AC-04a, AC-04b, AC-04c, AC-04d', () => {
    assert.ok(section3a, 'Section 3a must exist');
    // Pre-flight checks should include git rev-parse and dirty working directory handling
    assert.ok(
      section3a.includes('git rev-parse'),
      'Section 3a must document pre-flight check: git rev-parse'
    );
    assert.ok(
      /dirty|porcelain|status/i.test(section3a),
      'Section 3a must document dirty working directory handling'
    );
    assert.ok(
      /checkout\s+main/i.test(section3a),
      'Section 3a must document checkout to main as pre-flight step'
    );
  });

  it('T20: State recording (git_branch) documented in orchestrator Section 3a | traces: AC-05a, AC-05b, AC-05c, AC-05d', () => {
    assert.ok(section3a, 'Section 3a must exist');
    assert.ok(
      section3a.includes('git_branch'),
      'Section 3a must document git_branch state update'
    );
    assert.ok(
      section3a.includes('"name"') || section3a.includes("'name'"),
      'Section 3a must document git_branch.name field'
    );
    assert.ok(
      section3a.includes('"created_from"') || section3a.includes("'created_from'"),
      'Section 3a must document git_branch.created_from field'
    );
    assert.ok(
      section3a.includes('"created_at"') || section3a.includes("'created_at'"),
      'Section 3a must document git_branch.created_at field'
    );
    assert.ok(
      section3a.includes('"status"') || section3a.includes("'status'"),
      'Section 3a must document git_branch.status field'
    );
  });
});

// ===========================================================================
// Test Group 6: Generate-Plan Skill (FR-01)
// ===========================================================================

describe('Group 6: Generate-Plan Skill (FR-01)', () => {
  it('T21: generate-plan skill when_to_use mentions branch already exists | traces: AC-01d', () => {
    assert.ok(generatePlanContent, 'Generate-plan SKILL.md must exist');
    const hasAlreadyExists =
      /branch already (?:created|exists)/i.test(generatePlanContent) ||
      /after branch creation/i.test(generatePlanContent) ||
      /branch has (?:already )?been created/i.test(generatePlanContent);
    assert.ok(hasAlreadyExists, 'generate-plan skill must mention that the branch already exists at plan generation time');
  });

  it('T22: generate-plan skill does not say "Before branch creation" | traces: AC-01d', () => {
    assert.ok(generatePlanContent, 'Generate-plan SKILL.md must exist');
    assert.ok(
      !/Before branch creation/i.test(generatePlanContent),
      'generate-plan skill must NOT contain "Before branch creation"'
    );
  });
});

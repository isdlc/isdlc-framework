# Module Design: BUG-0028 -- Agents Ignore Injected Gate Requirements

**Bug ID**: BUG-0028 / GH-64
**Phase**: 04-design
**Traces to**: Architecture Overview (ADR-001 through ADR-006)
**Artifact Folder**: `docs/requirements/BUG-0028-agents-ignore-injected-gate-requirements/`

---

## Table of Contents

1. [Design Overview](#1-design-overview)
2. [Module 1: gate-requirements-injector.cjs (FR-001, FR-002)](#2-module-1-gate-requirements-injectorcjs)
3. [Module 2: isdlc.md STEP 3d (FR-003)](#3-module-2-isdlcmd-step-3d)
4. [Module 3: Agent .md Files (FR-004)](#4-module-3-agent-md-files)
5. [Module 4: branch-guard.cjs (FR-005)](#5-module-4-branch-guardcjs)
6. [Module 5: Test Suite (FR-006)](#6-module-5-test-suite)
7. [Integration Points and Call Chain](#7-integration-points-and-call-chain)
8. [Error Taxonomy](#8-error-taxonomy)
9. [Validation Rules](#9-validation-rules)
10. [Implementation Checklist](#10-implementation-checklist)

---

## 1. Design Overview

This design addresses 6 functional requirements across 7 files. The changes strengthen the constraint delivery pipeline at three layers: injection format (Layer 1), delegation prompt (Layer 2), and agent instructions (Layer 3), with improved feedback from the enforcement layer (Layer 4).

### Files Modified

| # | File | FRs | Change Type | Est. Lines |
|---|------|-----|-------------|-----------|
| 1 | `src/claude/hooks/lib/gate-requirements-injector.cjs` | FR-001, FR-002 | Add 2 functions, modify 2 functions | ~55 new/modified |
| 2 | `src/claude/hooks/tests/gate-requirements-injector.test.cjs` | FR-006 | Add test suite | ~90 new |
| 3 | `src/claude/commands/isdlc.md` | FR-003 | Modify STEP 3d template | ~6 modified |
| 4 | `src/claude/agents/05-software-developer.md` | FR-004 | Replace line 29 | 3 lines replaced |
| 5 | `src/claude/agents/16-quality-loop-engineer.md` | FR-004 | Replace line 33 | 3 lines replaced |
| 6 | `src/claude/agents/06-integration-tester.md` | FR-004 | Add prohibition after line 21 | 3 lines added |
| 7 | `src/claude/hooks/branch-guard.cjs` | FR-005 | Modify block message | ~5 lines modified |

### Implementation Order

```
1. FR-004 (agent files)     -- highest-impact, zero-risk, independent
2. FR-001 + FR-002 (injector) -- core logic, sequential dependency
3. FR-006 (tests)           -- validates FR-001 + FR-002
4. FR-003 (isdlc.md)        -- independent prompt template change
5. FR-005 (branch-guard)    -- independent string change
```

---

## 2. Module 1: gate-requirements-injector.cjs (FR-001, FR-002)

**File**: `src/claude/hooks/lib/gate-requirements-injector.cjs`
**Current LOC**: 369
**Estimated final LOC**: ~425

### 2.1 New Function: `buildCriticalConstraints()`

**Purpose**: Derive imperative prohibition statements from phase configuration.

**Signature**:
```javascript
/**
 * Derives imperative constraint statements from phase configuration.
 * Returns an array of short prohibition strings for the CRITICAL CONSTRAINTS section.
 *
 * @param {string} phaseKey - e.g. '06-implementation'
 * @param {object} phaseReq - Phase requirements from iteration-requirements.json
 * @param {object|null} workflowModifiers - Workflow-specific agent modifiers
 * @param {boolean} isIntermediatePhase - true if not the final phase in the workflow
 * @returns {string[]} Array of constraint strings (empty array if no constraints apply)
 */
function buildCriticalConstraints(phaseKey, phaseReq, workflowModifiers, isIntermediatePhase) {
```

**Implementation**:
```javascript
function buildCriticalConstraints(phaseKey, phaseReq, workflowModifiers, isIntermediatePhase) {
    try {
        const constraints = [];

        // 1. Git commit prohibition for intermediate phases
        if (isIntermediatePhase) {
            constraints.push('Do NOT run git commit -- the orchestrator manages all commits.');
        }

        // 2. Test iteration gate constraint
        const testIter = phaseReq.test_iteration || {};
        if (testIter.enabled) {
            const coverage = (testIter.success_criteria && testIter.success_criteria.min_coverage_percent) || 80;
            constraints.push(`Do NOT advance the gate until all tests pass with >= ${coverage}% coverage.`);
        }

        // 3. Constitutional validation constraint
        const constVal = phaseReq.constitutional_validation || {};
        if (constVal.enabled) {
            constraints.push('Constitutional validation MUST complete before gate advancement.');
        }

        // 4. Artifact validation constraint
        const artVal = phaseReq.artifact_validation || {};
        if (artVal.enabled && artVal.paths && artVal.paths.length > 0) {
            constraints.push('Required artifacts MUST exist before gate advancement.');
        }

        // 5. Workflow modifier constraints
        if (workflowModifiers && typeof workflowModifiers === 'object') {
            if (workflowModifiers.require_failing_test_first) {
                constraints.push('You MUST write a failing test before implementing the fix.');
            }
        }

        return constraints;
    } catch (_e) {
        return [];
    }
}
```

**Constraint derivation mapping** (hardcoded per ADR-002):

| Condition | Constraint Line | Source |
|-----------|----------------|--------|
| `isIntermediatePhase === true` | `Do NOT run git commit -- the orchestrator manages all commits.` | ADR-001 |
| `phaseReq.test_iteration.enabled === true` | `Do NOT advance the gate until all tests pass with >= {N}% coverage.` | ADR-002 |
| `phaseReq.constitutional_validation.enabled === true` | `Constitutional validation MUST complete before gate advancement.` | ADR-002 |
| `phaseReq.artifact_validation.enabled === true` AND `paths.length > 0` | `Required artifacts MUST exist before gate advancement.` | ADR-002 |
| `workflowModifiers.require_failing_test_first === true` | `You MUST write a failing test before implementing the fix.` | ADR-002 |

**Edge cases**:
- `phaseReq` is null/undefined: try/catch returns `[]`
- `isIntermediatePhase` is undefined: treated as falsy, no git constraint added (fail-open for callers not passing the parameter -- but `formatBlock()` defaults it to `true` in its wrapper)
- `workflowModifiers` is null: skipped safely via null check
- No conditions match: returns empty array, CRITICAL CONSTRAINTS section is omitted entirely

### 2.2 New Function: `buildConstraintReminder()`

**Purpose**: Produce a footer line restating key prohibitions for recency bias.

**Signature**:
```javascript
/**
 * Builds a reminder footer from constraint strings.
 * Returns 'REMINDER: {constraint1} {constraint2} ...' or '' if no constraints.
 *
 * @param {string[]} constraints - Array of constraint strings from buildCriticalConstraints
 * @returns {string} Reminder line or empty string
 */
function buildConstraintReminder(constraints) {
```

**Implementation**:
```javascript
function buildConstraintReminder(constraints) {
    try {
        if (!Array.isArray(constraints) || constraints.length === 0) {
            return '';
        }
        return 'REMINDER: ' + constraints.join(' ');
    } catch (_e) {
        return '';
    }
}
```

**Design note**: The reminder joins all constraint strings with a space separator. Each constraint string already ends with a period, so the output reads naturally: `REMINDER: Do NOT run git commit -- the orchestrator manages all commits. Do NOT advance the gate until all tests pass with >= 80% coverage.`

### 2.3 Modified Function: `formatBlock()`

**Current signature** (line 212):
```javascript
function formatBlock(phaseKey, phaseReq, resolvedPaths, articleMap, workflowModifiers)
```

**New signature**:
```javascript
function formatBlock(phaseKey, phaseReq, resolvedPaths, articleMap, workflowModifiers, isIntermediatePhase)
```

The new `isIntermediatePhase` parameter is optional. When not provided (undefined), it defaults to `true` (fail-safe: assume intermediate, prohibit commits).

#### Before (current implementation, lines 212-291):

```javascript
function formatBlock(phaseKey, phaseReq, resolvedPaths, articleMap, workflowModifiers) {
    try {
        const phaseNum = phaseKey.split('-')[0];
        const phaseName = PHASE_NAME_MAP[phaseKey] || 'Unknown';
        const lines = [];

        // Header
        lines.push(`GATE REQUIREMENTS FOR PHASE ${phaseNum} (${phaseName}):`);
        lines.push('');

        // Iteration Requirements section
        lines.push('Iteration Requirements:');
        // ... (existing iteration requirement lines)

        // Required Artifacts section
        // ... (existing artifact lines)

        // Constitutional Articles section
        // ... (existing article lines)

        // Workflow Modifiers section
        // ... (existing modifier lines)

        // Warning footer
        lines.push('');
        lines.push('DO NOT attempt to advance the gate until ALL enabled requirements are satisfied.');

        return lines.join('\n');
    } catch (_e) {
        return '';
    }
}
```

#### After (new implementation):

```javascript
function formatBlock(phaseKey, phaseReq, resolvedPaths, articleMap, workflowModifiers, isIntermediatePhase) {
    try {
        const phaseNum = phaseKey.split('-')[0];
        const phaseName = PHASE_NAME_MAP[phaseKey] || 'Unknown';
        const lines = [];

        // Default isIntermediatePhase to true (fail-safe: assume intermediate)
        const isIntermediate = (isIntermediatePhase !== undefined) ? isIntermediatePhase : true;

        // Build critical constraints
        const constraints = buildCriticalConstraints(phaseKey, phaseReq, workflowModifiers, isIntermediate);

        // CRITICAL CONSTRAINTS section (only if constraints exist)
        if (constraints.length > 0) {
            lines.push('========================================');
            lines.push(`CRITICAL CONSTRAINTS FOR PHASE ${phaseNum} (${phaseName}):`);
            for (const c of constraints) {
                lines.push(`- ${c}`);
            }
            lines.push('========================================');
            lines.push('');
        }

        // Header (retained for backward compatibility with includes() checks)
        lines.push(`GATE REQUIREMENTS FOR PHASE ${phaseNum} (${phaseName}):`);
        lines.push('');

        // Iteration Requirements section
        lines.push('Iteration Requirements:');

        // test_iteration
        const testIter = phaseReq.test_iteration || {};
        if (testIter.enabled) {
            const maxIter = testIter.max_iterations || 'N/A';
            const coverage = (testIter.success_criteria && testIter.success_criteria.min_coverage_percent) || 'N/A';
            lines.push(`  - test_iteration: enabled (max ${maxIter} iterations, coverage >= ${coverage}%)`);
        } else {
            lines.push('  - test_iteration: disabled');
        }

        // constitutional_validation
        const constVal = phaseReq.constitutional_validation || {};
        if (constVal.enabled) {
            const articles = (constVal.articles || []).join(', ');
            const maxIter = constVal.max_iterations || 'N/A';
            lines.push(`  - constitutional_validation: enabled (Articles: ${articles}, max ${maxIter} iterations)`);
        } else {
            lines.push('  - constitutional_validation: disabled');
        }

        // interactive_elicitation
        const interElicit = phaseReq.interactive_elicitation || {};
        lines.push(`  - interactive_elicitation: ${interElicit.enabled ? 'enabled' : 'disabled'}`);

        // agent_delegation
        const agentDel = phaseReq.agent_delegation_validation || {};
        lines.push(`  - agent_delegation: ${agentDel.enabled ? 'enabled' : 'disabled'}`);

        // artifact_validation
        const artVal = phaseReq.artifact_validation || {};
        lines.push(`  - artifact_validation: ${artVal.enabled ? 'enabled' : 'disabled'}`);

        // Required Artifacts section (only if paths exist)
        if (resolvedPaths && resolvedPaths.length > 0) {
            lines.push('');
            lines.push('Required Artifacts:');
            for (const p of resolvedPaths) {
                lines.push(`  - ${p}`);
            }
        }

        // Constitutional Articles section (only if enabled and articles exist)
        if (constVal.enabled && constVal.articles && constVal.articles.length > 0 && articleMap && Object.keys(articleMap).length > 0) {
            lines.push('');
            lines.push('Constitutional Articles to Validate:');
            for (const artId of constVal.articles) {
                const title = articleMap[artId] || 'Unknown';
                lines.push(`  - Article ${artId}: ${title}`);
            }
        }

        // Workflow Modifiers section (only if modifiers exist)
        if (workflowModifiers && typeof workflowModifiers === 'object' && Object.keys(workflowModifiers).length > 0) {
            lines.push('');
            lines.push('Workflow Modifiers:');
            lines.push(`  ${JSON.stringify(workflowModifiers)}`);
        }

        // Constraint reminder footer (replaces generic footer when constraints exist)
        lines.push('');
        if (constraints.length > 0) {
            lines.push(buildConstraintReminder(constraints));
        }
        // Always include the generic footer (backward compatibility)
        lines.push('DO NOT attempt to advance the gate until ALL enabled requirements are satisfied.');

        return lines.join('\n');
    } catch (_e) {
        return '';
    }
}
```

#### Key Changes Summary

| Line Range (approx) | Change | Rationale |
|---------------------|--------|-----------|
| After param list | Add `isIntermediatePhase` parameter, default to `true` | ADR-001: fail-safe default |
| Before header | Call `buildCriticalConstraints()`, conditionally emit `========` section | ADR-001: primacy bias |
| After workflow modifiers | Call `buildConstraintReminder()`, emit before generic footer | ADR-001: recency bias |
| Generic footer | Retained after REMINDER line | Backward compatibility with `includes('DO NOT attempt')` checks |

#### Output Format Example (06-implementation, intermediate phase, fix workflow)

```
========================================
CRITICAL CONSTRAINTS FOR PHASE 06 (Implementation):
- Do NOT run git commit -- the orchestrator manages all commits.
- Do NOT advance the gate until all tests pass with >= 80% coverage.
- Constitutional validation MUST complete before gate advancement.
- You MUST write a failing test before implementing the fix.
========================================

GATE REQUIREMENTS FOR PHASE 06 (Implementation):

Iteration Requirements:
  - test_iteration: enabled (max 10 iterations, coverage >= 80%)
  - constitutional_validation: enabled (Articles: I, II, III, V, VI, VII, VIII, IX, X, max 5 iterations)
  - interactive_elicitation: disabled
  - agent_delegation: enabled
  - artifact_validation: disabled

Required Artifacts:
  - docs/requirements/BUG-0028-agents-ignore-injected-gate-requirements/coverage-report.html

Constitutional Articles to Validate:
  - Article I: Specification Primacy
  - Article II: Test-First Development
  - Article III: Security by Design
  - Article V: Simplicity First
  - Article VI: Code Review Required
  - Article VII: Artifact Traceability
  - Article VIII: Documentation Currency
  - Article IX: Quality Gate Integrity
  - Article X: Fail-Safe Defaults

Workflow Modifiers:
  {"require_failing_test_first":true}

REMINDER: Do NOT run git commit -- the orchestrator manages all commits. Do NOT advance the gate until all tests pass with >= 80% coverage. Constitutional validation MUST complete before gate advancement. You MUST write a failing test before implementing the fix.
DO NOT attempt to advance the gate until ALL enabled requirements are satisfied.
```

#### Output Format Example (01-requirements, intermediate phase, no workflow modifiers)

```
========================================
CRITICAL CONSTRAINTS FOR PHASE 01 (Requirements):
- Do NOT run git commit -- the orchestrator manages all commits.
- Constitutional validation MUST complete before gate advancement.
- Required artifacts MUST exist before gate advancement.
========================================

GATE REQUIREMENTS FOR PHASE 01 (Requirements):

Iteration Requirements:
  - test_iteration: disabled
  - constitutional_validation: enabled (Articles: I, IV, VII, IX, XII, max 5 iterations)
  - interactive_elicitation: enabled
  - agent_delegation: enabled
  - artifact_validation: enabled

Required Artifacts:
  - docs/requirements/{artifact_folder}/requirements-spec.md

Constitutional Articles to Validate:
  - Article I: Specification Primacy
  - Article IV: Explicit Over Implicit
  ...

REMINDER: Do NOT run git commit -- the orchestrator manages all commits. Constitutional validation MUST complete before gate advancement. Required artifacts MUST exist before gate advancement.
DO NOT attempt to advance the gate until ALL enabled requirements are satisfied.
```

#### Output Format Example (final phase, no constraints)

When `isIntermediatePhase === false` and no other constraints apply (e.g., test_iteration disabled, constitutional_validation disabled):

```
GATE REQUIREMENTS FOR PHASE 08 (Code Review):

Iteration Requirements:
  - test_iteration: disabled
  - constitutional_validation: disabled
  - interactive_elicitation: disabled
  - agent_delegation: disabled
  - artifact_validation: disabled

DO NOT attempt to advance the gate until ALL enabled requirements are satisfied.
```

No `CRITICAL CONSTRAINTS` section, no `REMINDER` line, no `========` separators. The output is identical to the current format for phases with no constraints (CON-003 compliance).

### 2.4 Modified Function: `buildGateRequirementsBlock()`

**Current signature** (line 306):
```javascript
function buildGateRequirementsBlock(phaseKey, artifactFolder, workflowType, projectRoot)
```

**New signature**:
```javascript
function buildGateRequirementsBlock(phaseKey, artifactFolder, workflowType, projectRoot, phases)
```

The new `phases` parameter is optional (Array or null/undefined). It is the workflow phases array from state.json `active_workflow.phases`.

#### Before (line 349):

```javascript
        // Build and return the formatted block
        return formatBlock(phaseKey, phaseReq, resolvedPaths, articleMap, workflowMods);
```

#### After:

```javascript
        // Determine if this is an intermediate phase
        let isIntermediatePhase = true; // fail-safe default
        if (Array.isArray(phases) && phases.length > 0) {
            const lastPhase = phases[phases.length - 1];
            isIntermediatePhase = (phaseKey !== lastPhase);
        }

        // Build and return the formatted block
        return formatBlock(phaseKey, phaseReq, resolvedPaths, articleMap, workflowMods, isIntermediatePhase);
```

**Full replacement for lines 306-353**:

```javascript
/**
 * Builds a formatted gate requirements block for the given phase.
 *
 * @param {string} phaseKey - e.g. '06-implementation'
 * @param {string} artifactFolder - e.g. 'REQ-0024-gate-requirements-pre-injection'
 * @param {string} [workflowType] - e.g. 'feature', 'fix'
 * @param {string} [projectRoot] - Absolute path (defaults to process.cwd())
 * @param {string[]} [phases] - Workflow phases array from state.json (optional, defaults to null -> fail-safe)
 * @returns {string} Formatted text block or '' on error (fail-open)
 */
function buildGateRequirementsBlock(phaseKey, artifactFolder, workflowType, projectRoot, phases) {
    try {
        const root = projectRoot || process.cwd();

        // Phase key validation
        if (!phaseKey || typeof phaseKey !== 'string') return '';

        // Load iteration requirements
        const iterReq = loadIterationRequirements(root);
        if (!iterReq || !iterReq.phase_requirements) return '';

        // Look up phase-specific requirements
        const phaseReq = iterReq.phase_requirements[phaseKey];
        if (!phaseReq) return '';

        // Load artifact paths
        const artifactPathsConfig = loadArtifactPaths(root);
        let resolvedPaths = [];
        if (artifactPathsConfig && artifactPathsConfig.phases && artifactPathsConfig.phases[phaseKey]) {
            const rawPaths = artifactPathsConfig.phases[phaseKey].paths || [];
            const vars = { artifact_folder: artifactFolder || '' };
            resolvedPaths = rawPaths.map(p => resolveTemplateVars(p, vars));
        }

        // Also check artifact_validation.paths in iteration requirements
        if (phaseReq.artifact_validation && phaseReq.artifact_validation.enabled && phaseReq.artifact_validation.paths) {
            const vars = { artifact_folder: artifactFolder || '' };
            const iterPaths = phaseReq.artifact_validation.paths.map(p => resolveTemplateVars(p, vars));
            // Merge, avoiding duplicates
            for (const ip of iterPaths) {
                if (!resolvedPaths.includes(ip)) {
                    resolvedPaths.push(ip);
                }
            }
        }

        // Parse constitution articles
        const articleMap = parseConstitutionArticles(root);

        // Load workflow modifiers
        const workflowMods = loadWorkflowModifiers(root, workflowType, phaseKey);

        // Determine if this is an intermediate phase
        let isIntermediatePhase = true; // fail-safe default
        if (Array.isArray(phases) && phases.length > 0) {
            const lastPhase = phases[phases.length - 1];
            isIntermediatePhase = (phaseKey !== lastPhase);
        }

        // Build and return the formatted block
        return formatBlock(phaseKey, phaseReq, resolvedPaths, articleMap, workflowMods, isIntermediatePhase);
    } catch (_e) {
        return '';
    }
}
```

### 2.5 Module Exports Change

The exports must add the two new internal helpers for direct unit testing (following the existing pattern where `formatBlock`, `deepMerge`, and other helpers are exported for testing).

**Before** (lines 359-369):
```javascript
module.exports = {
    buildGateRequirementsBlock,
    // Export internal helpers for direct unit testing
    loadIterationRequirements,
    loadArtifactPaths,
    parseConstitutionArticles,
    loadWorkflowModifiers,
    resolveTemplateVars,
    deepMerge,
    formatBlock
};
```

**After**:
```javascript
module.exports = {
    buildGateRequirementsBlock,
    // Export internal helpers for direct unit testing
    loadIterationRequirements,
    loadArtifactPaths,
    parseConstitutionArticles,
    loadWorkflowModifiers,
    resolveTemplateVars,
    deepMerge,
    formatBlock,
    buildCriticalConstraints,
    buildConstraintReminder
};
```

### 2.6 Function Placement

The new functions should be placed in the "Internal Helpers" section, between `deepMerge()` (ends at line 200) and `formatBlock()` (starts at line 212). This keeps all helpers together and ensures they are defined before `formatBlock()` calls them.

**Insertion point**: After line 200 (closing brace of `deepMerge`), before line 202 (JSDoc comment for `formatBlock`).

---

## 3. Module 2: isdlc.md STEP 3d (FR-003)

**File**: `src/claude/commands/isdlc.md`
**Location**: Lines 1622-1652 (GATE REQUIREMENTS INJECTION block)

### 3.1 Change Description

Two changes to the STEP 3d injection template:

1. **Pass phases array to injection logic** (enables `isIntermediatePhase` computation)
2. **Add acknowledgment instruction after the injection block**

### 3.2 Before (lines 1632-1652):

```
    5. Format and append the following block to the delegation prompt:

       GATE REQUIREMENTS FOR PHASE {NN} ({Phase Name}):

       Iteration Requirements:
         - test_iteration: {enabled|disabled} {(max N iterations, coverage >= N%) if enabled}
         - constitutional_validation: {enabled|disabled} {(Articles: list with titles, max N iterations) if enabled}
         - interactive_elicitation: {enabled|disabled}
         - agent_delegation: {enabled|disabled}
         - artifact_validation: {enabled|disabled}

       Required Artifacts: (only if artifact paths exist for this phase)
         - {resolved path 1}
         - {resolved path 2}

       Constitutional Articles to Validate: (only if constitutional_validation is enabled)
         - Article {ID}: {Title}

       DO NOT attempt to advance the gate until ALL enabled requirements are satisfied.

    6. Error handling: If any error occurs in steps 1-5, continue with unmodified prompt. Log warning but never block.}
```

### 3.3 After:

```
    5. Read `active_workflow.phases` array from state.json (the ordered list of phase keys in the current workflow).
       If missing or not an array: use `null` (the injector will use fail-safe defaults).
    6. Format and append the gate requirements block to the delegation prompt.
       The block now includes a CRITICAL CONSTRAINTS section at the top (with imperative prohibitions)
       and a REMINDER footer at the bottom. The format is produced by the gate-requirements-injector
       using the phase key, artifact folder, workflow type, project root, and phases array.
       The injector derives constraints automatically from the phase configuration:
       - Intermediate phases get "Do NOT run git commit" prohibition
       - Phases with test_iteration get coverage gate constraint
       - Phases with constitutional_validation get constitutional reminder
       - Workflow modifiers (e.g., require_failing_test_first) surface as imperative statements
    7. After the gate requirements block, append this acknowledgment instruction on a new line:
       "Read the CRITICAL CONSTRAINTS block above and confirm you will comply before starting work."
    8. Error handling: If any error occurs in steps 1-7, continue with unmodified prompt. Log warning but never block.}
```

### 3.4 Exact Text to Insert

The acknowledgment line to append after the injection block (step 7):

```
Read the CRITICAL CONSTRAINTS block above and confirm you will comply before starting work.
```

This single line is appended as a separate paragraph (preceded by a blank line) after the gate requirements block in the delegation prompt.

---

## 4. Module 3: Agent .md Files (FR-004)

### 4.1 File: `src/claude/agents/05-software-developer.md`

**Line 29 -- Before**:
```
> See **Git Commit Prohibition** in CLAUDE.md.
```

**Line 29-31 -- After**:
```
> **Git Commit Prohibition**: Do NOT run `git commit`, `git add`, or `git push` during this phase.
> The orchestrator manages all git operations at workflow finalize. Attempting to commit will be
> blocked by the branch-guard hook and waste an iteration.
```

**Rationale**: The cross-reference `See **Git Commit Prohibition** in CLAUDE.md` points to a section that DOES NOT EXIST in CLAUDE.md. This is a confirmed dead link and the single most impactful root cause (RC-2). The inline replacement matches the pattern already working in `07-qa-engineer.md` (line 159).

### 4.2 File: `src/claude/agents/16-quality-loop-engineer.md`

**Line 33 -- Before**:
```
> See **Git Commit Prohibition** in CLAUDE.md.
```

**Line 33-35 -- After**:
```
> **Git Commit Prohibition**: Do NOT run `git commit`, `git add`, or `git push` during this phase.
> The orchestrator manages all git operations at workflow finalize. Attempting to commit will be
> blocked by the branch-guard hook and waste an iteration.
```

**Rationale**: Same dead cross-reference as `05-software-developer.md`. Same fix.

### 4.3 File: `src/claude/agents/06-integration-tester.md`

**Current state**: No commit prohibition references exist. Lines 20-22 are:

```
> Follow the **Mandatory Iteration Enforcement Protocol** in CLAUDE.md.
> **Completion criteria**: ALL TESTS PASS. **Max iterations**: 10.

# PHASE OVERVIEW
```

**After -- Insert between line 22 and line 23** (after the iteration enforcement blockquote, before `# PHASE OVERVIEW`):

```
> **Git Commit Prohibition**: Do NOT run `git commit`, `git add`, or `git push` during this phase.
> The orchestrator manages all git operations at workflow finalize. Attempting to commit will be
> blocked by the branch-guard hook and waste an iteration.

# PHASE OVERVIEW
```

The blank line between the prohibition and `# PHASE OVERVIEW` is preserved.

**Rationale**: This agent has implementation-adjacent responsibilities (running tests, potentially modifying test files). Preventive measure per ADR-004.

### 4.4 File: `src/claude/agents/07-qa-engineer.md`

**No change required**. The existing inline prohibition at line 159 (`Do NOT run git add, git commit, git push, or any git write operations`) is sufficient and already follows the correct pattern (AC-004-03 verified).

---

## 5. Module 4: branch-guard.cjs (FR-005)

**File**: `src/claude/hooks/branch-guard.cjs`
**Location**: Lines 203-216 (intermediate phase block message)

### 5.1 Before (lines 203-216):

```javascript
        outputBlockResponse(
            `COMMIT BLOCKED (Phase: ${currentPhase}): Commits are not allowed ` +
            `on the workflow branch during intermediate phases.\n\n` +
            `The current phase '${currentPhase}' has not yet passed quality-loop ` +
            `and code-review validation. Committing now would create unvalidated ` +
            `snapshots in version control.\n\n` +
            `What to do instead:\n` +
            `- Leave changes on the working tree (they will be committed by the orchestrator at workflow finalize)\n` +
            `- If you need to save work temporarily, use: git stash\n` +
            `- The orchestrator handles git add, commit, and merge at the appropriate time\n\n` +
            `Current phase:  ${currentPhase}\n` +
            `Current branch: ${currentBranch}\n` +
            `Final phase:    ${lastPhase}`
        );
```

### 5.2 After:

```javascript
        outputBlockResponse(
            `COMMIT BLOCKED (Phase: ${currentPhase}): Commits are not allowed ` +
            `during intermediate phases. This was stated in the CRITICAL CONSTRAINTS ` +
            `block injected into your delegation prompt.\n\n` +
            `The current phase '${currentPhase}' has not yet passed quality-loop ` +
            `and code-review validation. Committing now would create unvalidated ` +
            `snapshots in version control.\n\n` +
            `What to do instead:\n` +
            `- Do NOT retry the commit -- it will be blocked again.\n` +
            `- Leave changes on the working tree (they will be committed by the orchestrator at workflow finalize)\n` +
            `- If you need to save work temporarily, use: git stash\n` +
            `- The orchestrator handles git add, commit, and merge at the appropriate time\n\n` +
            `Current phase:  ${currentPhase}\n` +
            `Current branch: ${currentBranch}\n` +
            `Final phase:    ${lastPhase}`
        );
```

### 5.3 Changes Highlighted

| Line | Before | After | Reason |
|------|--------|-------|--------|
| 1st line | `...not allowed on the workflow branch during intermediate phases.` | `...not allowed during intermediate phases. This was stated in the CRITICAL CONSTRAINTS block injected into your delegation prompt.` | AC-005-01(a): reference the injected constraint |
| "What to do" section | (no retry warning) | `- Do NOT retry the commit -- it will be blocked again.` | AC-005-01(c): clear directive of what NOT to do |

The first line removes "on the workflow branch" (redundant -- the agent knows which branch it is on) and adds the constraint reference. A new bullet is prepended to the "What to do instead" list.

### 5.4 Verification: gate-blocker.cjs (AC-005-02)

AC-005-02 requires verifying that `gate-blocker.cjs` includes `action_required` fields in unsatisfied requirements. This is a verify-only item (no code change). The implementation team should confirm the field exists in the gate-blocker output during testing. No design work needed.

---

## 6. Module 5: Test Suite (FR-006)

**File**: `src/claude/hooks/tests/gate-requirements-injector.test.cjs`
**Location**: Append new `describe` block after the existing suite 11 (line 958)

### 6.1 Test Suite Structure

```javascript
// -------------------------------------------------------------------------
// 12. Injection salience (BUG-0028)
// -------------------------------------------------------------------------

describe('BUG-0028: Injection salience', () => {
    afterEach(() => {
        destroyTestDir();
    });

    // Test case 1: CRITICAL CONSTRAINTS appears before Iteration Requirements
    // Test case 2: Constraint reminder appears after all sections
    // Test case 3: Constitutional validation reminder in constraints
    // Test case 4: Git commit prohibition for intermediate phases
    // Test case 5: No git commit prohibition for final phase
    // Test case 6: Character count within 40% growth budget
});
```

### 6.2 Test Case Specifications

#### Test 1: CRITICAL CONSTRAINTS precedes Iteration Requirements (AC-006-01)

```javascript
    it('formatBlock() includes CRITICAL CONSTRAINTS before Iteration Requirements for intermediate phase', () => {
        const mod = loadModule();
        const phaseReq = FIXTURE_ITERATION_REQ.phase_requirements['06-implementation'];
        const resolvedPaths = ['docs/requirements/test/coverage-report.html'];
        const articleMap = { 'I': 'Specification Primacy' };

        const result = mod.formatBlock('06-implementation', phaseReq, resolvedPaths, articleMap, null, true);

        const ccIndex = result.indexOf('CRITICAL CONSTRAINTS');
        const irIndex = result.indexOf('Iteration Requirements:');

        assert.ok(ccIndex >= 0, 'Should contain CRITICAL CONSTRAINTS section');
        assert.ok(irIndex >= 0, 'Should contain Iteration Requirements section');
        assert.ok(ccIndex < irIndex, 'CRITICAL CONSTRAINTS must appear before Iteration Requirements');
    });
```

**Assertion**: `indexOf('CRITICAL CONSTRAINTS') < indexOf('Iteration Requirements:')`
**Traces to**: AC-006-01, AC-001-01

#### Test 2: Output ends with constraint reminder (AC-006-02)

```javascript
    it('formatBlock() output includes REMINDER line after all sections', () => {
        const mod = loadModule();
        const phaseReq = FIXTURE_ITERATION_REQ.phase_requirements['06-implementation'];

        const result = mod.formatBlock('06-implementation', phaseReq, [], {}, null, true);

        assert.ok(result.includes('REMINDER:'), 'Should include REMINDER line');

        // REMINDER should appear after the last content section
        const reminderIndex = result.indexOf('REMINDER:');
        const iterReqIndex = result.indexOf('Iteration Requirements:');
        assert.ok(reminderIndex > iterReqIndex, 'REMINDER should appear after Iteration Requirements');
    });
```

**Assertion**: Output contains `REMINDER:` and it appears after `Iteration Requirements:`
**Traces to**: AC-006-02, AC-001-02

#### Test 3: Constitutional validation reminder in CRITICAL CONSTRAINTS (AC-006-03)

```javascript
    it('CRITICAL CONSTRAINTS includes constitutional validation reminder when enabled', () => {
        const mod = loadModule();
        const phaseReq = FIXTURE_ITERATION_REQ.phase_requirements['06-implementation'];
        // 06-implementation has constitutional_validation.enabled = true

        const result = mod.formatBlock('06-implementation', phaseReq, [], {}, null, true);

        // Extract the CRITICAL CONSTRAINTS section
        const ccStart = result.indexOf('CRITICAL CONSTRAINTS');
        const ccEnd = result.indexOf('========', ccStart + 1);
        const ccSection = result.substring(ccStart, ccEnd);

        assert.ok(
            ccSection.includes('Constitutional validation'),
            'CRITICAL CONSTRAINTS section should include constitutional validation reminder'
        );
    });
```

**Assertion**: Text between first and second `========` contains "Constitutional validation"
**Traces to**: AC-006-03, AC-001-03

#### Test 4: Git commit prohibition for intermediate phases

```javascript
    it('includes git commit prohibition for intermediate phases', () => {
        const mod = loadModule();
        const phaseReq = FIXTURE_ITERATION_REQ.phase_requirements['06-implementation'];

        const result = mod.formatBlock('06-implementation', phaseReq, [], {}, null, true);

        assert.ok(
            result.includes('Do NOT run git commit'),
            'Should include git commit prohibition for intermediate phase'
        );
    });
```

**Assertion**: Output includes `Do NOT run git commit` when `isIntermediatePhase = true`
**Traces to**: AC-002-01

#### Test 5: No git commit prohibition for final phase

```javascript
    it('omits git commit prohibition for the final phase', () => {
        const mod = loadModule();
        const phaseReq = FIXTURE_ITERATION_REQ.phase_requirements['06-implementation'];

        const result = mod.formatBlock('06-implementation', phaseReq, [], {}, null, false);

        assert.ok(
            !result.includes('Do NOT run git commit'),
            'Should NOT include git commit prohibition for final phase'
        );
    });
```

**Assertion**: Output does NOT include `Do NOT run git commit` when `isIntermediatePhase = false`
**Traces to**: CON-003

#### Test 6: Character count within 40% growth budget (NFR-001)

```javascript
    it('injection block size stays within 40% growth budget', () => {
        const mod = loadModule();
        const phaseReq = FIXTURE_ITERATION_REQ.phase_requirements['06-implementation'];
        const resolvedPaths = ['docs/requirements/test/coverage-report.html'];
        const articleMap = {
            'I': 'Specification Primacy',
            'II': 'Test-First Development',
            'III': 'Security by Design',
            'V': 'Simplicity First',
            'VI': 'Code Review Required',
            'VII': 'Artifact Traceability',
            'VIII': 'Documentation Currency',
            'IX': 'Quality Gate Integrity',
            'X': 'Fail-Safe Defaults'
        };

        // Baseline: current format (no constraints section, no isIntermediatePhase)
        const baseline = mod.formatBlock('06-implementation', phaseReq, resolvedPaths, articleMap, null);
        // New format: with constraints section
        const enhanced = mod.formatBlock('06-implementation', phaseReq, resolvedPaths, articleMap, null, true);

        const baselineLen = baseline.length;
        const enhancedLen = enhanced.length;
        const growthPercent = ((enhancedLen - baselineLen) / baselineLen) * 100;

        assert.ok(
            enhancedLen <= baselineLen * 1.4,
            `Injection block grew ${growthPercent.toFixed(1)}% (${baselineLen} -> ${enhancedLen} chars). ` +
            `Must be <= 40% growth.`
        );
    });
```

**Assertion**: `enhancedLen <= baselineLen * 1.4`
**Traces to**: NFR-001, AC-001-04

### 6.3 Additional Helper Tests (buildCriticalConstraints, buildConstraintReminder)

```javascript
// -------------------------------------------------------------------------
// 13. buildCriticalConstraints (BUG-0028)
// -------------------------------------------------------------------------

describe('BUG-0028: buildCriticalConstraints', () => {
    it('includes git commit prohibition when isIntermediatePhase is true', () => {
        const mod = loadModule();
        const phaseReq = { test_iteration: { enabled: false }, constitutional_validation: { enabled: false } };
        const result = mod.buildCriticalConstraints('06-implementation', phaseReq, null, true);

        assert.ok(result.some(c => c.includes('Do NOT run git commit')));
    });

    it('omits git commit prohibition when isIntermediatePhase is false', () => {
        const mod = loadModule();
        const phaseReq = { test_iteration: { enabled: false }, constitutional_validation: { enabled: false } };
        const result = mod.buildCriticalConstraints('06-implementation', phaseReq, null, false);

        assert.ok(!result.some(c => c.includes('Do NOT run git commit')));
    });

    it('includes test coverage constraint when test_iteration is enabled', () => {
        const mod = loadModule();
        const phaseReq = {
            test_iteration: { enabled: true, success_criteria: { min_coverage_percent: 80 } },
            constitutional_validation: { enabled: false }
        };
        const result = mod.buildCriticalConstraints('06-implementation', phaseReq, null, false);

        assert.ok(result.some(c => c.includes('80% coverage')));
    });

    it('includes constitutional constraint when constitutional_validation is enabled', () => {
        const mod = loadModule();
        const phaseReq = {
            test_iteration: { enabled: false },
            constitutional_validation: { enabled: true, articles: ['I'] }
        };
        const result = mod.buildCriticalConstraints('06-implementation', phaseReq, null, false);

        assert.ok(result.some(c => c.includes('Constitutional validation')));
    });

    it('includes artifact constraint when artifact_validation is enabled with paths', () => {
        const mod = loadModule();
        const phaseReq = {
            test_iteration: { enabled: false },
            constitutional_validation: { enabled: false },
            artifact_validation: { enabled: true, paths: ['some/path.md'] }
        };
        const result = mod.buildCriticalConstraints('06-implementation', phaseReq, null, false);

        assert.ok(result.some(c => c.includes('Required artifacts')));
    });

    it('includes failing test constraint from workflow modifiers', () => {
        const mod = loadModule();
        const phaseReq = { test_iteration: { enabled: false }, constitutional_validation: { enabled: false } };
        const modifiers = { require_failing_test_first: true };
        const result = mod.buildCriticalConstraints('06-implementation', phaseReq, modifiers, false);

        assert.ok(result.some(c => c.includes('failing test')));
    });

    it('returns empty array when no constraints apply', () => {
        const mod = loadModule();
        const phaseReq = {
            test_iteration: { enabled: false },
            constitutional_validation: { enabled: false },
            artifact_validation: { enabled: false }
        };
        const result = mod.buildCriticalConstraints('06-implementation', phaseReq, null, false);

        assert.deepEqual(result, []);
    });

    it('returns empty array on error (fail-open)', () => {
        const mod = loadModule();
        // Pass null as phaseReq to trigger internal error
        const result = mod.buildCriticalConstraints('06-implementation', null, null, true);

        assert.ok(Array.isArray(result), 'Should return an array');
        // Should still produce git commit constraint at minimum (isIntermediatePhase=true is checked before phaseReq access)
        // Actually, with null phaseReq, accessing phaseReq.test_iteration will throw, caught by try/catch
        // The behavior depends on whether git commit check is before the throw
        // Design: git commit check is FIRST (line: if (isIntermediatePhase)), so it pushes the constraint
        // Then phaseReq.test_iteration throws, caught, returns []
        // This means the result is [] (try/catch wraps the entire function)
        assert.deepEqual(result, []);
    });
});

// -------------------------------------------------------------------------
// 14. buildConstraintReminder (BUG-0028)
// -------------------------------------------------------------------------

describe('BUG-0028: buildConstraintReminder', () => {
    it('joins constraints with REMINDER prefix', () => {
        const mod = loadModule();
        const result = mod.buildConstraintReminder([
            'Do NOT run git commit -- the orchestrator manages all commits.',
            'Constitutional validation MUST complete before gate advancement.'
        ]);

        assert.ok(result.startsWith('REMINDER:'));
        assert.ok(result.includes('Do NOT run git commit'));
        assert.ok(result.includes('Constitutional validation'));
    });

    it('returns empty string for empty array', () => {
        const mod = loadModule();
        assert.equal(mod.buildConstraintReminder([]), '');
    });

    it('returns empty string for null input', () => {
        const mod = loadModule();
        assert.equal(mod.buildConstraintReminder(null), '');
    });

    it('returns empty string for undefined input', () => {
        const mod = loadModule();
        assert.equal(mod.buildConstraintReminder(undefined), '');
    });
});
```

### 6.4 Test Count Summary

| Suite | Test Count | Traces To |
|-------|-----------|-----------|
| 12. Injection salience | 6 | AC-006-01, AC-006-02, AC-006-03, AC-002-01, CON-003, NFR-001 |
| 13. buildCriticalConstraints | 8 | FR-001, FR-002, NFR-002 |
| 14. buildConstraintReminder | 4 | FR-001, NFR-002 |
| **Total new tests** | **18** | |

---

## 7. Integration Points and Call Chain

### 7.1 Complete Call Chain (After Changes)

```
isdlc.md STEP 3d (orchestrator)
  |
  |  Reads: iteration-requirements.json, artifact-paths.json, constitution.md
  |  Reads: state.json -> active_workflow.phases (NEW)
  |
  +-- buildGateRequirementsBlock(phaseKey, folder, type, root, phases)  [MODIFIED]
  |     |
  |     +-- loadIterationRequirements(root)      [unchanged]
  |     +-- loadArtifactPaths(root)              [unchanged]
  |     +-- parseConstitutionArticles(root)      [unchanged]
  |     +-- loadWorkflowModifiers(root, type, phase)  [unchanged]
  |     +-- Compute isIntermediatePhase           [NEW logic]
  |     |     phases[phases.length-1] !== phaseKey -> true (intermediate)
  |     |     phases is null/empty -> true (fail-safe)
  |     |
  |     +-- formatBlock(phaseKey, phaseReq, paths, articles, mods, isIntermediatePhase)  [MODIFIED]
  |           |
  |           +-- buildCriticalConstraints(phaseKey, phaseReq, mods, isIntermediate)  [NEW]
  |           |     Returns: string[] of imperative constraints
  |           |
  |           +-- (existing sections: iteration reqs, artifacts, articles, modifiers)
  |           |
  |           +-- buildConstraintReminder(constraints)  [NEW]
  |           |     Returns: "REMINDER: ..." or ''
  |           |
  |           Returns: full formatted block (string)
  |
  +-- Append block to delegation prompt
  +-- Append acknowledgment instruction (NEW - step 7)
  |
  +-- Delegate to phase agent via Task tool
        |
        Agent reads prompt:
        1. CRITICAL CONSTRAINTS section (primacy bias)  [NEW]
        2. Agent .md inline prohibition (static)        [FIXED - was dead cross-ref]
        3. Iteration requirements (existing)
        4. REMINDER footer (recency bias)               [NEW]
        |
        If agent violates constraint:
        +-- branch-guard.cjs blocks with enhanced message  [MODIFIED]
              Message now references CRITICAL CONSTRAINTS
```

### 7.2 Data Flow Across Modules

```
                    state.json
                   active_workflow.phases
                         |
                         v
   iteration-requirements.json --> buildGateRequirementsBlock() --> formatBlock()
   artifact-paths.json --------/         |                            |
   constitution.md ------------/         |                            |
   workflows.json -------------/    isIntermediatePhase          constraints[]
                                   (computed from phases)        (from buildCriticalConstraints)
                                                                      |
                                                                      v
                                                              buildConstraintReminder()
                                                                      |
                                                                      v
                                                               formatted block string
                                                                      |
                                                                      v
                                                          isdlc.md delegation prompt
                                                          + acknowledgment instruction
                                                                      |
                                                                      v
                                                              Phase Agent receives prompt
                                                                      |
                                                              (if violation occurs)
                                                                      |
                                                                      v
                                                          branch-guard.cjs blocks
                                                          with constraint-referencing message
```

---

## 8. Error Taxonomy

All error handling follows the existing fail-open pattern (NFR-002). No new error types are introduced.

| Error Scenario | Function | Behavior | Return Value |
|---------------|----------|----------|-------------|
| `phaseReq` is null in `buildCriticalConstraints` | `buildCriticalConstraints` | try/catch catches TypeError on property access | `[]` |
| `constraints` is null in `buildConstraintReminder` | `buildConstraintReminder` | Explicit null check | `''` |
| `phases` is undefined in `buildGateRequirementsBlock` | `buildGateRequirementsBlock` | Falls through to `isIntermediatePhase = true` | (no error, fail-safe) |
| `isIntermediatePhase` is undefined in `formatBlock` | `formatBlock` | Defaults to `true` via ternary | (no error, fail-safe) |
| Any exception in `formatBlock` | `formatBlock` | Existing try/catch | `''` |
| Any exception in `buildGateRequirementsBlock` | `buildGateRequirementsBlock` | Existing try/catch | `''` |

### Error Response Format

No new error responses are produced. The `outputBlockResponse()` format in `branch-guard.cjs` remains unchanged (JSON with `continue: false` and `stopReason` string). Only the `stopReason` string content changes.

---

## 9. Validation Rules

### 9.1 Input Validation

| Parameter | Function | Validation | Default on Invalid |
|-----------|----------|------------|-------------------|
| `phaseKey` | `buildGateRequirementsBlock` | Must be non-empty string | Return `''` |
| `phases` | `buildGateRequirementsBlock` | Must be Array with length > 0, or null/undefined | `isIntermediatePhase = true` |
| `isIntermediatePhase` | `formatBlock` | Must be boolean or undefined | Default `true` |
| `phaseReq` | `buildCriticalConstraints` | Must be object | Return `[]` (via try/catch) |
| `workflowModifiers` | `buildCriticalConstraints` | Must be object or null | Skip modifier checks |
| `constraints` | `buildConstraintReminder` | Must be Array with length > 0 | Return `''` |

### 9.2 Output Constraints

| Constraint | Measurement | Threshold |
|-----------|-------------|-----------|
| Total block size growth | `enhanced.length / baseline.length` | <= 1.4 (40% max growth) |
| Total block size | `block.length` | < 2000 characters for typical phase |
| CRITICAL CONSTRAINTS position | `indexOf('CRITICAL CONSTRAINTS') < indexOf('Iteration Requirements:')` | Must be true when constraints exist |
| REMINDER position | `indexOf('REMINDER:') > indexOf('Iteration Requirements:')` | Must be true when constraints exist |
| Generic footer present | `includes('DO NOT attempt to advance the gate')` | Must be true always |

---

## 10. Implementation Checklist

Implementation-ready checklist for the developer. Each item maps to a specific code change described above.

### Phase 1: Agent Files (FR-004) -- Independent, Zero Risk

- [ ] **05-software-developer.md line 29**: Replace `> See **Git Commit Prohibition** in CLAUDE.md.` with 3-line inline prohibition (Section 4.1)
- [ ] **16-quality-loop-engineer.md line 33**: Replace `> See **Git Commit Prohibition** in CLAUDE.md.` with 3-line inline prohibition (Section 4.2)
- [ ] **06-integration-tester.md after line 22**: Insert 3-line inline prohibition block (Section 4.3)
- [ ] **07-qa-engineer.md**: Verify existing prohibition at line 159 is adequate (Section 4.4 -- no code change)

### Phase 2: Injector Logic (FR-001, FR-002) -- Critical Path

- [ ] Add `buildCriticalConstraints()` function after line 200 (Section 2.1)
- [ ] Add `buildConstraintReminder()` function after `buildCriticalConstraints` (Section 2.2)
- [ ] Modify `formatBlock()` signature to accept `isIntermediatePhase` parameter (Section 2.3)
- [ ] Add CRITICAL CONSTRAINTS section to `formatBlock()` output (Section 2.3)
- [ ] Add REMINDER footer to `formatBlock()` output (Section 2.3)
- [ ] Modify `buildGateRequirementsBlock()` signature to accept `phases` parameter (Section 2.4)
- [ ] Add `isIntermediatePhase` computation in `buildGateRequirementsBlock()` (Section 2.4)
- [ ] Update module exports to include `buildCriticalConstraints` and `buildConstraintReminder` (Section 2.5)

### Phase 3: Tests (FR-006) -- Validates Phase 2

- [ ] Add `describe('BUG-0028: Injection salience')` suite with 6 tests (Section 6.2)
- [ ] Add `describe('BUG-0028: buildCriticalConstraints')` suite with 8 tests (Section 6.3)
- [ ] Add `describe('BUG-0028: buildConstraintReminder')` suite with 4 tests (Section 6.3)
- [ ] Verify all 62 existing assertions still pass (no regression)
- [ ] Verify character count growth test passes (NFR-001)

### Phase 4: Delegation Prompt (FR-003) -- Independent

- [ ] Update STEP 3d in isdlc.md: add step 5 (read phases array) (Section 3.3)
- [ ] Update STEP 3d in isdlc.md: update step 6 (format description) (Section 3.3)
- [ ] Add step 7 (acknowledgment instruction) (Section 3.3)
- [ ] Renumber error handling to step 8 (Section 3.3)

### Phase 5: Block Messages (FR-005) -- Independent

- [ ] Modify branch-guard.cjs block message to reference CRITICAL CONSTRAINTS (Section 5.2)
- [ ] Add "Do NOT retry" bullet to "What to do instead" section (Section 5.2)
- [ ] Verify gate-blocker.cjs `action_required` fields are intact (Section 5.4 -- verify only)

---

## Traceability Matrix

| FR | AC | Design Section | Test Case |
|----|-----|---------------|-----------|
| FR-001 | AC-001-01 | Section 2.3 (CRITICAL CONSTRAINTS in formatBlock) | Test 1: CRITICAL CONSTRAINTS before Iteration Requirements |
| FR-001 | AC-001-02 | Section 2.3 (REMINDER footer) | Test 2: REMINDER after all sections |
| FR-001 | AC-001-03 | Section 2.1 (constitutional constraint) | Test 3: Constitutional reminder in CRITICAL CONSTRAINTS |
| FR-001 | AC-001-04 | Section 2.3 (size budget) | Test 6: Character count within 40% growth |
| FR-002 | AC-002-01 | Section 2.1 (git commit prohibition) | Test 4: Git commit prohibition for intermediate phases |
| FR-002 | AC-002-02 | Section 2.1 (artifact constraint) | buildCriticalConstraints test: artifact constraint |
| FR-002 | AC-002-03 | Section 2.1 (workflow modifier constraint) | buildCriticalConstraints test: failing test constraint |
| FR-003 | AC-003-01 | Section 3.3 (step 7) | N/A (prompt template, not unit testable) |
| FR-003 | AC-003-02 | Section 3.4 (acknowledgment line) | N/A (best-effort agent behavior) |
| FR-004 | AC-004-01 | Section 4.1 (inline prohibition in 05-software-developer) | N/A (static file content) |
| FR-004 | AC-004-02 | Section 4.1-4.3 (all agent file changes) | N/A (static file content) |
| FR-004 | AC-004-03 | Section 4.1-4.4 (audit all 4 agents) | N/A (static file content) |
| FR-005 | AC-005-01 | Section 5.2 (branch-guard message) | N/A (integration observation) |
| FR-005 | AC-005-02 | Section 5.4 (verify gate-blocker) | N/A (verify-only) |
| FR-006 | AC-006-01 | Section 6.2 Test 1 | Test 1 |
| FR-006 | AC-006-02 | Section 6.2 Test 2 | Test 2 |
| FR-006 | AC-006-03 | Section 6.2 Test 3 | Test 3 |
| NFR-001 | (40% budget) | Section 2.3 (size analysis) | Test 6 |
| NFR-002 | (fail-open) | Section 2.1, 2.2 (try/catch) | buildCriticalConstraints test: fail-open |
| NFR-003 | (< 2000 chars) | Section 2.3 (output examples) | Test 6 (indirect) |

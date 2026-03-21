'use strict';

/**
 * iSDLC Blast Radius Validator - Test Suite (CJS)
 * =================================================
 * Unit tests for src/claude/hooks/blast-radius-validator.cjs
 *
 * The blast-radius-validator hook is a PreToolUse hook that validates
 * implementation coverage against impact-analysis.md affected files.
 * It blocks GATE-06 when unaddressed files exist.
 *
 * Run: node --test src/claude/hooks/tests/test-blast-radius-validator.test.cjs
 *
 * Traces to: REQ-001 through REQ-007, NFR-001 through NFR-005, CON-001 through CON-005
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
    setupTestEnv,
    cleanupTestEnv,
    getTestDir,
    prepareHook,
    runHook
} = require('./hook-test-utils.cjs');

// ---------------------------------------------------------------------------
// Source path & direct require for unit tests
// ---------------------------------------------------------------------------

const hookSrcPath = path.resolve(__dirname, '..', 'blast-radius-validator.cjs');

const {
    check,
    parseImpactAnalysis,
    parseBlastRadiusCoverage,
    getModifiedFiles,
    buildCoverageReport,
    formatBlockMessage
} = require(hookSrcPath);

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const IMPACT_SINGLE_TABLE = `## Affected Files

| File | Change Type | Risk | Rationale |
|------|------------|------|-----------|
| \`src/claude/hooks/blast-radius-validator.cjs\` | CREATE | High | New hook file |
| \`src/claude/hooks/dispatchers/pre-task-dispatcher.cjs\` | MODIFY | Medium | Add hook entry |
| \`src/claude/agents/05-software-developer.md\` | MODIFY | Low | Add blast radius sections |
`;

const IMPACT_MULTI_TABLE = `## FR-01: Hook Implementation

| File | Change Type | Risk |
|------|------------|------|
| \`src/claude/hooks/blast-radius-validator.cjs\` | CREATE | High |
| \`src/claude/hooks/lib/common.cjs\` | NO CHANGE | None |

## FR-02: Dispatcher Integration

| File | Change Type | Risk |
|------|------------|------|
| \`src/claude/hooks/dispatchers/pre-task-dispatcher.cjs\` | MODIFY | Medium |
| \`src/claude/hooks/blast-radius-validator.cjs\` | CREATE | High |
`;

const IMPACT_ALL_NO_CHANGE = `## Affected Files

| File | Change Type | Risk |
|------|------------|------|
| \`src/hooks/a.cjs\` | NO CHANGE | None |
| \`src/hooks/b.cjs\` | NO CHANGE | None |
`;

const IMPACT_WITH_DELETE = `## Affected Files

| File | Change Type | Risk |
|------|------------|------|
| \`src/hooks/new.cjs\` | CREATE | High |
| \`src/hooks/changed.cjs\` | MODIFY | Medium |
| \`src/hooks/removed.cjs\` | DELETE | Low |
`;

const IMPACT_EXTRA_WHITESPACE = `## Affected Files

| File | Change Type | Risk |
|------|------------|------|
|  \`src/hooks/spaced.cjs\`  |  MODIFY  | High |
`;

const IMPACT_MIXED_VALID_INVALID = `## Affected Files

| File | Change Type | Risk |
|------|------------|------|
| \`src/hooks/valid.cjs\` | MODIFY | High |
| src/hooks/no-backticks.cjs | MODIFY | High |
| plain text row |
`;

const IMPACT_NO_TABLES = `## Impact Analysis

This document describes the impact of the feature.

There are no tables here, just prose content describing the changes.
`;

// ---------------------------------------------------------------------------
// BUG-0055 Test Fixtures — 4-column and mixed-case formats
// Traces to: FR-001, FR-002, FR-003
// ---------------------------------------------------------------------------

/**
 * 4-column roundtable format from REQ-0066 (File | Module | Change Type | Traces).
 * Traces to: FR-001 AC-001-02, FR-003 AC-003-02
 */
const IMPACT_4COL_ROUNDTABLE = `## Tier 1: Direct Changes

| File | Module | Change Type | Requirement Traces |
|------|--------|-------------|-------------------|
| \`lib/memory-search.js\` | memory-search | Modify | FR-001, FR-006 |
| \`lib/memory-embedder.js\` | memory-embedder | Modify | FR-004, FR-005 |
| \`src/claude/commands/isdlc.md\` | analyze handler | Modify | FR-001, FR-002 |
`;

/**
 * 4-column variant format from REQ-0064 (File | Change Type | Description | Impact).
 * Traces to: FR-001 AC-001-02, FR-003 AC-003-02
 */
const IMPACT_4COL_VARIANT = `## Tier 1: Direct Changes

| File | Change Type | Description | REQ-0065 Impact |
|------|-------------|-------------|-----------------|
| \`lib/memory.js\` | New | Core memory module | None |
| \`src/claude/commands/isdlc.md\` | Modify | Analyze handler: inject context | Shared file |
| \`bin/isdlc.js\` | Modify | Register memory subcommand | None |
`;

/**
 * 3-column format with mixed-case "Type" values from REQ-0063.
 * Traces to: FR-001 AC-001-04
 */
const IMPACT_3COL_MIXEDCASE = `## Tier 1: Direct Changes

| File | Type | Description |
|------|------|-------------|
| \`lib/memory.js\` | New | Core memory module |
| \`src/claude/agents/roundtable-analyst.md\` | Modify | Add MEMORY_CONTEXT parsing |
| \`bin/isdlc.js\` | modify | Register memory subcommand |
`;

/**
 * Mixed sections with different column counts per section.
 * Traces to: FR-001 AC-001-03
 */
const IMPACT_MIXED_SECTIONS = `## Tier 1: Direct Changes

| File | Module | Change Type | Traces |
|------|--------|-------------|--------|
| \`src/hooks/validator.cjs\` | hooks | Modify | FR-001 |

## Tier 2: Indirect Changes

| File | Change Type | Risk |
|------|-------------|------|
| \`src/hooks/common.cjs\` | MODIFY | Low |
| \`src/agents/dev.md\` | NO CHANGE | None |
`;

/**
 * Substantial content but no recognized change type keywords.
 * Triggers zero-file guard. Traces to: FR-002 AC-002-01
 */
const IMPACT_SUBSTANTIAL_NO_MATCH = `## Impact Analysis

This is a detailed impact analysis document produced by the roundtable.
It contains multiple paragraphs and is well over 100 characters in length.

### Affected Areas

| Component | Scope | Risk Assessment | Action Required |
|-----------|-------|-----------------|-----------------|
| \`lib/memory.js\` | Core module | High risk to stability | Needs review |
| \`lib/search.js\` | Search layer | Medium risk | Update tests |

The above table does not contain standard change type keywords like CREATE, MODIFY, DELETE, or New.
Instead it uses non-standard column headers that the parser should not silently ignore.
`;

/**
 * Short content below threshold for zero-file guard.
 * Traces to: FR-002 AC-002-03
 */
const IMPACT_SHORT_EMPTY = `## Impact\n\nMinimal.`;

const COVERAGE_ALL_COVERED = `# Blast Radius Coverage

## Coverage Checklist

| File Path | Expected Change | Coverage Status | Notes |
|-----------|----------------|-----------------|-------|
| \`src/hooks/validator.cjs\` | CREATE | covered | New file created |
| \`src/hooks/dispatcher.cjs\` | MODIFY | covered | Modified: added hook entry |
`;

const COVERAGE_WITH_DEFERRAL = `# Blast Radius Coverage

## Coverage Checklist

| File Path | Expected Change | Coverage Status | Notes |
|-----------|----------------|-----------------|-------|
| \`src/hooks/validator.cjs\` | CREATE | covered | New file created |
| \`src/agents/dev.md\` | MODIFY | deferred | Deferred to REQ-0011: not needed for MVP |
`;

const COVERAGE_DEFERRED_EMPTY_NOTES = `# Blast Radius Coverage

## Coverage Checklist

| File Path | Expected Change | Coverage Status | Notes |
|-----------|----------------|-----------------|-------|
| \`src/agents/dev.md\` | MODIFY | deferred |  |
`;

const COVERAGE_MULTIPLE_DEFERRED = `# Blast Radius Coverage

## Coverage Checklist

| File Path | Expected Change | Coverage Status | Notes |
|-----------|----------------|-----------------|-------|
| \`src/a.cjs\` | MODIFY | deferred | Deferred: reason A |
| \`src/b.cjs\` | MODIFY | deferred | Deferred: reason B |
| \`src/c.cjs\` | CREATE | deferred | Deferred: reason C |
`;

const COVERAGE_CASE_INSENSITIVE = `# Blast Radius Coverage

## Coverage Checklist

| File Path | Expected Change | Coverage Status | Notes |
|-----------|----------------|-----------------|-------|
| \`src/a.cjs\` | MODIFY | Deferred | Reason A |
| \`src/b.cjs\` | MODIFY | DEFERRED | Reason B |
| \`src/c.cjs\` | MODIFY | deferred | Reason C |
`;

/**
 * Build a feature workflow state for Phase 06.
 */
function featureWorkflowState(overrides = {}) {
    return {
        current_phase: '06-implementation',
        active_workflow: {
            type: 'feature',
            id: 'REQ-0010',
            current_phase: '06-implementation',
            artifact_folder: 'REQ-0010-blast-radius-coverage',
            ...overrides
        }
    };
}

/**
 * Build a basic ctx object for check().
 */
function buildCtx(stateOverrides = {}, input = { tool_name: 'Task', tool_input: { prompt: 'test' } }) {
    return {
        input,
        state: {
            current_phase: '06-implementation',
            active_workflow: {
                type: 'feature',
                id: 'REQ-0010',
                current_phase: '06-implementation',
                artifact_folder: 'REQ-0010-blast-radius-coverage'
            },
            ...stateOverrides
        }
    };
}

// ===========================================================================
// 1. parseImpactAnalysis() Tests
// ===========================================================================

describe('parseImpactAnalysis()', () => {
    // TC-PIA-01: Single table with valid rows (AC-006-01)
    it('TC-PIA-01: parses single table with valid rows', () => {
        const result = parseImpactAnalysis(IMPACT_SINGLE_TABLE);
        assert.ok(Array.isArray(result));
        assert.equal(result.length, 3);
        assert.deepStrictEqual(result[0], { filePath: 'src/claude/hooks/blast-radius-validator.cjs', changeType: 'CREATE' });
        assert.deepStrictEqual(result[1], { filePath: 'src/claude/hooks/dispatchers/pre-task-dispatcher.cjs', changeType: 'MODIFY' });
        assert.deepStrictEqual(result[2], { filePath: 'src/claude/agents/05-software-developer.md', changeType: 'MODIFY' });
    });

    // TC-PIA-02: Multiple tables with deduplication (AC-006-02)
    it('TC-PIA-02: deduplicates files across multiple tables', () => {
        const result = parseImpactAnalysis(IMPACT_MULTI_TABLE);
        assert.ok(Array.isArray(result));
        // blast-radius-validator.cjs appears twice but should be deduped
        // common.cjs has NO CHANGE so excluded
        // pre-task-dispatcher.cjs is unique
        assert.equal(result.length, 2);
        const paths = result.map(f => f.filePath);
        assert.ok(paths.includes('src/claude/hooks/blast-radius-validator.cjs'));
        assert.ok(paths.includes('src/claude/hooks/dispatchers/pre-task-dispatcher.cjs'));
    });

    // TC-PIA-03: Change type extraction (AC-006-03)
    it('TC-PIA-03: extracts CREATE, MODIFY, DELETE change types', () => {
        const result = parseImpactAnalysis(IMPACT_WITH_DELETE);
        assert.equal(result.length, 3);
        assert.equal(result[0].changeType, 'CREATE');
        assert.equal(result[1].changeType, 'MODIFY');
        assert.equal(result[2].changeType, 'DELETE');
    });

    // TC-PIA-04: NO CHANGE entries excluded (AC-006-04)
    it('TC-PIA-04: excludes NO CHANGE entries', () => {
        const result = parseImpactAnalysis(IMPACT_MULTI_TABLE);
        const paths = result.map(f => f.filePath);
        assert.ok(!paths.includes('src/claude/hooks/lib/common.cjs'));
    });

    // TC-PIA-05: Rows without backticks skipped (AC-006-05)
    it('TC-PIA-05: skips rows without backtick-wrapped paths', () => {
        const result = parseImpactAnalysis(IMPACT_MIXED_VALID_INVALID);
        assert.equal(result.length, 1);
        assert.equal(result[0].filePath, 'src/hooks/valid.cjs');
    });

    // TC-PIA-06: Extra whitespace around delimiters (AC-006-05)
    it('TC-PIA-06: handles extra whitespace around delimiters', () => {
        const result = parseImpactAnalysis(IMPACT_EXTRA_WHITESPACE);
        assert.equal(result.length, 1);
        assert.equal(result[0].filePath, 'src/hooks/spaced.cjs');
        assert.equal(result[0].changeType, 'MODIFY');
    });

    // TC-PIA-07: Header and separator rows ignored (AC-006-01)
    it('TC-PIA-07: ignores header and separator rows', () => {
        const content = `| File | Change Type | Risk |
|------|------------|------|
| \`src/hooks/a.cjs\` | MODIFY | High |`;
        const result = parseImpactAnalysis(content);
        assert.equal(result.length, 1);
        assert.equal(result[0].filePath, 'src/hooks/a.cjs');
    });

    // TC-PIA-08: Empty string input (AC-002-02)
    it('TC-PIA-08: returns empty array for empty string', () => {
        const result = parseImpactAnalysis('');
        assert.deepStrictEqual(result, []);
    });

    // TC-PIA-09: Null input (AC-002-04)
    it('TC-PIA-09: returns null for null input', () => {
        const result = parseImpactAnalysis(null);
        assert.equal(result, null);
    });

    // TC-PIA-10: Undefined input (AC-002-04)
    it('TC-PIA-10: returns null for undefined input', () => {
        const result = parseImpactAnalysis(undefined);
        assert.equal(result, null);
    });

    // TC-PIA-11: Non-string input (AC-002-04)
    it('TC-PIA-11: returns null for non-string input', () => {
        assert.equal(parseImpactAnalysis(42), null);
        assert.equal(parseImpactAnalysis({}), null);
        assert.equal(parseImpactAnalysis([]), null);
    });

    // TC-PIA-12: All NO CHANGE entries (AC-006-04, EC-01)
    it('TC-PIA-12: returns empty array when all entries are NO CHANGE', () => {
        const result = parseImpactAnalysis(IMPACT_ALL_NO_CHANGE);
        assert.deepStrictEqual(result, []);
    });
});

// ===========================================================================
// 2. parseBlastRadiusCoverage() Tests
// ===========================================================================

describe('parseBlastRadiusCoverage()', () => {
    // TC-PBC-01: Valid deferred entries extracted (AC-001-03, AC-003-04)
    it('TC-PBC-01: extracts deferred entries with rationale', () => {
        const result = parseBlastRadiusCoverage(COVERAGE_WITH_DEFERRAL);
        assert.equal(result.size, 1);
        assert.ok(result.has('src/agents/dev.md'));
        const entry = result.get('src/agents/dev.md');
        assert.equal(entry.status, 'deferred');
        assert.ok(entry.notes.includes('Deferred to REQ-0011'));
    });

    // TC-PBC-02: Deferred with empty notes rejected (AC-003-04, EC-05)
    it('TC-PBC-02: rejects deferred entries with empty notes', () => {
        const result = parseBlastRadiusCoverage(COVERAGE_DEFERRED_EMPTY_NOTES);
        assert.equal(result.size, 0);
    });

    // TC-PBC-03: Case-insensitive status matching (AC-003-02)
    it('TC-PBC-03: matches deferred status case-insensitively', () => {
        const result = parseBlastRadiusCoverage(COVERAGE_CASE_INSENSITIVE);
        assert.equal(result.size, 3);
        assert.ok(result.has('src/a.cjs'));
        assert.ok(result.has('src/b.cjs'));
        assert.ok(result.has('src/c.cjs'));
    });

    // TC-PBC-04: Empty string input
    it('TC-PBC-04: returns empty Map for empty string', () => {
        const result = parseBlastRadiusCoverage('');
        assert.ok(result instanceof Map);
        assert.equal(result.size, 0);
    });

    // TC-PBC-05: Null input
    it('TC-PBC-05: returns empty Map for null input', () => {
        const result = parseBlastRadiusCoverage(null);
        assert.ok(result instanceof Map);
        assert.equal(result.size, 0);
    });

    // TC-PBC-06: Non-string input
    it('TC-PBC-06: returns empty Map for non-string input', () => {
        assert.equal(parseBlastRadiusCoverage(123).size, 0);
        assert.equal(parseBlastRadiusCoverage({}).size, 0);
    });

    // TC-PBC-07: Multiple deferred entries (AC-001-03)
    it('TC-PBC-07: extracts multiple deferred entries', () => {
        const result = parseBlastRadiusCoverage(COVERAGE_MULTIPLE_DEFERRED);
        assert.equal(result.size, 3);
    });

    // TC-PBC-08: No deferred entries (EC-04)
    it('TC-PBC-08: returns empty Map when all entries are covered', () => {
        const result = parseBlastRadiusCoverage(COVERAGE_ALL_COVERED);
        assert.equal(result.size, 0);
    });
});

// ===========================================================================
// 3. buildCoverageReport() Tests
// ===========================================================================

describe('buildCoverageReport()', () => {
    // TC-BCR-01: All files covered (AC-001-03, AC-001-05)
    it('TC-BCR-01: classifies all files as covered when in git diff', () => {
        const affected = [
            { filePath: 'a.cjs', changeType: 'CREATE' },
            { filePath: 'b.cjs', changeType: 'MODIFY' },
            { filePath: 'c.cjs', changeType: 'DELETE' }
        ];
        const modified = new Set(['a.cjs', 'b.cjs', 'c.cjs']);
        const deferred = new Map();
        const report = buildCoverageReport(affected, modified, deferred);

        assert.equal(report.total, 3);
        assert.equal(report.covered.length, 3);
        assert.equal(report.deferred.length, 0);
        assert.equal(report.unaddressed.length, 0);
    });

    // TC-BCR-02: All files unaddressed (AC-001-03, AC-001-04, EC-03)
    it('TC-BCR-02: classifies all files as unaddressed when empty diff', () => {
        const affected = [
            { filePath: 'a.cjs', changeType: 'MODIFY' },
            { filePath: 'b.cjs', changeType: 'MODIFY' },
            { filePath: 'c.cjs', changeType: 'MODIFY' }
        ];
        const modified = new Set();
        const deferred = new Map();
        const report = buildCoverageReport(affected, modified, deferred);

        assert.equal(report.total, 3);
        assert.equal(report.covered.length, 0);
        assert.equal(report.deferred.length, 0);
        assert.equal(report.unaddressed.length, 3);
    });

    // TC-BCR-03: Mix of covered, deferred, unaddressed (AC-001-03)
    it('TC-BCR-03: classifies mixed coverage correctly', () => {
        const affected = [
            { filePath: 'a.cjs', changeType: 'MODIFY' },
            { filePath: 'b.cjs', changeType: 'MODIFY' },
            { filePath: 'c.cjs', changeType: 'CREATE' },
            { filePath: 'd.cjs', changeType: 'DELETE' }
        ];
        const modified = new Set(['a.cjs', 'b.cjs']);
        const deferred = new Map([['c.cjs', { status: 'deferred', notes: 'Reason' }]]);
        const report = buildCoverageReport(affected, modified, deferred);

        assert.equal(report.total, 4);
        assert.equal(report.covered.length, 2);
        assert.equal(report.deferred.length, 1);
        assert.equal(report.unaddressed.length, 1);
        assert.equal(report.unaddressed[0].filePath, 'd.cjs');
    });

    // TC-BCR-04: File in both git diff and deferred (covered wins)
    it('TC-BCR-04: covered takes precedence over deferred', () => {
        const affected = [{ filePath: 'a.cjs', changeType: 'MODIFY' }];
        const modified = new Set(['a.cjs']);
        const deferred = new Map([['a.cjs', { status: 'deferred', notes: 'Reason' }]]);
        const report = buildCoverageReport(affected, modified, deferred);

        assert.equal(report.covered.length, 1);
        assert.equal(report.deferred.length, 0);
        assert.equal(report.unaddressed.length, 0);
    });

    // TC-BCR-05: Empty affected files list (AC-002-02)
    it('TC-BCR-05: handles empty affected files list', () => {
        const report = buildCoverageReport([], new Set(['a.cjs']), new Map());
        assert.equal(report.total, 0);
        assert.equal(report.covered.length, 0);
        assert.equal(report.deferred.length, 0);
        assert.equal(report.unaddressed.length, 0);
    });

    // TC-BCR-06: Deferred entry includes notes (AC-003-04)
    it('TC-BCR-06: deferred entry includes notes in output', () => {
        const affected = [{ filePath: 'a.cjs', changeType: 'MODIFY' }];
        const modified = new Set();
        const deferred = new Map([['a.cjs', { status: 'deferred', notes: 'Deferred: reason X' }]]);
        const report = buildCoverageReport(affected, modified, deferred);

        assert.equal(report.deferred.length, 1);
        assert.equal(report.deferred[0].filePath, 'a.cjs');
        assert.equal(report.deferred[0].notes, 'Deferred: reason X');
    });
});

// ===========================================================================
// 4. formatBlockMessage() Tests
// ===========================================================================

describe('formatBlockMessage()', () => {
    // TC-FBM-01: Single unaddressed file (AC-005-04)
    it('TC-FBM-01: formats message for single unaddressed file', () => {
        const report = {
            total: 3,
            covered: [{ filePath: 'a.cjs' }, { filePath: 'b.cjs' }],
            deferred: [],
            unaddressed: [{ filePath: 'c.cjs', changeType: 'MODIFY' }]
        };
        const msg = formatBlockMessage(report);
        assert.ok(msg.includes('1 of 3 affected files are unaddressed'));
        assert.ok(msg.includes('c.cjs'));
        assert.ok(msg.includes('expected: MODIFY'));
        assert.ok(msg.includes('To resolve:'));
    });

    // TC-FBM-02: Multiple unaddressed files (AC-005-04)
    it('TC-FBM-02: lists all unaddressed files', () => {
        const report = {
            total: 8,
            covered: [{ filePath: 'a.cjs' }, { filePath: 'b.cjs' }, { filePath: 'c.cjs' }, { filePath: 'd.cjs' }, { filePath: 'e.cjs' }],
            deferred: [],
            unaddressed: [
                { filePath: 'f.cjs', changeType: 'MODIFY' },
                { filePath: 'g.cjs', changeType: 'CREATE' },
                { filePath: 'h.cjs', changeType: 'DELETE' }
            ]
        };
        const msg = formatBlockMessage(report);
        assert.ok(msg.includes('3 of 8 affected files are unaddressed'));
        assert.ok(msg.includes('f.cjs'));
        assert.ok(msg.includes('g.cjs'));
        assert.ok(msg.includes('h.cjs'));
    });

    // TC-FBM-03: Message includes guidance (AC-005-04)
    it('TC-FBM-03: includes resolution guidance', () => {
        const report = {
            total: 2,
            covered: [{ filePath: 'a.cjs' }],
            deferred: [],
            unaddressed: [{ filePath: 'b.cjs', changeType: 'MODIFY' }]
        };
        const msg = formatBlockMessage(report);
        assert.ok(msg.includes('To resolve:'));
        assert.ok(msg.includes('Modify the unaddressed files'));
        assert.ok(msg.includes('deferral rationale'));
        assert.ok(msg.includes('blast-radius-coverage.md'));
    });
});

// ===========================================================================
// 5. check() - Context Guards
// ===========================================================================

describe('check() context guards', () => {
    // TC-CG-01: Missing ctx.input (E-SKIP-04)
    it('TC-CG-01: allows when ctx.input is missing', () => {
        const result = check({ state: featureWorkflowState() });
        assert.equal(result.decision, 'allow');
        assert.equal(result.stateModified, false);
    });

    // TC-CG-02: Missing ctx.state (E-SKIP-05)
    it('TC-CG-02: allows when ctx.state is missing', () => {
        const result = check({ input: { tool_name: 'Task' } });
        assert.equal(result.decision, 'allow');
        assert.equal(result.stateModified, false);
    });

    // TC-CG-03: No active_workflow (AC-002-03, E-SKIP-01)
    it('TC-CG-03: allows when no active_workflow in state', () => {
        const result = check({
            input: { tool_name: 'Task' },
            state: { current_phase: '06-implementation' }
        });
        assert.equal(result.decision, 'allow');
        assert.equal(result.stateModified, false);
    });

    // TC-CG-04: No artifact_folder (E-DEGRADE-01)
    it('TC-CG-04: allows when no artifact_folder in active_workflow', () => {
        const result = check({
            input: { tool_name: 'Task' },
            state: {
                active_workflow: {
                    type: 'feature',
                    current_phase: '06-implementation'
                    // no artifact_folder
                }
            }
        });
        assert.equal(result.decision, 'allow');
        assert.equal(result.stateModified, false);
    });

    // TC-CG-05: stateModified always false (CON-003)
    it('TC-CG-05: stateModified is always false', () => {
        // Allow case
        const r1 = check({ input: {}, state: {} });
        assert.equal(r1.stateModified, false);

        // With active_workflow but missing impact file
        const r2 = check(buildCtx());
        assert.equal(r2.stateModified, false);
    });

    // TC-CG-06: Null ctx (E-UNCAUGHT-01)
    it('TC-CG-06: allows when ctx is null (fail-open)', () => {
        const result = check(null);
        assert.equal(result.decision, 'allow');
    });

    // TC-CG-07: Empty ctx object (E-SKIP-04)
    it('TC-CG-07: allows for empty ctx object', () => {
        const result = check({});
        assert.equal(result.decision, 'allow');
        assert.equal(result.stateModified, false);
    });

    // TC-CG-08: Empty active_workflow object (E-DEGRADE-01)
    it('TC-CG-08: allows when active_workflow is empty object', () => {
        const result = check({
            input: { tool_name: 'Task' },
            state: { active_workflow: {} }
        });
        assert.equal(result.decision, 'allow');
        assert.equal(result.stateModified, false);
    });
});

// ===========================================================================
// 6. check() - Full Flow Integration Tests (file-system based)
// ===========================================================================

describe('check() full flow', () => {
    let testDir;

    beforeEach(() => {
        testDir = setupTestEnv(featureWorkflowState());
        // Create artifact folder
        const artifactDir = path.join(testDir, 'docs', 'requirements', 'REQ-0010-blast-radius-coverage');
        fs.mkdirSync(artifactDir, { recursive: true });
    });

    afterEach(() => {
        cleanupTestEnv();
    });

    function artifactPath(filename) {
        return path.join(testDir, 'docs', 'requirements', 'REQ-0010-blast-radius-coverage', filename);
    }

    // TC-INT-05: Allow when impact-analysis.md missing (AC-002-01, E-DEGRADE-02)
    it('TC-INT-05: allows when impact-analysis.md is missing', () => {
        const ctx = buildCtx();
        const result = check(ctx);
        assert.equal(result.decision, 'allow');
        assert.equal(result.stateModified, false);
    });

    // TC-INT-06: Allow when impact-analysis.md has no tables (AC-002-02, E-DEGRADE-03)
    it('TC-INT-06: allows when impact-analysis.md has no matching tables', () => {
        fs.writeFileSync(artifactPath('impact-analysis.md'), IMPACT_NO_TABLES);
        const ctx = buildCtx();
        const result = check(ctx);
        assert.equal(result.decision, 'allow');
    });

    // TC-INT-10: Allow when all entries are NO CHANGE (AC-006-04)
    it('TC-INT-10: allows when all entries are NO CHANGE', () => {
        fs.writeFileSync(artifactPath('impact-analysis.md'), IMPACT_ALL_NO_CHANGE);
        const ctx = buildCtx();
        const result = check(ctx);
        assert.equal(result.decision, 'allow');
    });

    // TC-INT-08: Allow when git diff fails (AC-007-04, E-GIT-01)
    // The test env dir is NOT a git repo, so git diff will fail
    it('TC-INT-08: allows when git diff fails (not a git repo)', () => {
        fs.writeFileSync(artifactPath('impact-analysis.md'), IMPACT_SINGLE_TABLE);
        const ctx = buildCtx();
        const result = check(ctx);
        assert.equal(result.decision, 'allow');
        assert.ok(result.stderr && result.stderr.includes('git diff failed'));
    });

    // TC-ERR-01: File read error on impact-analysis.md (E-IO-01)
    it('TC-ERR-01: allows when impact-analysis.md is a directory (read error)', () => {
        // Create impact-analysis.md as a directory to trigger read error
        const dirPath = artifactPath('impact-analysis.md');
        fs.mkdirSync(dirPath, { recursive: true });
        const ctx = buildCtx();
        const result = check(ctx);
        assert.equal(result.decision, 'allow');
        assert.ok(result.stderr && result.stderr.includes('error reading impact-analysis.md'));
    });

    // TC-ERR-07: parseImpactAnalysis returns empty array (E-DEGRADE-03)
    it('TC-ERR-07: allows when impact-analysis.md has content but no table rows', () => {
        fs.writeFileSync(artifactPath('impact-analysis.md'), 'Some text but no | table | rows |');
        const ctx = buildCtx();
        const result = check(ctx);
        assert.equal(result.decision, 'allow');
    });
});

// ===========================================================================
// 7. check() - Git Integration Tests (require temp git repo)
// ===========================================================================

describe('check() with temp git repo', () => {
    let testDir;

    beforeEach(() => {
        testDir = setupTestEnv(featureWorkflowState());
        // Create artifact folder
        const artifactDir = path.join(testDir, 'docs', 'requirements', 'REQ-0010-blast-radius-coverage');
        fs.mkdirSync(artifactDir, { recursive: true });
    });

    afterEach(() => {
        cleanupTestEnv();
    });

    function artifactPath(filename) {
        return path.join(testDir, 'docs', 'requirements', 'REQ-0010-blast-radius-coverage', filename);
    }

    /**
     * Initialize a temp git repo with main branch, create a feature branch,
     * and optionally modify files on the feature branch.
     */
    function initGitRepo(filesToModify = []) {
        const { execSync } = require('child_process');
        const opts = { cwd: testDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] };

        execSync('git init', opts);
        execSync('git config user.email "test@test.com"', opts);
        execSync('git config user.name "Test"', opts);

        // Create initial commit on main
        fs.writeFileSync(path.join(testDir, 'README.md'), '# Test');
        execSync('git add -A', opts);
        execSync('git commit -m "initial"', opts);

        // Rename default branch to main
        try {
            execSync('git branch -M main', opts);
        } catch (e) {
            // Already on main
        }

        // Create feature branch
        execSync('git checkout -b feature/test', opts);

        // Modify specified files
        for (const filePath of filesToModify) {
            const fullPath = path.join(testDir, filePath);
            const dir = path.dirname(fullPath);
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(fullPath, `// Modified: ${filePath}\n`);
        }

        if (filesToModify.length > 0) {
            execSync('git add -A', opts);
            execSync('git commit -m "feature changes"', opts);
        }
    }

    // TC-INT-01: Full allow - all affected files in git diff (AC-001-05, US-001)
    it('TC-INT-01: allows when all affected files are in git diff', () => {
        const impactContent = `## Files\n\n| File | Change Type |\n|------|------|\n| \`src/a.cjs\` | CREATE |\n| \`src/b.cjs\` | MODIFY |\n`;
        fs.writeFileSync(artifactPath('impact-analysis.md'), impactContent);

        initGitRepo(['src/a.cjs', 'src/b.cjs']);

        const ctx = buildCtx();
        const result = check(ctx);
        assert.equal(result.decision, 'allow');
        assert.equal(result.stateModified, false);
    });

    // TC-INT-02: Full block - unaddressed files (AC-001-04, US-001)
    it('TC-INT-02: blocks when unaddressed files exist', () => {
        const impactContent = `## Files\n\n| File | Change Type |\n|------|------|\n| \`src/a.cjs\` | CREATE |\n| \`src/b.cjs\` | MODIFY |\n| \`src/c.cjs\` | MODIFY |\n`;
        fs.writeFileSync(artifactPath('impact-analysis.md'), impactContent);

        // Only modify 1 of 3 files
        initGitRepo(['src/a.cjs']);

        const ctx = buildCtx();
        const result = check(ctx);
        assert.equal(result.decision, 'block');
        assert.ok(result.stopReason);
        assert.ok(result.stopReason.includes('BLAST RADIUS COVERAGE INCOMPLETE'));
        assert.ok(result.stopReason.includes('src/b.cjs'));
        assert.ok(result.stopReason.includes('src/c.cjs'));
        assert.equal(result.stateModified, false);
    });

    // TC-INT-03: Allow with mix of covered and deferred (AC-001-03, AC-001-05)
    it('TC-INT-03: allows with mix of covered and deferred files', () => {
        const impactContent = `## Files\n\n| File | Change Type |\n|------|------|\n| \`src/a.cjs\` | CREATE |\n| \`src/b.cjs\` | MODIFY |\n| \`src/c.cjs\` | MODIFY |\n`;
        fs.writeFileSync(artifactPath('impact-analysis.md'), impactContent);

        // Modify 2 of 3 in git
        initGitRepo(['src/a.cjs', 'src/b.cjs']);

        // Defer the 3rd
        const coverageContent = `## Coverage\n\n| File Path | Expected Change | Coverage Status | Notes |\n|---|---|---|---|\n| \`src/c.cjs\` | MODIFY | deferred | Not needed for MVP |\n`;
        fs.writeFileSync(artifactPath('blast-radius-coverage.md'), coverageContent);

        const ctx = buildCtx();
        const result = check(ctx);
        assert.equal(result.decision, 'allow');
    });

    // TC-INT-04: Block when deferred lacks rationale (AC-003-04)
    it('TC-INT-04: blocks when deferred file has no rationale', () => {
        const impactContent = `## Files\n\n| File | Change Type |\n|------|------|\n| \`src/a.cjs\` | CREATE |\n| \`src/b.cjs\` | MODIFY |\n`;
        fs.writeFileSync(artifactPath('impact-analysis.md'), impactContent);

        // Modify 1
        initGitRepo(['src/a.cjs']);

        // Defer the 2nd but with empty notes
        fs.writeFileSync(artifactPath('blast-radius-coverage.md'), COVERAGE_DEFERRED_EMPTY_NOTES);

        const ctx = buildCtx();
        const result = check(ctx);
        assert.equal(result.decision, 'block');
        assert.ok(result.stopReason.includes('src/b.cjs'));
    });

    // TC-INT-09: Block message lists all unaddressed files (AC-005-04)
    it('TC-INT-09: block message lists all unaddressed files with change types', () => {
        const impactContent = `## Files\n\n| File | Change Type |\n|------|------|\n| \`src/a.cjs\` | CREATE |\n| \`src/b.cjs\` | MODIFY |\n| \`src/c.cjs\` | MODIFY |\n| \`src/d.cjs\` | DELETE |\n| \`src/e.cjs\` | MODIFY |\n`;
        fs.writeFileSync(artifactPath('impact-analysis.md'), impactContent);

        // Only modify 2 of 5
        initGitRepo(['src/a.cjs', 'src/b.cjs']);

        const ctx = buildCtx();
        const result = check(ctx);
        assert.equal(result.decision, 'block');
        assert.ok(result.stopReason.includes('3 of 5'));
        assert.ok(result.stopReason.includes('src/c.cjs'));
        assert.ok(result.stopReason.includes('src/d.cjs'));
        assert.ok(result.stopReason.includes('src/e.cjs'));
    });

    // TC-ERR-06: Empty git diff (EC-03) -- all files unaddressed
    it('TC-ERR-06: blocks when git diff is empty (no changes on branch)', () => {
        const impactContent = `## Files\n\n| File | Change Type |\n|------|------|\n| \`src/a.cjs\` | MODIFY |\n`;
        fs.writeFileSync(artifactPath('impact-analysis.md'), impactContent);

        // Init git but don't modify any files
        initGitRepo([]);

        const ctx = buildCtx();
        const result = check(ctx);
        assert.equal(result.decision, 'block');
    });

    // TC-ERR-10: All covered or deferred, none unaddressed (AC-001-05)
    it('TC-ERR-10: allows when all files are covered or deferred', () => {
        const impactContent = `## Files\n\n| File | Change Type |\n|------|------|\n| \`src/a.cjs\` | CREATE |\n| \`src/b.cjs\` | MODIFY |\n| \`src/c.cjs\` | MODIFY |\n| \`src/d.cjs\` | DELETE |\n| \`src/e.cjs\` | MODIFY |\n`;
        fs.writeFileSync(artifactPath('impact-analysis.md'), impactContent);

        // Modify 3
        initGitRepo(['src/a.cjs', 'src/b.cjs', 'src/c.cjs']);

        // Defer 2
        const coverageContent = `## Coverage\n\n| File Path | Expected Change | Coverage Status | Notes |\n|---|---|---|---|\n| \`src/d.cjs\` | DELETE | deferred | Removed upstream |\n| \`src/e.cjs\` | MODIFY | deferred | Not in scope for MVP |\n`;
        fs.writeFileSync(artifactPath('blast-radius-coverage.md'), coverageContent);

        const ctx = buildCtx();
        const result = check(ctx);
        assert.equal(result.decision, 'allow');
    });
});

// ===========================================================================
// 8. Security Tests
// ===========================================================================

describe('Security tests', () => {
    // TC-SEC-01: Path traversal in file path content
    it('TC-SEC-01: path traversal in file paths treated as literal strings', () => {
        const content = `| File | Change Type |\n|------|------|\n| \`../../etc/passwd\` | MODIFY |\n`;
        const result = parseImpactAnalysis(content);
        assert.equal(result.length, 1);
        // The path is treated as a literal string for Set comparison, not as a filesystem path
        assert.equal(result[0].filePath, '../../etc/passwd');
    });

    // TC-SEC-02: stateModified always false (CON-003)
    it('TC-SEC-02: stateModified is false for all check() outcomes', () => {
        // Allow (no input)
        assert.equal(check({}).stateModified, false);
        // Allow (no active workflow)
        assert.equal(check({ input: {}, state: {} }).stateModified, false);
        // Allow (null ctx, caught by try/catch)
        assert.equal(check(null).stateModified, false);
    });

    // TC-SEC-03: No new state.json fields written (CON-003)
    it('TC-SEC-03: hook does not modify state', () => {
        let testDir;
        try {
            testDir = setupTestEnv(featureWorkflowState());
            const { readState: readTestState } = require('./hook-test-utils.cjs');
            const stateBefore = JSON.stringify(readTestState());

            const ctx = buildCtx();
            check(ctx);

            const stateAfter = JSON.stringify(readTestState());
            assert.equal(stateBefore, stateAfter);
        } finally {
            cleanupTestEnv();
        }
    });
});

// ===========================================================================
// 9. Dispatcher Integration Tests (shouldActivate logic)
// ===========================================================================

describe('Dispatcher shouldActivate logic', () => {
    // Simulate the shouldActivate guard from the dispatcher
    function shouldActivate(ctx) {
        if (!ctx.state?.active_workflow) return false;
        if (ctx.state.active_workflow.type !== 'feature') return false;
        const phase = ctx.state.active_workflow.current_phase || '';
        return phase === '06-implementation';
    }

    // TC-DISP-01: True for feature workflow in Phase 06
    it('TC-DISP-01: activates for feature workflow in Phase 06', () => {
        const ctx = {
            state: {
                active_workflow: {
                    type: 'feature',
                    current_phase: '06-implementation'
                }
            }
        };
        assert.equal(shouldActivate(ctx), true);
    });

    // TC-DISP-02: False for fix workflow (CON-005)
    it('TC-DISP-02: skips fix workflows', () => {
        const ctx = {
            state: {
                active_workflow: {
                    type: 'fix',
                    current_phase: '06-implementation'
                }
            }
        };
        assert.equal(shouldActivate(ctx), false);
    });

    // TC-DISP-03: False for non-Phase-06 (AC-001-06)
    it('TC-DISP-03: skips non-Phase-06 phases', () => {
        const ctx = {
            state: {
                active_workflow: {
                    type: 'feature',
                    current_phase: '05-test-strategy'
                }
            }
        };
        assert.equal(shouldActivate(ctx), false);
    });

    // TC-DISP-04: False for no active workflow (AC-002-03)
    it('TC-DISP-04: skips when no active workflow', () => {
        assert.equal(shouldActivate({ state: {} }), false);
        assert.equal(shouldActivate({ state: { current_phase: '06-implementation' } }), false);
    });
});

// ===========================================================================
// 10. Constraint Validation Tests
// ===========================================================================

describe('Constraint validation', () => {
    // TC-CON-01: Module exports check(ctx) (CON-001, AC-007-01)
    it('TC-CON-01: module exports check as a function', () => {
        assert.equal(typeof check, 'function');
    });

    // TC-CON-02: Module exports all documented functions
    it('TC-CON-02: module exports all 6 documented functions', () => {
        assert.equal(typeof check, 'function');
        assert.equal(typeof parseImpactAnalysis, 'function');
        assert.equal(typeof parseBlastRadiusCoverage, 'function');
        assert.equal(typeof getModifiedFiles, 'function');
        assert.equal(typeof buildCoverageReport, 'function');
        assert.equal(typeof formatBlockMessage, 'function');
    });
});

// ===========================================================================
// 11. getModifiedFiles() Tests
// ===========================================================================

describe('getModifiedFiles()', () => {
    it('returns null when not a git repo (fail-open)', () => {
        let testDir;
        try {
            testDir = setupTestEnv();
            const result = getModifiedFiles(testDir);
            assert.equal(result, null);
        } finally {
            cleanupTestEnv();
        }
    });

    it('returns Set of modified files for a valid git repo', () => {
        let testDir;
        try {
            testDir = setupTestEnv();
            const { execSync } = require('child_process');
            const opts = { cwd: testDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] };

            execSync('git init', opts);
            execSync('git config user.email "t@t.com"', opts);
            execSync('git config user.name "T"', opts);
            fs.writeFileSync(path.join(testDir, 'file.txt'), 'init');
            execSync('git add -A', opts);
            execSync('git commit -m "init"', opts);
            try { execSync('git branch -M main', opts); } catch (e) {}
            execSync('git checkout -b feat', opts);
            fs.writeFileSync(path.join(testDir, 'new.txt'), 'new');
            execSync('git add -A', opts);
            execSync('git commit -m "feat"', opts);

            const result = getModifiedFiles(testDir);
            assert.ok(result instanceof Set);
            assert.ok(result.has('new.txt'));
        } finally {
            cleanupTestEnv();
        }
    });

    it('returns empty Set when no changes on feature branch', () => {
        let testDir;
        try {
            testDir = setupTestEnv();
            const { execSync } = require('child_process');
            const opts = { cwd: testDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] };

            execSync('git init', opts);
            execSync('git config user.email "t@t.com"', opts);
            execSync('git config user.name "T"', opts);
            fs.writeFileSync(path.join(testDir, 'file.txt'), 'init');
            execSync('git add -A', opts);
            execSync('git commit -m "init"', opts);
            try { execSync('git branch -M main', opts); } catch (e) {}
            execSync('git checkout -b feat', opts);

            const result = getModifiedFiles(testDir);
            assert.ok(result instanceof Set);
            assert.equal(result.size, 0);
        } finally {
            cleanupTestEnv();
        }
    });
});

// ===========================================================================
// 12. NFR Tests
// ===========================================================================

describe('NFR validation', () => {
    // TC-NFR-01: Performance with large input
    it('TC-NFR-01: parseImpactAnalysis handles 100 rows within 50ms', () => {
        let content = '| File | Change Type |\n|------|------|\n';
        for (let i = 0; i < 100; i++) {
            content += `| \`src/file-${i}.cjs\` | MODIFY |\n`;
        }
        const start = Date.now();
        const result = parseImpactAnalysis(content);
        const elapsed = Date.now() - start;

        assert.equal(result.length, 100);
        assert.ok(elapsed < 50, `Parsing took ${elapsed}ms, expected < 50ms`);
    });

    // TC-NFR-04: CJS module format (CON-001)
    it('TC-NFR-04: hook file is valid CJS (requireable)', () => {
        // If we got this far, require() succeeded
        const mod = require(hookSrcPath);
        assert.equal(typeof mod.check, 'function');
    });
});

// ===========================================================================
// 13. Standalone Execution Tests
// ===========================================================================

describe('Standalone execution', () => {
    let testDir;
    let hookPath;

    beforeEach(() => {
        testDir = setupTestEnv(featureWorkflowState());
        hookPath = prepareHook(hookSrcPath);
    });

    afterEach(() => {
        cleanupTestEnv();
    });

    it('exits cleanly with no input', async () => {
        const result = await runHook(hookPath, '');
        assert.equal(result.code, 0);
    });

    it('exits cleanly with valid allow context', async () => {
        // No impact-analysis.md => allow
        const input = { tool_name: 'Task', tool_input: { prompt: 'test' } };
        const result = await runHook(hookPath, input);
        assert.equal(result.code, 0);
        // Should not have a block response in stdout
        if (result.stdout.trim()) {
            const parsed = JSON.parse(result.stdout);
            // If there is output, it should not be a block
            assert.ok(!parsed.stopReason || parsed.stopReason === undefined);
        }
    });
});

// ===========================================================================
// 14. BUG-0055: 4-Column Format Parsing (FR-001)
// Traces to: FR-001 AC-001-01 through AC-001-04
// ===========================================================================

describe('BUG-0055: parseImpactAnalysis() 4-column format', () => {
    // TC-PIA-13: Parses 4-column roundtable format (AC-001-02)
    it('TC-PIA-13: parses 4-column roundtable format (File|Module|Change Type|Traces)', () => {
        const result = parseImpactAnalysis(IMPACT_4COL_ROUNDTABLE);
        assert.ok(Array.isArray(result), 'Expected array result');
        assert.equal(result.length, 3, `Expected 3 entries, got ${result.length}`);
        const paths = result.map(f => f.filePath);
        assert.ok(paths.includes('lib/memory-search.js'), 'Missing lib/memory-search.js');
        assert.ok(paths.includes('lib/memory-embedder.js'), 'Missing lib/memory-embedder.js');
        assert.ok(paths.includes('src/claude/commands/isdlc.md'), 'Missing src/claude/commands/isdlc.md');
    });

    // TC-PIA-14: Parses 4-column variant format (AC-001-02)
    it('TC-PIA-14: parses 4-column variant format (File|Change Type|Description|Impact)', () => {
        const result = parseImpactAnalysis(IMPACT_4COL_VARIANT);
        assert.ok(Array.isArray(result), 'Expected array result');
        assert.equal(result.length, 3, `Expected 3 entries, got ${result.length}`);
        const paths = result.map(f => f.filePath);
        assert.ok(paths.includes('lib/memory.js'), 'Missing lib/memory.js');
        assert.ok(paths.includes('src/claude/commands/isdlc.md'), 'Missing src/claude/commands/isdlc.md');
        assert.ok(paths.includes('bin/isdlc.js'), 'Missing bin/isdlc.js');
    });

    // TC-PIA-15: Parses 3-column mixed-case format (AC-001-04)
    it('TC-PIA-15: parses 3-column mixed-case format (New, Modify, modify)', () => {
        const result = parseImpactAnalysis(IMPACT_3COL_MIXEDCASE);
        assert.ok(Array.isArray(result), 'Expected array result');
        assert.equal(result.length, 3, `Expected 3 entries, got ${result.length}`);
        const paths = result.map(f => f.filePath);
        assert.ok(paths.includes('lib/memory.js'), 'Missing lib/memory.js');
        assert.ok(paths.includes('src/claude/agents/roundtable-analyst.md'), 'Missing roundtable-analyst.md');
        assert.ok(paths.includes('bin/isdlc.js'), 'Missing bin/isdlc.js');
    });

    // TC-PIA-16: Normalizes "New" to "CREATE" (AC-001-04)
    it('TC-PIA-16: normalizes "New" to "CREATE"', () => {
        const content = `| File | Type |\n|------|------|\n| \`src/file.js\` | New |\n`;
        const result = parseImpactAnalysis(content);
        assert.equal(result.length, 1);
        assert.equal(result[0].changeType, 'CREATE', `Expected CREATE but got ${result[0].changeType}`);
    });

    // TC-PIA-17: Normalizes "Modify" to "MODIFY" (AC-001-04)
    it('TC-PIA-17: normalizes "Modify" to "MODIFY"', () => {
        const content = `| File | Type |\n|------|------|\n| \`src/file.js\` | Modify |\n`;
        const result = parseImpactAnalysis(content);
        assert.equal(result.length, 1);
        assert.equal(result[0].changeType, 'MODIFY', `Expected MODIFY but got ${result[0].changeType}`);
    });

    // TC-PIA-18: Normalizes "Major modify" to "MODIFY" (AC-001-04)
    it('TC-PIA-18: normalizes "Major modify" to "MODIFY"', () => {
        const content = `| File | Type |\n|------|------|\n| \`src/file.js\` | Major modify |\n`;
        const result = parseImpactAnalysis(content);
        assert.equal(result.length, 1);
        assert.equal(result[0].changeType, 'MODIFY', `Expected MODIFY but got ${result[0].changeType}`);
    });

    // TC-PIA-19: Parses mixed sections with different column counts (AC-001-03)
    it('TC-PIA-19: parses mixed sections with different column counts', () => {
        const result = parseImpactAnalysis(IMPACT_MIXED_SECTIONS);
        assert.ok(Array.isArray(result), 'Expected array result');
        // Tier 1 has validator.cjs (Modify), Tier 2 has common.cjs (MODIFY) and dev.md (NO CHANGE, excluded)
        assert.equal(result.length, 2, `Expected 2 entries, got ${result.length}`);
        const paths = result.map(f => f.filePath);
        assert.ok(paths.includes('src/hooks/validator.cjs'), 'Missing src/hooks/validator.cjs');
        assert.ok(paths.includes('src/hooks/common.cjs'), 'Missing src/hooks/common.cjs');
    });

    // TC-PIA-20: Existing 3-column fixtures still parse correctly (AC-001-01, regression guard)
    it('TC-PIA-20: existing 3-column fixtures still parse correctly (regression)', () => {
        const result = parseImpactAnalysis(IMPACT_SINGLE_TABLE);
        assert.ok(Array.isArray(result));
        assert.equal(result.length, 3);
        assert.deepStrictEqual(result[0], { filePath: 'src/claude/hooks/blast-radius-validator.cjs', changeType: 'CREATE' });
        assert.deepStrictEqual(result[1], { filePath: 'src/claude/hooks/dispatchers/pre-task-dispatcher.cjs', changeType: 'MODIFY' });
        assert.deepStrictEqual(result[2], { filePath: 'src/claude/agents/05-software-developer.md', changeType: 'MODIFY' });
    });
});

// ===========================================================================
// 15. BUG-0055: Zero-File Guard (FR-002)
// Traces to: FR-002 AC-002-01 through AC-002-03
// ===========================================================================

describe('BUG-0055: Zero-file guard', () => {
    let testDir;

    beforeEach(() => {
        testDir = setupTestEnv(featureWorkflowState());
        const artifactDir = path.join(testDir, 'docs', 'requirements', 'REQ-0010-blast-radius-coverage');
        fs.mkdirSync(artifactDir, { recursive: true });
    });

    afterEach(() => {
        cleanupTestEnv();
    });

    function artifactPath(filename) {
        return path.join(testDir, 'docs', 'requirements', 'REQ-0010-blast-radius-coverage', filename);
    }

    // TC-ZFG-01: Warning emitted for substantial content with zero parsed files (AC-002-01)
    it('TC-ZFG-01: warns when substantial content yields zero parsed files', () => {
        fs.writeFileSync(artifactPath('impact-analysis.md'), IMPACT_SUBSTANTIAL_NO_MATCH);
        const ctx = buildCtx();
        const result = check(ctx);
        assert.equal(result.decision, 'allow', 'Should still allow (fail-open)');
        assert.ok(result.stderr, 'Expected stderr warning');
        assert.ok(
            result.stderr.includes('no affected files were parsed') ||
            result.stderr.includes('content but no affected files'),
            `Expected zero-file warning in stderr, got: ${result.stderr}`
        );
    });

    // TC-ZFG-02: Validator still allows (fail-open) when zero-file guard fires (AC-002-02)
    it('TC-ZFG-02: still allows (fail-open) when zero-file guard fires', () => {
        fs.writeFileSync(artifactPath('impact-analysis.md'), IMPACT_SUBSTANTIAL_NO_MATCH);
        const ctx = buildCtx();
        const result = check(ctx);
        assert.equal(result.decision, 'allow', 'Zero-file guard must not block');
    });

    // TC-ZFG-03: Guard does NOT fire for short content (AC-002-03)
    it('TC-ZFG-03: no warning for short content below 100-char threshold', () => {
        fs.writeFileSync(artifactPath('impact-analysis.md'), IMPACT_SHORT_EMPTY);
        const ctx = buildCtx();
        const result = check(ctx);
        assert.equal(result.decision, 'allow');
        // No stderr about zero-file guard
        if (result.stderr) {
            assert.ok(
                !result.stderr.includes('no affected files were parsed'),
                `Unexpected zero-file warning for short content: ${result.stderr}`
            );
        }
    });

    // TC-ZFG-04: Guard does NOT fire for empty string (AC-002-03)
    it('TC-ZFG-04: no warning for empty string input', () => {
        const result = parseImpactAnalysis('');
        assert.deepStrictEqual(result, [], 'Empty string should return empty array');
        // This test verifies the parse result; the check() level guard is tested via TC-ZFG-03
    });

    // TC-ZFG-05: Guard does NOT fire when files ARE successfully parsed (AC-002-01)
    it('TC-ZFG-05: no warning when files are successfully parsed', () => {
        fs.writeFileSync(artifactPath('impact-analysis.md'), IMPACT_SINGLE_TABLE);
        const ctx = buildCtx();
        const result = check(ctx);
        // Should either block (git diff fails) or allow without zero-file warning
        if (result.stderr) {
            assert.ok(
                !result.stderr.includes('no affected files were parsed'),
                `Unexpected zero-file warning when files were parsed: ${result.stderr}`
            );
        }
    });

    // TC-ZFG-06: Guard uses 100-char threshold correctly (AC-002-03)
    it('TC-ZFG-06: boundary test - 100 chars no warning, 101 chars triggers warning', () => {
        // Content exactly 100 characters (no matching rows)
        const content100 = 'A'.repeat(100);
        fs.writeFileSync(artifactPath('impact-analysis.md'), content100);
        let ctx = buildCtx();
        let result = check(ctx);
        assert.equal(result.decision, 'allow');
        if (result.stderr) {
            assert.ok(
                !result.stderr.includes('no affected files were parsed'),
                'Should NOT warn at exactly 100 chars'
            );
        }

        // Content 101 characters (no matching rows)
        const content101 = 'A'.repeat(101);
        fs.writeFileSync(artifactPath('impact-analysis.md'), content101);
        ctx = buildCtx();
        result = check(ctx);
        assert.equal(result.decision, 'allow');
        assert.ok(result.stderr, 'Expected stderr warning at 101 chars');
        assert.ok(
            result.stderr.includes('no affected files were parsed') ||
            result.stderr.includes('content but no affected files'),
            `Expected zero-file warning at 101 chars, got: ${result.stderr}`
        );
    });
});

// ===========================================================================
// 16. BUG-0055: Integration Tests with 4-Column Fixtures (FR-001, FR-002)
// Traces to: FR-001, FR-002
// ===========================================================================

describe('BUG-0055: check() with 4-column fixtures and temp git repo', () => {
    let testDir;

    beforeEach(() => {
        testDir = setupTestEnv(featureWorkflowState());
        const artifactDir = path.join(testDir, 'docs', 'requirements', 'REQ-0010-blast-radius-coverage');
        fs.mkdirSync(artifactDir, { recursive: true });
    });

    afterEach(() => {
        cleanupTestEnv();
    });

    function artifactPath(filename) {
        return path.join(testDir, 'docs', 'requirements', 'REQ-0010-blast-radius-coverage', filename);
    }

    function initGitRepo(filesToModify = []) {
        const { execSync } = require('child_process');
        const opts = { cwd: testDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] };
        execSync('git init', opts);
        execSync('git config user.email "test@test.com"', opts);
        execSync('git config user.name "Test"', opts);
        fs.writeFileSync(path.join(testDir, 'README.md'), '# Test');
        execSync('git add -A', opts);
        execSync('git commit -m "initial"', opts);
        try { execSync('git branch -M main', opts); } catch (e) {}
        execSync('git checkout -b feature/test', opts);
        for (const filePath of filesToModify) {
            const fullPath = path.join(testDir, filePath);
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, `// Modified: ${filePath}\n`);
        }
        if (filesToModify.length > 0) {
            execSync('git add -A', opts);
            execSync('git commit -m "feature changes"', opts);
        }
    }

    // TC-INT-11: Allow when all 4-column affected files in git diff (AC-001-02)
    it('TC-INT-11: allows when all 4-column affected files are in git diff', () => {
        fs.writeFileSync(artifactPath('impact-analysis.md'), IMPACT_4COL_ROUNDTABLE);
        initGitRepo(['lib/memory-search.js', 'lib/memory-embedder.js', 'src/claude/commands/isdlc.md']);
        const ctx = buildCtx();
        const result = check(ctx);
        assert.equal(result.decision, 'allow', `Expected allow but got ${result.decision}: ${result.stopReason || ''}`);
    });

    // TC-INT-12: Block when 4-column affected files NOT in git diff (AC-001-02)
    it('TC-INT-12: blocks when 4-column affected files are NOT all in git diff', () => {
        fs.writeFileSync(artifactPath('impact-analysis.md'), IMPACT_4COL_ROUNDTABLE);
        // Only modify 1 of 3 files
        initGitRepo(['lib/memory-search.js']);
        const ctx = buildCtx();
        const result = check(ctx);
        assert.equal(result.decision, 'block', 'Should block when 4-column files are unaddressed');
        assert.ok(result.stopReason, 'Expected block message');
        assert.ok(result.stopReason.includes('lib/memory-embedder.js'), 'Missing lib/memory-embedder.js in block message');
        assert.ok(result.stopReason.includes('src/claude/commands/isdlc.md'), 'Missing isdlc.md in block message');
    });

    // TC-INT-13: Allow with 4-column format plus deferred files (AC-001-02, AC-001-03)
    it('TC-INT-13: allows with 4-column format plus deferred files', () => {
        fs.writeFileSync(artifactPath('impact-analysis.md'), IMPACT_4COL_ROUNDTABLE);
        // Modify 2 of 3 files
        initGitRepo(['lib/memory-search.js', 'lib/memory-embedder.js']);
        // Defer the 3rd
        const coverageContent = `## Coverage\n\n| File Path | Expected Change | Coverage Status | Notes |\n|---|---|---|---|\n| \`src/claude/commands/isdlc.md\` | MODIFY | deferred | Deferred to next sprint |\n`;
        fs.writeFileSync(artifactPath('blast-radius-coverage.md'), coverageContent);
        const ctx = buildCtx();
        const result = check(ctx);
        assert.equal(result.decision, 'allow', `Expected allow but got ${result.decision}: ${result.stopReason || ''}`);
    });

    // TC-INT-14: Mixed-case change types work in full flow (AC-001-04)
    it('TC-INT-14: mixed-case change types work in full flow', () => {
        fs.writeFileSync(artifactPath('impact-analysis.md'), IMPACT_3COL_MIXEDCASE);
        initGitRepo(['lib/memory.js', 'src/claude/agents/roundtable-analyst.md', 'bin/isdlc.js']);
        const ctx = buildCtx();
        const result = check(ctx);
        assert.equal(result.decision, 'allow', `Expected allow but got ${result.decision}: ${result.stopReason || ''}`);
    });

    // TC-INT-15: Zero-file guard in full flow with substantial content (AC-002-01)
    it('TC-INT-15: zero-file guard warns in full flow with substantial unrecognized content', () => {
        fs.writeFileSync(artifactPath('impact-analysis.md'), IMPACT_SUBSTANTIAL_NO_MATCH);
        initGitRepo([]);
        const ctx = buildCtx();
        const result = check(ctx);
        assert.equal(result.decision, 'allow', 'Should allow (fail-open)');
        assert.ok(result.stderr, 'Expected stderr warning');
        assert.ok(
            result.stderr.includes('no affected files were parsed') ||
            result.stderr.includes('content but no affected files'),
            `Expected zero-file warning, got: ${result.stderr}`
        );
    });

    // TC-INT-16: Mixed sections parsed correctly in full flow (AC-001-03)
    it('TC-INT-16: mixed sections parsed correctly in full flow', () => {
        fs.writeFileSync(artifactPath('impact-analysis.md'), IMPACT_MIXED_SECTIONS);
        initGitRepo(['src/hooks/validator.cjs', 'src/hooks/common.cjs']);
        const ctx = buildCtx();
        const result = check(ctx);
        assert.equal(result.decision, 'allow', `Expected allow but got ${result.decision}: ${result.stopReason || ''}`);
    });
});

// ===========================================================================
// 17. BUG-0055: Agent Prompt Verification (FR-004, FR-005)
// Traces to: FR-004, FR-005
// ===========================================================================

describe('BUG-0055: Agent prompt blast radius cross-checks', () => {
    // TC-AGT-01: QA engineer prompt contains blast radius cross-check (AC-004-01)
    it('TC-AGT-01: qa-engineer prompt contains blast radius cross-check', () => {
        const agentPath = path.resolve(__dirname, '..', '..', 'agents', '07-qa-engineer.md');
        const content = fs.readFileSync(agentPath, 'utf8');
        assert.ok(
            content.includes('impact-analysis') || content.includes('impact analysis'),
            'QA engineer prompt must mention impact-analysis'
        );
        assert.ok(
            content.includes('blast radius') || content.includes('Blast Radius') || content.includes('Tier 1'),
            'QA engineer prompt must mention blast radius or Tier 1'
        );
        assert.ok(
            content.includes('git diff') || content.includes('git-diff'),
            'QA engineer prompt must mention git diff'
        );
    });

    // TC-AGT-02: QA engineer prompt specifies blocking finding (AC-004-02)
    it('TC-AGT-02: qa-engineer prompt specifies blocking finding for unaddressed files', () => {
        const agentPath = path.resolve(__dirname, '..', '..', 'agents', '07-qa-engineer.md');
        const content = fs.readFileSync(agentPath, 'utf8').toLowerCase();
        assert.ok(
            content.includes('block') || content.includes('critical') || content.includes('fail'),
            'QA engineer prompt must specify blocking/critical finding for blast radius gaps'
        );
    });

    // TC-AGT-03: Quality loop prompt contains blast radius check (AC-005-01)
    it('TC-AGT-03: quality-loop prompt contains blast radius coverage check', () => {
        const agentPath = path.resolve(__dirname, '..', '..', 'agents', '16-quality-loop-engineer.md');
        const content = fs.readFileSync(agentPath, 'utf8');
        assert.ok(
            content.includes('impact-analysis') || content.includes('impact analysis'),
            'Quality loop prompt must mention impact-analysis'
        );
        assert.ok(
            content.includes('blast radius') || content.includes('Blast Radius') || content.includes('Tier 1'),
            'Quality loop prompt must mention blast radius or Tier 1'
        );
    });

    // TC-AGT-04: Quality loop prompt specifies failing check (AC-005-02)
    it('TC-AGT-04: quality-loop prompt specifies failing check for unaddressed files', () => {
        const agentPath = path.resolve(__dirname, '..', '..', 'agents', '16-quality-loop-engineer.md');
        const content = fs.readFileSync(agentPath, 'utf8').toLowerCase();
        assert.ok(
            content.includes('fail') || content.includes('block') || content.includes('flag'),
            'Quality loop prompt must specify failing check for blast radius gaps'
        );
    });
});

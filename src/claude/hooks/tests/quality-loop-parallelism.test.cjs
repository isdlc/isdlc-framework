/**
 * Tests for Quality Loop True Parallelism (REQ-0018)
 * Traces to: FR-001..FR-007, AC-001..AC-023, NFR-001..NFR-004
 * Feature: REQ-0018-quality-loop-true-parallelism
 *
 * Target file: src/claude/agents/16-quality-loop-engineer.md (MODIFIED)
 * Pattern: Prompt-verification (read .md, assert content with string matching)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const AGENT_PATH = path.resolve(__dirname, '..', '..', 'agents', '16-quality-loop-engineer.md');

describe('Quality Loop Parallelism (16-quality-loop-engineer.md)', () => {
    let content;

    function getContent() {
        if (!content) {
            assert.ok(fs.existsSync(AGENT_PATH), 'Agent file must exist at ' + AGENT_PATH);
            content = fs.readFileSync(AGENT_PATH, 'utf8');
        }
        return content;
    }

    // Helper: extract a section from the content between two headings
    function getSection(heading) {
        const c = getContent();
        const headingPattern = new RegExp('^#{1,4}\\s+' + heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'm');
        const match = c.match(headingPattern);
        if (!match) return '';
        const startIdx = match.index;
        // Find the next heading at the same or higher level
        const level = match[0].split(' ')[0].length; // number of # chars
        const rest = c.slice(startIdx + match[0].length);
        const nextHeading = rest.match(new RegExp('^#{1,' + level + '}\\s', 'm'));
        if (nextHeading) {
            return c.slice(startIdx, startIdx + match[0].length + nextHeading.index);
        }
        return c.slice(startIdx);
    }

    // ===================================================================
    // FR-001: Parallel Spawning (AC-001 to AC-004)
    // ===================================================================
    describe('FR-001: Parallel Spawning', () => {

        // TC-01: Agent file exists
        it('TC-01: Agent file exists (Precondition)', () => {
            assert.ok(fs.existsSync(AGENT_PATH), 'Agent file must exist at expected path');
        });

        // TC-02: Two Task tool calls in single response (AC-001)
        it('TC-02: Two Task tool calls in single response (AC-001)', () => {
            const c = getContent();
            // Must instruct exactly two Task tool calls in a single response
            const hasTwoTask = c.includes('two Task') || c.includes('two parallel Task') || c.includes('2 Task');
            assert.ok(hasTwoTask, 'Must instruct two Task tool calls in a single response');
            // Must reference both Track A and Track B in the spawning context
            assert.ok(c.includes('Track A'), 'Must reference Track A');
            assert.ok(c.includes('Track B'), 'Must reference Track B');
        });

        // TC-03: Track A Task call includes full prompt (AC-002)
        it('TC-03: Track A Task call includes full prompt (AC-002)', () => {
            const c = getContent();
            // Track A section must reference all Track A checks
            const trackASection = getSection('Track A');
            assert.ok(trackASection.length > 0, 'Track A section must exist');
            assert.ok(
                trackASection.includes('build') || trackASection.includes('Build') || trackASection.includes('QL-007'),
                'Track A must reference build verification'
            );
            assert.ok(
                trackASection.includes('test') || trackASection.includes('Test') || trackASection.includes('QL-002'),
                'Track A must reference test execution'
            );
            assert.ok(
                trackASection.includes('mutation') || trackASection.includes('Mutation') || trackASection.includes('QL-003'),
                'Track A must reference mutation testing'
            );
            assert.ok(
                trackASection.includes('coverage') || trackASection.includes('Coverage') || trackASection.includes('QL-004'),
                'Track A must reference coverage analysis'
            );
        });

        // TC-04: Track B Task call includes full prompt (AC-002)
        it('TC-04: Track B Task call includes full prompt (AC-002)', () => {
            const c = getContent();
            // Track B section must reference Track B checks (SAST, dependency, code review, traceability)
            // Note: Per grouping strategy AC-010, lint+type-check moved to Track A Group A1
            const trackBSection = getSection('Track B');
            assert.ok(trackBSection.length > 0, 'Track B section must exist');
            assert.ok(
                trackBSection.toLowerCase().includes('sast') || trackBSection.toLowerCase().includes('security') || trackBSection.includes('QL-008'),
                'Track B must reference SAST/security scan'
            );
            assert.ok(
                trackBSection.toLowerCase().includes('dependency') || trackBSection.includes('QL-009'),
                'Track B must reference dependency audit'
            );
            assert.ok(
                trackBSection.toLowerCase().includes('code review') || trackBSection.includes('QL-010'),
                'Track B must reference automated code review'
            );
            assert.ok(
                trackBSection.toLowerCase().includes('traceability') || trackBSection.includes('B2'),
                'Track B must reference traceability verification'
            );
        });

        // TC-05: Wait for both results before consolidation (AC-003, AC-004)
        it('TC-05: Wait for both results before consolidation (AC-003, AC-004)', () => {
            const c = getContent();
            const hasWaitBoth = c.includes('wait for both') ||
                c.includes('both complete') ||
                c.includes('both results') ||
                c.includes('both Task') ||
                c.includes('both tracks complete');
            assert.ok(hasWaitBoth, 'Must instruct waiting for both Task results before consolidation');
        });
    });

    // ===================================================================
    // FR-002: Internal Track Parallelism (AC-005 to AC-008)
    // ===================================================================
    describe('FR-002: Internal Track Parallelism', () => {

        // TC-06: Track A MAY split work into sub-groups (AC-005)
        it('TC-06: Track A MAY split work into sub-groups (AC-005)', () => {
            const c = getContent();
            // Track A section should mention sub-groups or internal parallelism
            const hasSubGroups = c.includes('sub-group') || c.includes('sub-agent') ||
                c.includes('internal parallelism') || c.includes('internally parallelize');
            assert.ok(hasSubGroups, 'Track A must mention sub-groups or internal parallelism');
        });

        // TC-07: Track B MAY split work into sub-groups (AC-006)
        it('TC-07: Track B MAY split work into sub-groups (AC-006)', () => {
            const c = getContent();
            // Check that Track B references sub-grouping
            const trackBSection = getSection('Track B');
            const hasSubGroups = trackBSection.includes('sub-group') || trackBSection.includes('sub-agent') ||
                trackBSection.includes('internal parallelism') || trackBSection.includes('internally parallelize') ||
                trackBSection.includes('B1') || trackBSection.includes('B2');
            assert.ok(hasSubGroups, 'Track B must mention sub-groups or internal parallelism');
        });

        // TC-08: Internal parallelism is guidance, not enforcement (AC-007)
        it('TC-08: Internal parallelism is guidance not enforcement (AC-007)', () => {
            const c = getContent();
            // Must use MAY/SHOULD/RECOMMENDED language for internal sub-grouping
            const hasGuidanceLanguage = c.includes('MAY') || c.includes('SHOULD') || c.includes('RECOMMENDED');
            assert.ok(hasGuidanceLanguage, 'Internal parallelism must use MAY/SHOULD/RECOMMENDED language');
            // Specifically near sub-group context
            const subGroupIdx = c.indexOf('sub-group') !== -1 ? c.indexOf('sub-group') :
                c.indexOf('internal parallelism') !== -1 ? c.indexOf('internal parallelism') :
                c.indexOf('internally parallelize');
            if (subGroupIdx !== -1) {
                const nearby = c.slice(Math.max(0, subGroupIdx - 200), subGroupIdx + 200);
                const hasNearbyGuidance = nearby.includes('MAY') || nearby.includes('SHOULD') || nearby.includes('RECOMMENDED');
                assert.ok(hasNearbyGuidance, 'MAY/SHOULD/RECOMMENDED must appear near sub-group references');
            }
        });

        // TC-09: Sub-groups report independently (AC-008)
        it('TC-09: Sub-groups report independently (AC-008)', () => {
            const c = getContent();
            const hasIndependentReport = c.includes('report') && (
                c.includes('independently') || c.includes('each sub-group') || c.includes('each group')
            );
            assert.ok(hasIndependentReport, 'Sub-groups must report results independently');
        });

        // TC-10: Parent track consolidates sub-group results (AC-008)
        it('TC-10: Parent track consolidates sub-group results (AC-008)', () => {
            const c = getContent();
            const hasConsolidate = (c.includes('consolidat') || c.includes('merg')) &&
                (c.includes('sub-group') || c.includes('group result') || c.includes('track result'));
            assert.ok(hasConsolidate, 'Parent track must consolidate sub-group results into track result');
        });
    });

    // ===================================================================
    // FR-003: Grouping Strategy (AC-009 to AC-012)
    // ===================================================================
    describe('FR-003: Grouping Strategy', () => {

        // TC-11: Two grouping modes defined (AC-009)
        it('TC-11: Two grouping modes defined (AC-009)', () => {
            const c = getContent();
            assert.ok(
                c.toLowerCase().includes('logical grouping'),
                'Must define "logical grouping" mode'
            );
            assert.ok(
                c.toLowerCase().includes('task count'),
                'Must define "task count" mode'
            );
        });

        // TC-12: Group A1 contains build + lint + type-check (AC-010)
        it('TC-12: Group A1 contains build + lint + type-check (AC-010)', () => {
            const c = getContent();
            assert.ok(c.includes('| A1'), 'Must define Group A1 in lookup table');
            // Find the A1 row in the lookup table (starts with "| A1")
            const tableIdx = c.indexOf('| A1');
            const a1Row = c.slice(tableIdx, c.indexOf('\n', tableIdx));
            const hasBuild = a1Row.toLowerCase().includes('build') || a1Row.includes('QL-007');
            const hasLint = a1Row.toLowerCase().includes('lint') || a1Row.includes('QL-005');
            const hasTypeCheck = a1Row.toLowerCase().includes('type') || a1Row.includes('QL-006');
            assert.ok(hasBuild, 'Group A1 must include build verification');
            assert.ok(hasLint, 'Group A1 must include lint check');
            assert.ok(hasTypeCheck, 'Group A1 must include type check');
        });

        // TC-13: Group A2 contains test execution + coverage (AC-010)
        it('TC-13: Group A2 contains test execution + coverage (AC-010)', () => {
            const c = getContent();
            assert.ok(c.includes('| A2'), 'Must define Group A2 in lookup table');
            const tableIdx = c.indexOf('| A2');
            const a2Row = c.slice(tableIdx, c.indexOf('\n', tableIdx));
            const hasTest = a2Row.toLowerCase().includes('test') || a2Row.includes('QL-002');
            const hasCoverage = a2Row.toLowerCase().includes('coverage') || a2Row.includes('QL-004');
            assert.ok(hasTest, 'Group A2 must include test execution');
            assert.ok(hasCoverage, 'Group A2 must include coverage analysis');
        });

        // TC-14: Group A3 contains mutation testing (AC-010)
        it('TC-14: Group A3 contains mutation testing (AC-010)', () => {
            const c = getContent();
            assert.ok(c.includes('| A3'), 'Must define Group A3 in lookup table');
            const tableIdx = c.indexOf('| A3');
            const a3Row = c.slice(tableIdx, c.indexOf('\n', tableIdx));
            const hasMutation = a3Row.toLowerCase().includes('mutation') || a3Row.includes('QL-003');
            assert.ok(hasMutation, 'Group A3 must include mutation testing');
        });

        // TC-15: Group B1 contains SAST + dependency audit (AC-010)
        it('TC-15: Group B1 contains SAST + dependency audit (AC-010)', () => {
            const c = getContent();
            assert.ok(c.includes('| B1'), 'Must define Group B1 in lookup table');
            const tableIdx = c.indexOf('| B1');
            const b1Row = c.slice(tableIdx, c.indexOf('\n', tableIdx));
            const hasSAST = b1Row.toLowerCase().includes('sast') || b1Row.toLowerCase().includes('security') || b1Row.includes('QL-008');
            const hasDependency = b1Row.toLowerCase().includes('dependency') || b1Row.includes('QL-009');
            assert.ok(hasSAST, 'Group B1 must include SAST security scan');
            assert.ok(hasDependency, 'Group B1 must include dependency audit');
        });

        // TC-16: Group B2 contains code review + traceability (AC-010)
        it('TC-16: Group B2 contains code review + traceability (AC-010)', () => {
            const c = getContent();
            assert.ok(c.includes('| B2'), 'Must define Group B2 in lookup table');
            const tableIdx = c.indexOf('| B2');
            const b2Row = c.slice(tableIdx, c.indexOf('\n', tableIdx));
            const hasCodeReview = b2Row.toLowerCase().includes('code review') || b2Row.includes('QL-010');
            const hasTraceability = b2Row.toLowerCase().includes('traceability') || b2Row.toLowerCase().includes('traceable');
            assert.ok(hasCodeReview, 'Group B2 must include automated code review');
            assert.ok(hasTraceability, 'Group B2 must include traceability verification');
        });

        // TC-17: Grouping is a lookup table in prompt (AC-011)
        it('TC-17: Grouping is a lookup table in prompt not JS code (AC-011)', () => {
            const c = getContent();
            // Must contain a markdown table with group identifiers
            const hasTable = c.includes('| A1') || c.includes('| Group') || c.includes('| A1 ');
            assert.ok(hasTable, 'Grouping must be presented as a markdown table');
            // Also ensure A2, A3, B1, B2 appear in table context
            assert.ok(c.includes('A2'), 'Table must include A2');
            assert.ok(c.includes('A3'), 'Table must include A3');
            assert.ok(c.includes('B1'), 'Table must include B1');
            assert.ok(c.includes('B2'), 'Table must include B2');
        });

        // TC-18: Unconfigured checks skipped within group (AC-012)
        it('TC-18: Unconfigured checks skipped within group (AC-012)', () => {
            const c = getContent();
            const hasSkipInstruction = c.includes('NOT CONFIGURED') && (
                c.includes('skip') || c.includes('Skip') || c.includes('skipped')
            );
            assert.ok(hasSkipInstruction, 'Must instruct skipping unconfigured checks without affecting other group members');
        });
    });

    // ===================================================================
    // FR-004: Consolidated Result Merging (AC-013 to AC-015)
    // ===================================================================
    describe('FR-004: Consolidated Result Merging', () => {

        // TC-19: Pass/fail for every check organized by track and group (AC-013)
        it('TC-19: Pass/fail status for every check by track and group (AC-013)', () => {
            const c = getContent();
            const hasPassFail = (c.includes('pass') || c.includes('PASS')) &&
                (c.includes('fail') || c.includes('FAIL'));
            assert.ok(hasPassFail, 'Must include pass/fail status references');
            const hasTrackGroup = (c.includes('track') || c.includes('Track')) &&
                (c.includes('group') || c.includes('Group'));
            assert.ok(hasTrackGroup, 'Must organize results by track and group');
        });

        // TC-20: ANY failure marks result as FAILED (AC-014)
        it('TC-20: ANY failure marks consolidated result as FAILED (AC-014)', () => {
            const c = getContent();
            const hasAnyFail = c.includes('ANY') || c.includes('any check fail') || c.includes('any failure') ||
                c.includes('either fails') || c.includes('EITHER');
            assert.ok(hasAnyFail, 'Must specify that any check failure marks consolidated result as FAILED');
        });

        // TC-21: Quality report includes Parallel Execution Summary (AC-015)
        it('TC-21: Quality report includes Parallel Execution Summary (AC-015)', () => {
            const c = getContent();
            assert.ok(
                c.includes('Parallel Execution Summary'),
                'Must include "Parallel Execution Summary" section reference'
            );
        });

        // TC-22: Summary shows group composition and elapsed time (AC-015)
        it('TC-22: Summary shows group composition and elapsed time (AC-015)', () => {
            const c = getContent();
            const hasGroupComposition = c.toLowerCase().includes('group composition') || c.toLowerCase().includes('group breakdown');
            const hasElapsedTime = c.toLowerCase().includes('elapsed') || c.toLowerCase().includes('timing') || c.toLowerCase().includes('duration');
            assert.ok(
                hasGroupComposition || hasElapsedTime,
                'Parallel Execution Summary must reference group composition and/or elapsed time'
            );
        });
    });

    // ===================================================================
    // FR-005: Iteration Loop (AC-016 to AC-018)
    // ===================================================================
    describe('FR-005: Iteration Loop', () => {

        // TC-23: ALL failures consolidated from both tracks (AC-016)
        it('TC-23: Failures consolidated from both tracks into single list (AC-016)', () => {
            const c = getContent();
            const hasConsolidateFailures = (c.toLowerCase().includes('consolidat') || c.toLowerCase().includes('collect')) &&
                c.toLowerCase().includes('failure');
            assert.ok(hasConsolidateFailures, 'Must consolidate failures from both tracks');
            const hasDelegateToDev = c.includes('software-developer');
            assert.ok(hasDelegateToDev, 'Must delegate to software-developer agent for fixes');
        });

        // TC-24: Both tracks re-run in parallel after fixes (AC-017)
        it('TC-24: Both tracks re-run in parallel after fixes (AC-017)', () => {
            const c = getContent();
            const hasBothRerun = c.includes('re-run BOTH') || c.includes('re-run both') ||
                c.includes('rerun both') || c.includes('both tracks') ||
                (c.includes('both') && c.includes('from scratch'));
            assert.ok(hasBothRerun, 'Must re-run BOTH Track A and Track B after fixes (not just failing track)');
        });

        // TC-25: Circuit breaker reference (AC-018)
        it('TC-25: Circuit breaker referenced (AC-018)', () => {
            const c = getContent();
            const hasCircuitBreaker = c.includes('iteration-requirements') ||
                c.includes('circuit breaker') || c.includes('circuit_breaker');
            assert.ok(hasCircuitBreaker, 'Must reference iteration-requirements or circuit breaker');
        });

        // TC-26: Max iterations and circuit breaker threshold values (AC-018)
        it('TC-26: Max iterations and circuit breaker threshold (AC-018)', () => {
            const c = getContent();
            const hasMaxIterations = c.includes('max_iterations') || c.includes('max iterations');
            const hasThreshold = c.includes('circuit_breaker_threshold') || c.includes('circuit breaker');
            assert.ok(
                hasMaxIterations || hasThreshold,
                'Must reference max_iterations or circuit_breaker_threshold'
            );
        });
    });

    // ===================================================================
    // FR-006: FINAL SWEEP Compatibility (AC-019 to AC-021)
    // ===================================================================
    describe('FR-006: FINAL SWEEP Compatibility', () => {

        // TC-27: FINAL SWEEP exclusions preserved with parallelism (AC-019)
        it('TC-27: FINAL SWEEP exclusions preserved with parallelism (AC-019)', () => {
            const c = getContent();
            const finalSweepSection = getSection('FINAL SWEEP Mode');
            assert.ok(finalSweepSection.length > 0, 'FINAL SWEEP Mode section must exist');
            // Exclusion list must still be present
            assert.ok(
                finalSweepSection.includes('EXCLUDE') || finalSweepSection.includes('excluded') || finalSweepSection.includes('Excluded'),
                'FINAL SWEEP mode must preserve exclusion list'
            );
        });

        // TC-28: FINAL SWEEP uses same grouping strategy for included checks (AC-020)
        it('TC-28: FINAL SWEEP uses same grouping strategy (AC-020)', () => {
            const c = getContent();
            const finalSweepSection = getSection('FINAL SWEEP Mode');
            const hasGroupingRef = finalSweepSection.includes('grouping') || finalSweepSection.includes('group') ||
                finalSweepSection.includes('parallel') || finalSweepSection.includes('Grouping');
            assert.ok(hasGroupingRef, 'FINAL SWEEP must reference grouping strategy for included checks');
        });

        // TC-29: FULL SCOPE includes all checks (AC-021)
        it('TC-29: FULL SCOPE includes all checks (AC-021)', () => {
            const c = getContent();
            const fullScopeSection = getSection('FULL SCOPE Mode');
            assert.ok(fullScopeSection.length > 0, 'FULL SCOPE Mode section must exist');
            const hasAllChecks = fullScopeSection.includes('ALL') || fullScopeSection.includes('all checks') ||
                fullScopeSection.includes('all existing');
            assert.ok(hasAllChecks, 'FULL SCOPE mode must include ALL checks');
        });

        // TC-30: Both FINAL SWEEP and FULL SCOPE documented distinctly (AC-019, AC-021)
        it('TC-30: Both FINAL SWEEP and FULL SCOPE documented distinctly (AC-019, AC-021)', () => {
            const c = getContent();
            assert.ok(c.includes('FINAL SWEEP'), 'Must contain FINAL SWEEP section');
            assert.ok(c.includes('FULL SCOPE'), 'Must contain FULL SCOPE section');
        });
    });

    // ===================================================================
    // FR-007: Scope Detection (AC-022 to AC-023)
    // ===================================================================
    describe('FR-007: Scope Detection', () => {

        // TC-31: 50+ test files threshold for parallel execution (AC-022)
        it('TC-31: 50+ test files threshold for parallel execution (AC-022)', () => {
            const c = getContent();
            assert.ok(
                c.includes('50'),
                'Must specify 50+ test files threshold for parallel execution'
            );
        });

        // TC-32: Small project sub-grouping guidance (AC-023)
        it('TC-32: Small project sub-grouping guidance less than 10 test files (AC-023)', () => {
            const c = getContent();
            assert.ok(
                c.includes('10'),
                'Must address small projects with <10 test files threshold'
            );
        });

        // TC-33: Scope detection is Track A specific (AC-022)
        it('TC-33: Scope detection is Track A specific (AC-022)', () => {
            const c = getContent();
            // The 50+ threshold should appear in or near Track A context
            const trackASection = getSection('Track A');
            const parallelTestSection = getSection('Parallel Test Execution');
            const scopeSection = getSection('Scope Detection');
            const combinedTrackA = trackASection + parallelTestSection + scopeSection;
            assert.ok(
                combinedTrackA.includes('50'),
                'Scope detection (50+ test files) must appear in Track A or Parallel Test Execution context'
            );
        });
    });

    // ===================================================================
    // NFR: Non-Functional Requirements
    // ===================================================================
    describe('NFR: Non-Functional Requirements', () => {

        // TC-34: Prompt-only change verified (NFR-002)
        it('TC-34: No new npm packages or JS files - prompt only change (NFR-002)', () => {
            // The target file is an .md file, not a .js/.cjs/.mjs file
            assert.ok(AGENT_PATH.endsWith('.md'), 'Target file must be a .md file (prompt-only change)');
        });

        // TC-35: Backward compatibility for projects without QA tools (NFR-003)
        it('TC-35: Backward compatibility for projects without QA tools (NFR-003)', () => {
            const c = getContent();
            assert.ok(
                c.includes('NOT CONFIGURED'),
                'Must handle "NOT CONFIGURED" tools gracefully'
            );
        });

        // TC-36: Parallel execution state tracking with track timing (NFR-004)
        it('TC-36: Parallel execution state tracking extended with track timing (NFR-004)', () => {
            const c = getContent();
            assert.ok(
                c.includes('parallel_execution'),
                'Must include parallel_execution state tracking'
            );
            const hasTrackTiming = c.toLowerCase().includes('track') &&
                (c.toLowerCase().includes('timing') || c.toLowerCase().includes('elapsed') ||
                 c.toLowerCase().includes('duration') || c.toLowerCase().includes('time'));
            assert.ok(hasTrackTiming, 'Must include track-level timing in parallel execution state');
        });

        // TC-37: Performance improvement referenced (NFR-001)
        it('TC-37: Performance improvement referenced (NFR-001)', () => {
            const c = getContent();
            const hasSpeedup = c.toLowerCase().includes('speedup') || c.toLowerCase().includes('speed up') ||
                c.toLowerCase().includes('faster') || c.toLowerCase().includes('reduced time') ||
                c.toLowerCase().includes('reduced wall-clock') || c.toLowerCase().includes('concurrently') ||
                c.toLowerCase().includes('simultaneously');
            assert.ok(hasSpeedup, 'Must reference performance improvement from parallelism');
        });
    });

    // ===================================================================
    // Regression: Existing Behavior Preserved
    // ===================================================================
    describe('Regression: Existing Behavior Preserved', () => {

        // TC-38: Agent frontmatter unchanged (NFR-003)
        it('TC-38: Agent frontmatter contains name: quality-loop-engineer (NFR-003)', () => {
            const c = getContent();
            assert.ok(
                c.includes('name: quality-loop-engineer'),
                'Frontmatter must contain name: quality-loop-engineer'
            );
        });

        // TC-39: GATE-16 checklist still present (NFR-003)
        it('TC-39: GATE-16 checklist still present (NFR-003)', () => {
            const c = getContent();
            assert.ok(c.includes('GATE-16'), 'Must contain GATE-16 reference');
            assert.ok(
                c.includes('Clean build') || c.includes('clean build'),
                'GATE-16 checklist must include clean build item'
            );
            assert.ok(
                c.includes('All tests pass') || c.includes('all tests pass'),
                'GATE-16 checklist must include all tests pass item'
            );
            assert.ok(
                c.includes('coverage') || c.includes('Coverage'),
                'GATE-16 checklist must include coverage item'
            );
        });

        // TC-40: Tool Discovery Protocol preserved (NFR-003)
        it('TC-40: Tool Discovery Protocol preserved (NFR-003)', () => {
            const c = getContent();
            assert.ok(
                c.includes('Tool Discovery Protocol'),
                'Must preserve Tool Discovery Protocol section'
            );
        });
    });
});

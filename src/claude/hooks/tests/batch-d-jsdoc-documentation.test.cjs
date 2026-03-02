/**
 * TDD Tests: Item 0.15 -- Document detectPhaseDelegation()
 *
 * Verifies that detectPhaseDelegation() in lib/common.cjs has comprehensive
 * JSDoc documentation including @example, @see cross-references, @throws,
 * and edge case callouts. Documentation-only -- no code changes.
 *
 * Traces to: AC-0015-1 through AC-0015-4, NFR-1
 * File under test: src/claude/hooks/lib/common.cjs
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * Extract the JSDoc block immediately above detectPhaseDelegation function.
 * Finds the last JSDoc comment (/** ... * /) before the function declaration.
 */
function extractJSDoc() {
    const filePath = path.join(__dirname, '..', 'lib', 'common.cjs');
    const source = fs.readFileSync(filePath, 'utf8');

    // Find the function declaration
    const funcIndex = source.indexOf('function detectPhaseDelegation(');
    if (funcIndex === -1) {
        throw new Error('detectPhaseDelegation function not found in source');
    }

    // Extract the JSDoc block before the function
    // Search backward from funcIndex for the last /** ... */ block
    const beforeFunc = source.substring(0, funcIndex);
    const jsdocPattern = /\/\*\*[\s\S]*?\*\//g;
    const matches = [...beforeFunc.matchAll(jsdocPattern)];

    if (matches.length === 0) {
        throw new Error('No JSDoc found before detectPhaseDelegation');
    }

    // Return the last JSDoc block (closest to the function)
    return matches[matches.length - 1][0];
}

describe('Item 0.15: detectPhaseDelegation() JSDoc documentation', () => {

    // TC-15.01: JSDoc contains @example block (AC-0015-1)
    it('TC-15.01: JSDoc contains @example with usage example', () => {
        const jsdoc = extractJSDoc();
        assert.ok(
            jsdoc.includes('@example'),
            'JSDoc should contain @example tag'
        );
    });

    // TC-15.02: JSDoc documents return shape with all fields (AC-0015-2)
    it('TC-15.02: JSDoc documents return shape with isDelegation, targetPhase, agentName', () => {
        const jsdoc = extractJSDoc();
        assert.ok(jsdoc.includes('isDelegation'), 'JSDoc should document isDelegation field');
        assert.ok(jsdoc.includes('targetPhase'), 'JSDoc should document targetPhase field');
        assert.ok(jsdoc.includes('agentName'), 'JSDoc should document agentName field');
    });

    // TC-15.03: JSDoc contains @see references to 6 callers (AC-0015-1)
    it('TC-15.03: JSDoc contains @see references to caller hooks', () => {
        const jsdoc = extractJSDoc();

        // Count @see tags
        const seeMatches = jsdoc.match(/@see/g);
        assert.ok(seeMatches, 'JSDoc should contain @see tags');
        assert.ok(
            seeMatches.length >= 6,
            `JSDoc should have at least 6 @see references, found ${seeMatches.length}`
        );

        // Verify known callers are mentioned
        const callers = [
            'gate-blocker',
            'constitution-validator',
            'phase-loop-controller',
            'test-adequacy-blocker',
            'phase-sequence-guard',
            'iteration-corridor'
        ];
        for (const caller of callers) {
            assert.ok(
                jsdoc.includes(caller),
                `JSDoc should reference caller: ${caller}`
            );
        }
    });

    // TC-15.04: JSDoc documents never-throws behavior (AC-0015-3)
    it('TC-15.04: JSDoc documents that function never throws', () => {
        const jsdoc = extractJSDoc();
        // Should have @throws indicating it never throws, or note about fail-safe
        const hasThrowsDoc = jsdoc.includes('@throws') ||
                             jsdoc.includes('never throws') ||
                             jsdoc.includes('Never throws') ||
                             jsdoc.includes('NOT_DELEGATION');
        assert.ok(
            hasThrowsDoc,
            'JSDoc should document that the function never throws (fail-safe behavior)'
        );
    });

    // TC-15.05: JSDoc documents edge cases (AC-0015-3)
    it('TC-15.05: JSDoc documents at least 3 edge cases', () => {
        const jsdoc = extractJSDoc();

        // Check for edge case mentions
        const edgeCases = [
            'Non-Task',                    // Non-Task tool calls return NOT_DELEGATION
            'setup',                       // Setup commands are excluded
            'manifest',                    // Manifest-based agent scanning as fallback
            'phase pattern',               // Phase pattern regex fallback
            "'all'",                       // Agents with phase 'all' are excluded
        ];

        let found = 0;
        for (const edgeCase of edgeCases) {
            if (jsdoc.toLowerCase().includes(edgeCase.toLowerCase())) {
                found++;
            }
        }
        assert.ok(
            found >= 3,
            `JSDoc should mention at least 3 edge cases, found ${found}`
        );
    });

    // TC-15.06: No code changes -- function signature unchanged (AC-0015-4)
    it('TC-15.06: detectPhaseDelegation function exists and returns expected shape', () => {
        const common = require('../lib/common.cjs');
        assert.strictEqual(typeof common.detectPhaseDelegation, 'function');

        // Call with non-Task input -- should return NOT_DELEGATION
        const result = common.detectPhaseDelegation({
            tool_name: 'Read',
            tool_input: { file_path: '/some/file.txt' }
        });
        assert.strictEqual(result.isDelegation, false);
        assert.strictEqual(result.targetPhase, null);
        assert.strictEqual(result.agentName, null);
    });
});

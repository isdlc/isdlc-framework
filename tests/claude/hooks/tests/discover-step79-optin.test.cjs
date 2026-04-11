'use strict';

/**
 * BUG-GH-250 — discover-orchestrator Step 7.9 opt-in pre-check (agent-level)
 * ===========================================================================
 *
 * Traces: FR-006 (opt-in gate), AC-250-02 (Step 7.9 opt-in check)
 * Test gaps: TG9 (opted-out → skip block), TG10 (opted-in → run block)
 *
 * This is an AGENT-LEVEL test. The target under test is a markdown file
 * (src/claude/agents/discover-orchestrator.md), not executable code, because
 * Step 7.9 of the discover orchestrator is an instruction block that Claude
 * Code executes as a bash pre-check before running `npx isdlc-embedding
 * generate .`.
 *
 * The test reads the markdown, locates the Step 7.9 block, and asserts that
 * a JSON.parse-based pre-check against `.isdlc/config.json.embeddings` exists
 * inline in that block.
 *
 * Expected state on creation (Phase 06 T005): RED — T009 has not yet added
 * the pre-check. The test becomes GREEN once T009 modifies Step 7.9 in the
 * discover-orchestrator agent file.
 *
 * Consistency requirement: the pre-check MUST mirror the exact read pattern
 * used by `src/core/config/config-service.js :: hasUserEmbeddingsConfig`
 * (i.e., readFileSync + JSON.parse + `.embeddings` presence check) so both
 * entry points fail in the same way on malformed config and share a single
 * behavioural contract. See fix-strategy.md row 2 and risk "JSON parsing bug".
 *
 * Run: node --test tests/claude/hooks/tests/discover-step79-optin.test.cjs
 *
 * Related example (agent-level markdown validation):
 *   src/claude/hooks/tests/bug-gather-artifact-format.test.cjs
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Locate the discover-orchestrator agent file
// ---------------------------------------------------------------------------

const AGENT_FILE = path.resolve(
    __dirname,
    '..', '..', '..', '..',
    'src', 'claude', 'agents', 'discover-orchestrator.md'
);

/**
 * Extract the Step 7.9 section body from the discover-orchestrator markdown.
 *
 * The section begins at the heading `### Step 7.9: Execute EMBEDDING GENERATION`
 * and ends at the next `### ` heading (or EOF). Returns the body between
 * those delimiters (exclusive of the next heading).
 *
 * @param {string} md - Full markdown contents of discover-orchestrator.md
 * @returns {string|null} Section body, or null if the heading is not found.
 */
function extractStep79Block(md) {
    const startMarker = '### Step 7.9: Execute EMBEDDING GENERATION';
    const startIdx = md.indexOf(startMarker);
    if (startIdx < 0) return null;

    // Find the next `### ` heading after the start marker.
    const rest = md.slice(startIdx + startMarker.length);
    const nextHeadingMatch = rest.match(/\n### /);
    const endIdx = nextHeadingMatch
        ? startIdx + startMarker.length + nextHeadingMatch.index
        : md.length;

    return md.slice(startIdx, endIdx);
}

// ---------------------------------------------------------------------------
// Test Suite: Step 7.9 opt-in pre-check (FR-006, AC-250-02)
// ---------------------------------------------------------------------------

describe('BUG-GH-250 discover-orchestrator Step 7.9 — FR-006 opt-in pre-check', () => {

    it('Step 7.9 section exists in discover-orchestrator.md', () => {
        assert.ok(fs.existsSync(AGENT_FILE),
            `discover-orchestrator.md must exist at ${AGENT_FILE}`);

        const md = fs.readFileSync(AGENT_FILE, 'utf8');
        const block = extractStep79Block(md);

        assert.ok(block !== null,
            'Step 7.9 heading "### Step 7.9: Execute EMBEDDING GENERATION" must be present');
        assert.ok(block.length > 0,
            'Step 7.9 block must have a non-empty body');
    });

    it(
        '[P0] AC-250-02 TG9: Step 7.9 contains an opt-in pre-check that reads .isdlc/config.json and tests for .embeddings presence',
        () => {
            // Given: the discover-orchestrator agent file on disk
            const md = fs.readFileSync(AGENT_FILE, 'utf8');

            // When: we extract the Step 7.9 block
            const block = extractStep79Block(md);
            assert.ok(block, 'Step 7.9 block must be present');

            // Then: the block must contain an inline bash pre-check that reads
            //       .isdlc/config.json and tests for the top-level `embeddings`
            //       key. On opt-out (no `embeddings` key), the pre-check must
            //       exit non-zero so the generate block is skipped.

            // The pre-check MUST reference the config file path.
            assert.ok(
                block.includes('.isdlc/config.json'),
                'Step 7.9 block must reference .isdlc/config.json in the pre-check'
            );

            // The pre-check MUST test for the `embeddings` key specifically.
            assert.ok(
                /\.embeddings\b/.test(block),
                'Step 7.9 block must test for the `.embeddings` key (opt-in gate, AC-250-02)'
            );

            // The pre-check MUST use process.exit (or equivalent exit-code
            // branching) so Claude can branch on run-vs-skip. Without a
            // process.exit the pre-check is not a gate.
            assert.ok(
                block.includes('process.exit'),
                'Step 7.9 pre-check must use process.exit to signal run (0) vs skip (1)'
            );

            // The pre-check MUST document the opt-out skip behaviour so
            // Claude knows what to do on a non-zero exit. The fix-strategy
            // (row 2) mandates adding a banner note pointing at
            // `isdlc-embedding configure`.
            assert.ok(
                /isdlc-embedding\s+configure/.test(block),
                'Step 7.9 must document the opt-out fallback pointing at `isdlc-embedding configure`'
            );
        }
    );

    it(
        '[P1] AC-250-02 TG10: Step 7.9 pre-check mirrors the exact JSON.parse read pattern used by hasUserEmbeddingsConfig (no-regression)',
        () => {
            // Given: the discover-orchestrator agent file on disk
            const md = fs.readFileSync(AGENT_FILE, 'utf8');

            // When: we extract the Step 7.9 block
            const block = extractStep79Block(md);
            assert.ok(block, 'Step 7.9 block must be present');

            // Then: the pre-check must use the same readFileSync + JSON.parse
            //       pattern as src/core/config/config-service.js ::
            //       hasUserEmbeddingsConfig. This guarantees that the agent
            //       pre-check and the library guard agree on what counts as
            //       "opted in" -- in particular, both fail-open (exit non-zero)
            //       on malformed config, and both accept any non-null
            //       `embeddings` value.

            // readFileSync + JSON.parse on .isdlc/config.json.
            assert.ok(
                block.includes('JSON.parse'),
                'Step 7.9 pre-check must call JSON.parse (mirrors hasUserEmbeddingsConfig)'
            );
            assert.ok(
                /readFileSync\s*\(\s*["']\.isdlc\/config\.json["']/.test(block),
                'Step 7.9 pre-check must call readFileSync("\.isdlc/config.json", ...) (mirrors hasUserEmbeddingsConfig)'
            );

            // The opt-in test must read `.embeddings` on the parsed object.
            // Match the parsed-value access: `JSON.parse(...).embeddings`.
            assert.ok(
                /JSON\.parse\([^)]*\)[^;]*\.embeddings/.test(block),
                'Step 7.9 pre-check must evaluate `JSON.parse(...).embeddings` on the parsed config'
            );

            // The pre-check is invoked as a `node -e` one-liner, matching the
            // fix-strategy contract (Step 2, row 2 of fix-strategy.md).
            assert.ok(
                /node\s+-e\b/.test(block),
                'Step 7.9 pre-check must run as a `node -e` one-liner'
            );
        }
    );
});

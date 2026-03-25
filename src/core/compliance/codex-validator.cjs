'use strict';

/**
 * iSDLC Codex Output Validator
 * ==============================
 * Validates Codex assistant output against conversational rules using
 * the shared compliance engine. Called by the Codex runtime adapter
 * after process output is available.
 *
 * REQ-0140: Conversational enforcement via Stop hook
 * Covers: FR-006 (Codex Provider Integration)
 *
 * Fail-open: Any error returns a no-violation verdict with a logged warning.
 *
 * @module src/core/compliance/codex-validator
 */

const fs = require('fs');
const path = require('path');

const MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// validateCodexOutput()
// ---------------------------------------------------------------------------

/**
 * Validate Codex output against conversational rules.
 *
 * @param {string} output - Codex assistant output
 * @param {Rule[]} rules - Loaded rules
 * @param {Object} config - Verbosity config (e.g., { verbosity: 'bulleted' })
 * @param {Object|null} roundtableState - Parsed roundtable-state.json
 * @param {string} [enginePath] - Path to engine.cjs (for testing)
 * @returns {Verdict}
 */
function validateCodexOutput(output, rules, config, roundtableState, enginePath) {
    const emptyVerdict = {
        violation: false,
        rule_id: null,
        rule_name: null,
        severity: null,
        corrective_guidance: null,
        all_violations: []
    };

    try {
        if (!output || typeof output !== 'string' || output.trim().length === 0) {
            return emptyVerdict;
        }

        if (!rules || rules.length === 0) {
            return emptyVerdict;
        }

        // Load engine (fail-open if unavailable)
        let engine;
        const resolvedEnginePath = enginePath || path.join(__dirname, 'engine.cjs');
        try {
            if (fs.existsSync(resolvedEnginePath)) {
                engine = require(resolvedEnginePath);
            } else {
                return emptyVerdict; // Fail-open
            }
        } catch (e) {
            return emptyVerdict; // Fail-open
        }

        // Evaluate rules with provider = 'codex' (AC-006-01, AC-006-05)
        return engine.evaluateRules(output, rules, config, roundtableState, 'codex');
    } catch (e) {
        // Fail-open (AC-006-11)
        return emptyVerdict;
    }
}

// ---------------------------------------------------------------------------
// retryIfNeeded()
// ---------------------------------------------------------------------------

/**
 * Determine if a Codex re-invocation is needed based on the verdict.
 *
 * @param {Verdict} verdict - Result from validateCodexOutput
 * @param {number} retryCount - Current retry count
 * @returns {{ shouldRetry: boolean, corrective_guidance: string|null, warning: string|null }}
 */
function retryIfNeeded(verdict, retryCount) {
    if (!verdict || !verdict.violation) {
        return { shouldRetry: false, corrective_guidance: null, warning: null };
    }

    if (verdict.severity !== 'block') {
        // Warn severity -- allow through, no retry
        return { shouldRetry: false, corrective_guidance: null, warning: null };
    }

    if (retryCount >= MAX_RETRIES) {
        // Escalation (AC-006-03)
        return {
            shouldRetry: false,
            corrective_guidance: null,
            warning: `Conversational rule "${verdict.rule_id}" violated after ${MAX_RETRIES} retries. Output accepted with warning.`
        };
    }

    // Retry with corrective guidance (AC-006-02)
    return {
        shouldRetry: true,
        corrective_guidance: verdict.corrective_guidance,
        warning: null
    };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { validateCodexOutput, retryIfNeeded };

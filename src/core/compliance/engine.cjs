'use strict';

/**
 * iSDLC Compliance Engine
 * ========================
 * Loads conversational rules from JSON and evaluates them against response
 * content. Shared core consumed by both the Stop hook (Claude) and the
 * runtime adapter (Codex).
 *
 * REQ-0140: Conversational enforcement via Stop hook
 * Covers: FR-001 (Rule Definition Schema), FR-005 (Built-in Rules)
 *
 * @module src/core/compliance/engine
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Required fields for a valid rule definition (AC-001-04)
// ---------------------------------------------------------------------------

const REQUIRED_RULE_FIELDS = ['id', 'name', 'check', 'corrective_guidance', 'severity', 'provider_scope'];

// ---------------------------------------------------------------------------
// loadRules()
// ---------------------------------------------------------------------------

/**
 * Load rules from the conversational-rules.json config file.
 * Invalid rules are skipped with a warning (fail-open, AC-001-04).
 * Missing file returns empty array (AC-001-05).
 *
 * @param {string} [rulesPath] - Override path to rules file (for testing)
 * @returns {Rule[]} Parsed and validated rules
 */
function loadRules(rulesPath) {
    try {
        if (!rulesPath || !fs.existsSync(rulesPath)) {
            return [];
        }

        const raw = fs.readFileSync(rulesPath, 'utf8');
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (e) {
            // Malformed JSON -- fail-open
            return [];
        }

        if (!parsed || !Array.isArray(parsed.rules)) {
            return [];
        }

        const validRules = [];
        for (const rule of parsed.rules) {
            if (_isValidRule(rule)) {
                validRules.push(rule);
            }
            // Invalid rules are silently skipped (AC-001-04)
        }

        return validRules;
    } catch (e) {
        // Any unexpected error -- fail-open
        return [];
    }
}

/**
 * Validate that a rule has all required fields.
 * @param {Object} rule
 * @returns {boolean}
 */
function _isValidRule(rule) {
    if (!rule || typeof rule !== 'object') return false;
    for (const field of REQUIRED_RULE_FIELDS) {
        if (rule[field] === undefined || rule[field] === null) return false;
    }
    if (typeof rule.check !== 'object') return false;
    return true;
}

// ---------------------------------------------------------------------------
// evaluateRules()
// ---------------------------------------------------------------------------

/**
 * Evaluate all applicable rules against a response.
 *
 * @param {string} response - The assistant's response text
 * @param {Rule[]} rules - Loaded rules from loadRules()
 * @param {Object} config - Verbosity config (e.g., { verbosity: 'bulleted' })
 * @param {Object|null} roundtableState - Parsed roundtable-state.json (or null)
 * @param {string} provider - 'claude' or 'codex'
 * @returns {Verdict}
 */
function evaluateRules(response, rules, config, roundtableState, provider) {
    const emptyVerdict = {
        violation: false,
        rule_id: null,
        rule_name: null,
        severity: null,
        corrective_guidance: null,
        all_violations: []
    };

    if (!rules || rules.length === 0) {
        return emptyVerdict;
    }

    const allViolations = [];

    for (const rule of rules) {
        // Step 1: Filter by provider_scope (AC-001-03)
        if (!_matchesProvider(rule, provider)) continue;

        // Step 2: Filter by trigger_condition (AC-001-02)
        if (!_matchesTrigger(rule, config, roundtableState)) continue;

        // Step 3: Execute check
        const violated = _executeCheck(rule, response, roundtableState);

        if (violated) {
            allViolations.push({
                rule_id: rule.id,
                severity: rule.severity,
                corrective_guidance: rule.corrective_guidance
            });
        }
    }

    if (allViolations.length === 0) {
        return emptyVerdict;
    }

    // Return highest-severity violation as primary (block > warn)
    const blockViolation = allViolations.find(v => v.severity === 'block');
    const primary = blockViolation || allViolations[0];

    return {
        violation: true,
        rule_id: primary.rule_id,
        rule_name: rules.find(r => r.id === primary.rule_id)?.name || null,
        severity: primary.severity,
        corrective_guidance: primary.corrective_guidance,
        all_violations: allViolations
    };
}

// ---------------------------------------------------------------------------
// Provider scope matching
// ---------------------------------------------------------------------------

/**
 * Check if a rule applies to the given provider.
 * @param {Object} rule
 * @param {string} provider - 'claude' or 'codex'
 * @returns {boolean}
 */
function _matchesProvider(rule, provider) {
    if (rule.provider_scope === 'both') return true;
    return rule.provider_scope === provider;
}

// ---------------------------------------------------------------------------
// Trigger condition matching
// ---------------------------------------------------------------------------

/**
 * Check if a rule's trigger condition is satisfied.
 * @param {Object} rule
 * @param {Object} config
 * @param {Object|null} roundtableState
 * @returns {boolean}
 */
function _matchesTrigger(rule, config, roundtableState) {
    const trigger = rule.trigger_condition;
    if (!trigger) return true; // No condition means always applies

    // Config-based trigger (e.g., verbosity === 'bulleted')
    if (trigger.config) {
        const configValue = config ? config[trigger.config] : undefined;
        if (configValue !== trigger.value) return false;
    }

    // State-based trigger
    if (trigger.state) {
        if (trigger.state === 'confirmation_active') {
            // Need a roundtable state with a PRESENTING_* confirmation_state
            if (!roundtableState || !roundtableState.confirmation_state) return false;
            const cs = roundtableState.confirmation_state;
            if (!cs.startsWith('PRESENTING_')) return false;
        } else if (trigger.state === 'roundtable_start') {
            // Need roundtable state to be IDLE or at the start
            if (!roundtableState) return false;
            if (roundtableState.confirmation_state !== 'IDLE') return false;
        }
    }

    return true;
}

// ---------------------------------------------------------------------------
// Check execution
// ---------------------------------------------------------------------------

/**
 * Execute a rule's check against the response text.
 * @param {Object} rule
 * @param {string} response
 * @param {Object|null} roundtableState
 * @returns {boolean} true if violation detected
 */
function _executeCheck(rule, response, roundtableState) {
    const check = rule.check;
    if (!check || !check.type) return false;

    switch (check.type) {
        case 'pattern':
            return _checkPattern(check, response);
        case 'structural':
            return _checkStructural(check, response, roundtableState);
        case 'state-match':
            return _checkStateMatch(check, response);
        default:
            return false;
    }
}

// ---------------------------------------------------------------------------
// Pattern check (bulleted format)
// ---------------------------------------------------------------------------

/**
 * Pattern-based check: counts non-empty lines matching the prose pattern.
 * If the ratio exceeds the threshold, it's a violation.
 *
 * @param {Object} check - Rule check definition
 * @param {string} response - Response text
 * @returns {boolean} true if violation
 */
function _checkPattern(check, response) {
    if (!check.pattern || !check.threshold) return false;

    const lines = response.split('\n');
    const nonEmptyLines = lines.filter(line => line.trim().length > 0);

    if (nonEmptyLines.length === 0) return false;

    let proseRegex;
    try {
        proseRegex = new RegExp(check.pattern);
    } catch (e) {
        // Invalid regex -- fail-open
        return false;
    }

    // Track code block state to skip lines inside code blocks
    let inCodeBlock = false;
    let proseCount = 0;
    let checkedCount = 0;

    for (const line of nonEmptyLines) {
        const trimmed = line.trim();

        // Track code block boundaries
        if (trimmed.startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            continue; // Code block delimiter is not prose
        }

        // Skip lines inside code blocks
        if (inCodeBlock) continue;

        checkedCount++;
        if (proseRegex.test(trimmed)) {
            proseCount++;
        }
    }

    if (checkedCount === 0) return false;

    const ratio = proseCount / checkedCount;
    return ratio > check.threshold;
}

// ---------------------------------------------------------------------------
// Structural check (domain confirmation)
// ---------------------------------------------------------------------------

/**
 * Structural check: detects collapsed multi-domain confirmations.
 *
 * @param {Object} check - Rule check definition
 * @param {string} response - Response text
 * @param {Object|null} roundtableState
 * @returns {boolean} true if violation
 */
function _checkStructural(check, response, roundtableState) {
    if (check.detect !== 'collapsed_domains') return false;

    const domains = check.domains || ['Requirements', 'Architecture', 'Design'];
    const responseLower = response.toLowerCase();

    // Count how many domain names appear as bold headings or section headers
    // combined with confirmation prompts (Accept/Amend)
    let domainConfirmCount = 0;

    for (const domain of domains) {
        const domainLower = domain.toLowerCase();
        // Check for domain heading pattern followed by Accept/Amend
        const domainPattern = new RegExp(
            `\\*\\*${domain}\\*\\*[\\s\\S]*?(?:accept|amend)`,
            'i'
        );
        if (domainPattern.test(response)) {
            domainConfirmCount++;
        }
    }

    // Violation if more than one domain confirmation appears in the same message
    return domainConfirmCount > 1;
}

// ---------------------------------------------------------------------------
// State-match check (elicitation-first)
// ---------------------------------------------------------------------------

/**
 * State-match check: detects analysis completion without elicitation questions.
 *
 * @param {Object} check - Rule check definition
 * @param {string} response - Response text
 * @returns {boolean} true if violation
 */
function _checkStateMatch(check, response) {
    if (check.detect !== 'analysis_without_question') return false;

    const questionIndicators = check.question_indicators || ['?'];
    const completionIndicators = check.completion_indicators || ['analysis complete'];

    const responseLower = response.toLowerCase();

    // Check if any completion indicator is present
    const hasCompletion = completionIndicators.some(ind =>
        responseLower.includes(ind.toLowerCase())
    );

    if (!hasCompletion) {
        // No completion declaration -- not a violation
        return false;
    }

    // Check if any question indicator is present
    const hasQuestion = questionIndicators.some(ind =>
        response.includes(ind)
    );

    // Violation: has completion declaration but no question
    return !hasQuestion;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { loadRules, evaluateRules };

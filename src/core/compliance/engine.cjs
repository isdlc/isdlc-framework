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
        case 'template-section-order':
            return _checkTemplateSectionOrder(check, response, roundtableState);
        case 'schema-fields':
            return _checkSchemaFields(check, response);
        case 'accept-amend-parser':
            return _checkAcceptAmendParsing(check, response, roundtableState);
        case 'confirmation-state-tracking':
            return _checkConfirmationStateTracking(check, response, roundtableState);
        case 'confidence-indicator':
            return _checkConfidenceIndicator(check, response);
        case 'framework-internals-guard':
            return _checkFrameworkInternalsGuard(check, response);
        case 'contributing-persona-rules':
            return _checkContributingPersonaRules(check, response, roundtableState);
        case 'persona-loading-validation':
            return _checkPersonaLoadingValidation(check, response);
        case 'dispatch-payload-fields':
            return _checkDispatchPayloadFields(check, response);
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
// Template section order check (GH-234)
// ---------------------------------------------------------------------------

/**
 * Map confirmation_state to template domain.
 */
const CONFIRMATION_TO_DOMAIN = {
    'PRESENTING_REQUIREMENTS': 'requirements',
    'PRESENTING_ARCHITECTURE': 'architecture',
    'PRESENTING_DESIGN': 'design',
    'PRESENTING_TASKS': 'traceability'
};

/**
 * Map domain to human-readable section header keywords expected in markdown.
 * Keys in section_order are snake_case; H2 headings are title-case words.
 */
function sectionKeyToPatterns(key) {
    return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function normalizeSectionName(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Template section-order check: reads the template for the active domain
 * and verifies the response contains H2 sections in the expected order.
 *
 * check.templates_dir: path to templates directory (default: .isdlc/config/templates/)
 *
 * @param {Object} check - Rule check definition
 * @param {string} response - Response text
 * @param {Object|null} roundtableState
 * @returns {boolean} true if violation (sections out of order or missing)
 */
function _checkTemplateSectionOrder(check, response, roundtableState) {
    if (!roundtableState || !roundtableState.confirmation_state) return false;

    const domain = CONFIRMATION_TO_DOMAIN[roundtableState.confirmation_state];
    if (!domain) return false;

    // Load template
    const templatesDir = check.templates_dir || _resolveTemplatesDir();
    if (!templatesDir) return false;

    const templatePath = path.join(templatesDir, `${domain}.template.json`);
    let template;
    try {
        if (!fs.existsSync(templatePath)) return false;
        template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    } catch (e) {
        return false; // fail-open
    }

    // For traceability, check is different — look for the 4-column table header
    if (domain === 'traceability') {
        const columns = template.format && template.format.columns;
        if (!columns || !Array.isArray(columns)) return false;
        const headers = columns.map(c => c.header.toLowerCase());
        const responseLower = response.toLowerCase();
        const hasTable = headers.every(h => responseLower.includes(h));
        if (!hasTable) return true;

        const requiredPostTableSections = template.format && template.format.post_table_sections;
        if (!Array.isArray(requiredPostTableSections) || requiredPostTableSections.length === 0) {
            return false;
        }

        const h2Pattern = /^##\s+(?:\d+\.\s*)?(.+?)$/gm;
        const foundSections = [];
        let match;
        while ((match = h2Pattern.exec(response)) !== null) {
            foundSections.push(normalizeSectionName(match[1]));
        }

        for (const section of requiredPostTableSections) {
            if (!foundSections.includes(normalizeSectionName(section))) {
                return true;
            }
        }

        return false;
    }

    // For other domains, check section_order
    const sectionOrder = template.format && template.format.section_order;
    if (!sectionOrder || !Array.isArray(sectionOrder) || sectionOrder.length === 0) return false;

    const requiredSections = template.format.required_sections || sectionOrder;

    // Extract H2 headings from response (## heading or **HEADING**)
    const h2Pattern = /^#{1,3}\s+(?:\d+\.\s*)?(.+?)$/gm;
    const foundSections = [];
    let match;
    while ((match = h2Pattern.exec(response)) !== null) {
        foundSections.push(normalizeSectionName(match[1]));
    }

    if (foundSections.length === 0) return false; // no sections to validate

    // Check required sections present
    const missingSections = [];
    for (const required of requiredSections) {
        const pattern = normalizeSectionName(required);
        const found = foundSections.some(s => s === pattern);
        if (!found) missingSections.push(required);
    }

    if (missingSections.length > 0) return true; // violation: missing required sections

    const unexpectedSections = foundSections.filter(section =>
        !sectionOrder.some(expected => normalizeSectionName(expected) === section)
    );
    if (unexpectedSections.length > 0) return true;

    // Check order: map found sections to their template index
    const orderIndices = [];
    for (const found of foundSections) {
        for (let i = 0; i < sectionOrder.length; i++) {
            const pattern = normalizeSectionName(sectionOrder[i]);
            if (found === pattern) {
                orderIndices.push(i);
                break;
            }
        }
    }

    // Check if indices are monotonically increasing (allowing gaps for optional sections)
    for (let i = 1; i < orderIndices.length; i++) {
        if (orderIndices[i] < orderIndices[i - 1]) return true; // out of order
    }

    return false; // no violation
}

/**
 * Resolve the templates directory from project root.
 * @returns {string|null}
 */
function _resolveTemplatesDir() {
    try {
        const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
        const p = path.join(root, '.isdlc', 'config', 'templates');
        return fs.existsSync(p) ? p : null;
    } catch (e) {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Schema fields check (meta.json, inference log, coverage tracker, SESSION_RECORD, phases_completed, artifact thresholds)
// ---------------------------------------------------------------------------

/**
 * Schema-fields check: validates that a JSON block in the response contains
 * all required fields. Used for meta.json finalization, inference logs,
 * coverage trackers, SESSION_RECORD, and phases_completed population.
 *
 * check.detect: which schema to validate against
 * check.required_fields: array of field names that must appear
 * check.json_block_pattern: optional regex to locate the JSON block
 *
 * @param {Object} check - Rule check definition
 * @param {string} response - Response text
 * @returns {boolean} true if violation (missing fields)
 */
function _checkSchemaFields(check, response) {
    if (!check.detect || !check.required_fields) return false;

    const requiredFields = check.required_fields;
    if (!Array.isArray(requiredFields) || requiredFields.length === 0) return false;

    // Try to find a JSON block in the response
    const jsonBlockPattern = check.json_block_pattern
        ? new RegExp(check.json_block_pattern, 's')
        : /```(?:json)?\s*\n([\s\S]*?)```/;

    const match = jsonBlockPattern.exec(response);
    if (!match) {
        // No JSON block found — if this check requires one, it's a violation
        // But fail-open if the response doesn't contain the relevant schema at all
        // Check if the response contains any of the required fields as text keys
        const hasAnyField = requiredFields.some(f => response.includes(`"${f}"`));
        if (!hasAnyField) return false; // Not relevant to this response
        // Has some fields but not in a parseable block — still check as text
        const missingFields = requiredFields.filter(f => !response.includes(`"${f}"`));
        return missingFields.length > 0;
    }

    let parsed;
    try {
        parsed = JSON.parse(match[1] || match[0]);
    } catch (e) {
        // Can't parse JSON — check as text fallback
        const content = match[1] || match[0];
        const missingFields = requiredFields.filter(f => !content.includes(`"${f}"`));
        return missingFields.length > 0;
    }

    // Deep check: required fields must exist in the parsed object (can be nested)
    const missingFields = requiredFields.filter(f => !_hasFieldDeep(parsed, f));
    return missingFields.length > 0;
}

/**
 * Recursively check if a field name exists anywhere in an object.
 * @param {Object} obj
 * @param {string} field
 * @returns {boolean}
 */
function _hasFieldDeep(obj, field) {
    if (!obj || typeof obj !== 'object') return false;
    if (field in obj) return true;
    for (const val of Object.values(obj)) {
        if (typeof val === 'object' && val !== null && _hasFieldDeep(val, field)) return true;
    }
    return false;
}

// ---------------------------------------------------------------------------
// Accept/Amend parsing check
// ---------------------------------------------------------------------------

/**
 * Accept/Amend parser check: validates that the user response to an
 * Accept/Amend prompt is correctly classified. Detects ambiguous
 * responses that should default to Amend per core.json rules.
 *
 * This check fires during PRESENTING_* states and verifies the response
 * handling follows the accept_indicators / amend_indicators from core.json.
 *
 * check.accept_indicators: word list for accept classification
 * check.amend_indicators: word list for amend classification
 * check.ambiguous_default: default classification for ambiguous input
 *
 * @param {Object} check - Rule check definition
 * @param {string} response - Response text
 * @param {Object|null} roundtableState
 * @returns {boolean} true if violation
 */
function _checkAcceptAmendParsing(check, response, roundtableState) {
    if (!roundtableState || !roundtableState.confirmation_state) return false;
    if (!roundtableState.confirmation_state.startsWith('PRESENTING_')) return false;

    const acceptIndicators = check.accept_indicators || [];
    const amendIndicators = check.amend_indicators || [];

    // Look for the assistant responding with both accept AND amend actions in the same response
    const responseLower = response.toLowerCase();

    const hasAcceptAction = responseLower.includes('proceeding with accept') ||
        responseLower.includes('accepted, moving to') ||
        responseLower.includes('moving to presenting_');

    const hasAmendAction = responseLower.includes('entering amending state') ||
        responseLower.includes('returning to amending') ||
        responseLower.includes('re-engaging all personas');

    // Violation: response processes both accept AND amend simultaneously
    if (hasAcceptAction && hasAmendAction) return true;

    // Check that the response includes the Accept/Amend prompt when in a PRESENTING state
    const hasPrompt = responseLower.includes('accept') && responseLower.includes('amend');
    if (!hasPrompt) {
        // Presenting state without an Accept/Amend prompt is a violation
        // But only if the response is a summary/confirmation (has headings or bullets)
        const hasSummaryContent = /^#{2,3}\s+/m.test(response) || /^\s*[-*]\s+/m.test(response);
        if (hasSummaryContent && response.length > 200) return true;
    }

    return false;
}

// ---------------------------------------------------------------------------
// Confirmation state tracking check
// ---------------------------------------------------------------------------

/**
 * Confirmation state tracking check: validates that the roundtable state
 * maintains required tracking fields during the confirmation sequence.
 *
 * check.required_tracking_fields: fields that must be present
 *
 * @param {Object} check - Rule check definition
 * @param {string} response - Response text
 * @param {Object|null} roundtableState
 * @returns {boolean} true if violation
 */
function _checkConfirmationStateTracking(check, response, roundtableState) {
    if (!roundtableState) return false;

    const requiredFields = check.required_tracking_fields || [
        'confirmation_state', 'accepted_domains', 'applicable_domains',
        'summary_cache', 'amendment_cycles'
    ];

    // Only check when in an active confirmation flow
    if (!roundtableState.confirmation_state) return false;
    if (roundtableState.confirmation_state === 'IDLE' || roundtableState.confirmation_state === 'COMPLETE') return false;

    const missingFields = requiredFields.filter(f => !(f in roundtableState));
    return missingFields.length > 0;
}

// ---------------------------------------------------------------------------
// Confidence indicator check
// ---------------------------------------------------------------------------

/**
 * Confidence indicator check: validates that requirements-spec.md content
 * includes properly formatted confidence indicators (High|Medium|Low).
 *
 * check.format_pattern: regex for valid confidence format
 * check.require_in_states: states where confidence must appear
 *
 * @param {Object} check - Rule check definition
 * @param {string} response - Response text
 * @returns {boolean} true if violation
 */
function _checkConfidenceIndicator(check, response) {
    const pattern = check.format_pattern || '\\*\\*Confidence\\*\\*:\\s*(High|Medium|Low)';
    const requireInStates = check.require_in_states || ['PRESENTING_REQUIREMENTS'];

    // Only check if response appears to be a requirements confirmation
    // (contains typical section markers)
    const isRequirementsContent = /functional.?requirements/i.test(response) &&
        /assumptions.?and.?inferences/i.test(response);

    if (!isRequirementsContent) return false;

    let confidenceRegex;
    try {
        confidenceRegex = new RegExp(pattern, 'i');
    } catch (e) {
        return false; // fail-open on invalid regex
    }

    // If the response has requirement sections, check for confidence indicators
    const hasConfidence = confidenceRegex.test(response);
    if (!hasConfidence) return true; // violation: missing confidence indicator

    // Validate format: must be exactly High, Medium, or Low
    const allConfidenceMatches = response.match(new RegExp(pattern, 'gi')) || [];
    for (const match of allConfidenceMatches) {
        const level = match.replace(/.*:\s*/, '').trim();
        if (!['High', 'Medium', 'Low'].includes(level)) return true; // Invalid confidence level
    }

    return false;
}

// ---------------------------------------------------------------------------
// Framework internals guard check
// ---------------------------------------------------------------------------

/**
 * Framework internals guard: detects when the response references or reads
 * framework-internal files that should be off-limits during analysis.
 *
 * check.blocked_paths: array of path patterns that must not be referenced
 *
 * @param {Object} check - Rule check definition
 * @param {string} response - Response text
 * @returns {boolean} true if violation
 */
function _checkFrameworkInternalsGuard(check, response) {
    const blockedPaths = check.blocked_paths || [
        'state.json',
        'active_workflow',
        'hooks/',
        'workflows.json',
        'common.cjs'
    ];

    // Check if the response indicates reading/accessing blocked paths
    const readIndicators = [
        'Read tool.*' ,
        'reading.*file',
        'contents of',
        'file_path.*'
    ];

    for (const blockedPath of blockedPaths) {
        for (const indicator of readIndicators) {
            const pattern = new RegExp(`${indicator}.*${_escapeRegex(blockedPath)}`, 'i');
            if (pattern.test(response)) return true;
        }
        // Also check for direct file path references in tool calls
        const directRef = new RegExp(`"file_path"\\s*:\\s*"[^"]*${_escapeRegex(blockedPath)}"`, 'i');
        if (directRef.test(response)) return true;
    }

    return false;
}

/**
 * Escape special regex characters in a string.
 * @param {string} str
 * @returns {string}
 */
function _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Contributing persona rules check
// ---------------------------------------------------------------------------

/**
 * Contributing persona rules check: ensures that contributing personas
 * do not create new templates, own new states, or break protocol invariants.
 *
 * check.forbidden_patterns: patterns indicating rule violations
 *
 * @param {Object} check - Rule check definition
 * @param {string} response - Response text
 * @param {Object|null} roundtableState
 * @returns {boolean} true if violation
 */
function _checkContributingPersonaRules(check, response, roundtableState) {
    const forbiddenPatterns = check.forbidden_patterns || [
        'new.*template.*for.*persona',
        'creating.*state.*for.*contributing',
        'contributing.*persona.*owns.*state',
        'adding.*confirmation.*stage.*for'
    ];

    const responseLower = response.toLowerCase();

    for (const pattern of forbiddenPatterns) {
        try {
            if (new RegExp(pattern, 'i').test(responseLower)) return true;
        } catch (e) {
            // Invalid pattern — skip
        }
    }

    // Check if a contributing persona is being treated as a primary
    // (i.e., has its own Accept/Amend prompt in a non-core state)
    if (roundtableState && roundtableState.active_contributing_personas) {
        const contributingNames = roundtableState.active_contributing_personas;
        for (const name of contributingNames) {
            const ownedStatePattern = new RegExp(
                `\\*\\*${_escapeRegex(name)}\\*\\*[\\s\\S]*?(?:accept|amend)\\s*\\?`,
                'i'
            );
            if (ownedStatePattern.test(response)) return true;
        }
    }

    return false;
}

// ---------------------------------------------------------------------------
// Persona loading validation check
// ---------------------------------------------------------------------------

/**
 * Persona loading validation: verifies that the response demonstrates correct
 * persona loading behavior (checking PERSONA_CONTEXT, splitting on delimiters,
 * falling back to Read tool).
 *
 * check.required_personas: personas that must be loaded
 * check.loading_indicators: signals that persona loading occurred
 *
 * @param {Object} check - Rule check definition
 * @param {string} response - Response text
 * @returns {boolean} true if violation
 */
function _checkPersonaLoadingValidation(check, response) {
    const requiredPersonas = check.required_personas || ['Maya', 'Alex', 'Jordan'];
    const loadingIndicators = check.loading_indicators || [
        'PERSONA_CONTEXT',
        'persona-maya',
        'persona-alex',
        'persona-jordan',
        'persona loaded',
        'loading persona'
    ];

    // Only check when response is early in the session (mentions persona loading)
    const isPersonaLoadingContext = loadingIndicators.some(ind =>
        response.toLowerCase().includes(ind.toLowerCase())
    );

    if (!isPersonaLoadingContext) return false; // Not a persona loading response

    // If loading is happening, verify all required personas are mentioned
    const responseLower = response.toLowerCase();
    const missingPersonas = requiredPersonas.filter(p =>
        !responseLower.includes(p.toLowerCase())
    );

    return missingPersonas.length > 0;
}

// ---------------------------------------------------------------------------
// Dispatch payload fields check
// ---------------------------------------------------------------------------

/**
 * Dispatch payload fields check: validates that delegation payloads
 * include all required context fields for bug-gather or analyze workflows.
 *
 * check.required_context_fields: fields expected in the dispatch payload
 * check.detect: which payload type to check
 *
 * @param {Object} check - Rule check definition
 * @param {string} response - Response text
 * @returns {boolean} true if violation
 */
function _checkDispatchPayloadFields(check, response) {
    const requiredFields = check.required_context_fields || [];
    if (requiredFields.length === 0) return false;

    // Only check if the response contains a delegation/dispatch payload
    const isDelegation = response.includes('delegation') ||
        response.includes('dispatch') ||
        response.includes('ANALYSIS_MODE') ||
        response.includes('BUG_REPORT_PATH');

    if (!isDelegation) return false;

    const missingFields = requiredFields.filter(f => !response.includes(f));
    return missingFields.length > 0;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { loadRules, evaluateRules };

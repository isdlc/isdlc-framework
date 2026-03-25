'use strict';

/**
 * iSDLC Prose Rule Extractor
 * ============================
 * Parses CLAUDE.md and agent files to identify enforceable behavioral
 * rules and generate candidate rule definitions.
 *
 * REQ-0140: Conversational enforcement via Stop hook
 * Covers: FR-002 (Rule Extraction from Prose)
 *
 * Extracted rules default to severity: "warn" until manually promoted
 * to "block" (AC-002-05). Manually authored rules take precedence over
 * extracted rules with the same id (AC-002-03).
 *
 * @module src/core/compliance/extractors/prose-extractor
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Behavioral constraint indicators (AC-002-01)
// ---------------------------------------------------------------------------

const CONSTRAINT_KEYWORDS = [
    'MUST', 'NEVER', 'ALWAYS', 'CRITICAL', 'MANDATORY',
    'DO NOT', 'REQUIRED', 'SHALL NOT'
];

const CONSTRAINT_REGEX = new RegExp(
    `\\b(${CONSTRAINT_KEYWORDS.join('|')})\\b`,
    'i'
);

// ---------------------------------------------------------------------------
// extractRules()
// ---------------------------------------------------------------------------

/**
 * Extract enforceable rules from prose files.
 *
 * @param {string[]} filePaths - Paths to CLAUDE.md, agent files, AGENTS.md
 * @param {Object} [options]
 * @param {string[]} [options.existingRuleIds] - IDs of manually authored rules (for dedup)
 * @returns {CandidateRule[]}
 */
function extractRules(filePaths, options = {}) {
    const existingIds = new Set(options.existingRuleIds || []);
    const candidates = [];

    for (const filePath of filePaths) {
        try {
            if (!fs.existsSync(filePath)) continue;
            const content = fs.readFileSync(filePath, 'utf8');
            const fileName = path.basename(filePath);
            const extracted = _extractFromContent(content, fileName, existingIds);
            candidates.push(...extracted);
        } catch (e) {
            // Skip unreadable files
        }
    }

    return candidates;
}

/**
 * Extract candidate rules from file content.
 *
 * @param {string} content - File content
 * @param {string} fileName - Source file name
 * @param {Set<string>} existingIds - IDs to skip (dedup)
 * @returns {CandidateRule[]}
 */
function _extractFromContent(content, fileName, existingIds) {
    const candidates = [];
    const sections = content.split(/^#{1,3}\s+/m);

    for (const section of sections) {
        if (!section.trim()) continue;

        const lines = section.split('\n');
        const sectionTitle = lines[0]?.trim() || '';

        // Look for lines containing behavioral constraints
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!CONSTRAINT_REGEX.test(line)) continue;

            // Extract the constraint
            const candidate = _buildCandidate(line, sectionTitle, fileName, existingIds);
            if (candidate) {
                candidates.push(candidate);
            }
        }
    }

    return candidates;
}

/**
 * Build a candidate rule from a constraint line.
 *
 * @param {string} line - The line containing the constraint
 * @param {string} sectionTitle - The section heading
 * @param {string} fileName - Source file name
 * @param {Set<string>} existingIds - IDs to skip
 * @returns {CandidateRule|null}
 */
function _buildCandidate(line, sectionTitle, fileName, existingIds) {
    // Generate a deterministic ID from the content
    const idBase = line.trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 40);
    const id = `extracted-${idBase}`;

    // Skip if conflicts with manually authored rule (AC-002-03)
    if (existingIds.has(id)) return null;

    return {
        id,
        name: `Extracted: ${sectionTitle.slice(0, 50)}`,
        source: fileName,
        source_line: line.trim(),
        trigger_condition: { workflow: 'analyze' },
        check: {
            type: 'pattern',
            pattern: '',  // Placeholder -- needs manual refinement
            scope: 'response',
            threshold: 0
        },
        corrective_guidance: line.trim(),
        severity: 'warn',  // AC-002-05: extracted rules default to warn
        provider_scope: 'both',
        confidence: 'low',
        needs_refinement: true
    };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { extractRules };

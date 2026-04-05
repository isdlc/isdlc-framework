#!/usr/bin/env node
'use strict';

/**
 * iSDLC Participation Gate Enforcer - Stop Hook
 * ===============================================
 * Before the first confirmation (PRESENTING_REQUIREMENTS) is reached,
 * verifies the roundtable transcript contains 3 primary persona
 * contributions via semantic markers:
 *   - Maya   → scope statement
 *   - Alex   → codebase evidence (file paths / "codebase" references)
 *   - Jordan → design implication (interface / design / specification)
 *
 * In silent mode, persona names are stripped from output, so detection
 * relies on semantic markers only — the gate works the same regardless
 * of rendering mode.
 *
 * Hook contract (Stop):
 *   stdin: JSON with { confirmation_state, rendering_mode, transcript }
 *   stdout: WARN line when the gate is not met (never blocks)
 *   exit:   always 0 (fail-open, Article X)
 *
 * Traces to: FR-008 (AC-008-03), FR-003 (AC-003-02)
 * REQ-GH-235
 */

// ---------------------------------------------------------------------------
// Read stdin
// ---------------------------------------------------------------------------

function readStdin() {
    return new Promise((resolve) => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => { data += chunk; });
        process.stdin.on('end', () => { resolve(data); });
        process.stdin.on('error', () => { resolve(''); });
    });
}

// ---------------------------------------------------------------------------
// Gate-active states
// ---------------------------------------------------------------------------

// The participation gate only evaluates BEFORE the first confirmation is
// reached. Once any confirmation has been presented, the gate has either
// cleared or is no longer applicable for this turn.
const GATE_ACTIVE_STATES = new Set([
    'PRE_FIRST_CONFIRMATION',
    'PRESENTING_REQUIREMENTS'
]);

// ---------------------------------------------------------------------------
// Semantic detection
// ---------------------------------------------------------------------------

/**
 * Detect Maya's scope statement in the transcript.
 * Semantic markers: scope-shaping language ("scope", "narrow fix",
 * "broader refactor", "what is the scope").
 */
function hasMayaScope(transcriptText) {
    return /\bscope\b/i.test(transcriptText);
}

/**
 * Detect Alex's codebase evidence in the transcript.
 * Semantic markers: "codebase", "searched the", file paths with common
 * extensions, grep hits, subsystem references.
 */
function hasAlexEvidence(transcriptText) {
    if (/\bcodebase\b/i.test(transcriptText)) return true;
    if (/\bsearched the\b/i.test(transcriptText)) return true;
    if (/\bgrep\b/i.test(transcriptText)) return true;
    // File path references (e.g., auth.js, src/foo/bar.ts, module.py)
    if (/\b[\w./-]+\.(?:js|cjs|mjs|ts|tsx|jsx|py|go|rs|rb|java|kt|cs|md|json|yaml|yml)\b/i.test(transcriptText)) {
        return true;
    }
    return false;
}

/**
 * Detect Jordan's design implication in the transcript.
 * Semantic markers: "design implication", "interface", "specification",
 * "contract", "module boundaries".
 */
function hasJordanDesign(transcriptText) {
    if (/\bdesign implication\b/i.test(transcriptText)) return true;
    if (/\binterface signature\b/i.test(transcriptText)) return true;
    if (/\bmodule boundar/i.test(transcriptText)) return true;
    if (/\bspecification\b/i.test(transcriptText)) return true;
    if (/\bthe interface\b/i.test(transcriptText)) return true;
    if (/\bthe contract\b/i.test(transcriptText)) return true;
    return false;
}

/**
 * Flatten transcript turns into a single searchable string of assistant
 * content. Non-assistant turns (user replies) are excluded because the
 * gate tracks assistant contributions.
 */
function flattenAssistantText(transcript) {
    if (!Array.isArray(transcript)) return '';
    const parts = [];
    for (const turn of transcript) {
        if (!turn || typeof turn !== 'object') continue;
        if (turn.role !== 'assistant') continue;
        if (typeof turn.content === 'string') {
            parts.push(turn.content);
        }
    }
    return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    try {
        const inputStr = await readStdin();
        if (!inputStr || !inputStr.trim()) {
            process.exit(0);
        }

        let input;
        try {
            input = JSON.parse(inputStr);
        } catch (e) {
            // Malformed JSON -- fail-open
            process.exit(0);
        }

        const state = input.confirmation_state;
        // If we are not in a gate-active state, the gate has cleared or is
        // not applicable — pass silently.
        if (!state || !GATE_ACTIVE_STATES.has(state)) {
            process.exit(0);
        }

        const transcriptText = flattenAssistantText(input.transcript);

        const maya = hasMayaScope(transcriptText);
        const alex = hasAlexEvidence(transcriptText);
        const jordan = hasJordanDesign(transcriptText);

        if (maya && alex && jordan) {
            // All three primary contributions present — gate passes silently
            process.exit(0);
        }

        const missing = [];
        if (!maya) missing.push('Maya scope');
        if (!alex) missing.push('Alex codebase evidence');
        if (!jordan) missing.push('Jordan design implication');

        const message =
            'WARN: Pre-confirmation participation gate not met ' +
            '(Maya scope + Alex codebase evidence + Jordan design implication required). ' +
            'Missing: ' + missing.join(', ') + '.';

        console.log(message);
        process.exit(0);

    } catch (e) {
        // Fail-open: any error allows the turn through (Article X)
        process.exit(0);
    }
}

main();

/**
 * Mode Selection Module -- REQ-0050
 * ==================================
 * Handles analysis mode selection logic extracted from analyze-item.cjs
 * for testability. Provides flag parsing, dispatch context building,
 * roster proposals, and UX prompts.
 *
 * Exported functions:
 * - parseModeFlags(flags) -> ModeFlags
 * - buildDispatchContext(opts) -> DispatchContext
 * - buildRosterProposal(roster) -> string
 * - buildModePrompt() -> string
 * - buildVerbosityPrompt(preselection?) -> string
 *
 * @module mode-selection
 * @traces FR-001, FR-002, FR-003, FR-004, FR-005
 */

'use strict';

/**
 * Standard artifact types produced by all analysis modes.
 * @traces AC-004-03
 */
const STANDARD_ARTIFACTS = [
    'requirements-spec',
    'impact-analysis',
    'architecture-overview',
    'module-design'
];

/**
 * Parse mode selection flags from CLI arguments.
 *
 * Flag precedence:
 * 1. --no-roundtable overrides all others (AC-001-07)
 * 2. --silent implies personas mode with silent verbosity (AC-001-05)
 * 3. --verbose implies personas mode with conversational verbosity (AC-002-04)
 * 4. --personas implies personas mode with pre-selection (AC-001-06)
 * 5. No flags = null mode (framework asks user) (AC-001-01)
 *
 * When both --silent and --verbose are present, --silent wins (more specific).
 *
 * @param {{ noRoundtable?: boolean, silent?: boolean, verbose?: boolean, personas?: string, light?: boolean }} flags
 * @returns {{ mode: string|null, verbosity: string|null, preselected: string[]|null, skipModeQuestion: boolean, light: boolean }}
 * @traces FR-001, FR-002, AC-001-01 through AC-001-07, AC-002-04
 */
function parseModeFlags(flags) {
    const result = {
        mode: null,
        verbosity: null,
        preselected: null,
        skipModeQuestion: false,
        light: !!flags.light
    };

    // --no-roundtable has highest precedence (AC-001-07)
    if (flags.noRoundtable) {
        result.mode = 'no-personas';
        result.skipModeQuestion = true;
        return result;
    }

    // --silent implies personas mode (AC-001-05)
    if (flags.silent) {
        result.mode = 'personas';
        result.verbosity = 'silent';
        result.skipModeQuestion = true;
    }

    // --verbose implies personas mode (AC-002-04)
    // If both --silent and --verbose are present, silent wins
    if (flags.verbose && !flags.silent) {
        result.mode = 'personas';
        result.verbosity = 'conversational';
        result.skipModeQuestion = true;
    }

    // --personas implies personas mode with pre-selection (AC-001-06)
    if (flags.personas !== undefined && flags.personas !== null) {
        result.mode = 'personas';
        result.skipModeQuestion = true;
        if (typeof flags.personas === 'string' && flags.personas.trim() !== '') {
            result.preselected = flags.personas.split(',').map(p => p.trim()).filter(Boolean);
        } else {
            result.preselected = [];
        }
    }

    return result;
}

/**
 * Build dispatch context for analysis.
 *
 * @param {{ mode: string, verbosity: string|null, activeRoster: string[], personaPaths: string[], topicPaths: string[], allAvailablePersonas?: string[] }} opts
 * @returns {object} Dispatch context fields
 * @traces FR-001, FR-004, FR-005, AC-004-01 through AC-004-05, AC-005-02 through AC-005-06
 */
function buildDispatchContext(opts) {
    const ctx = {
        artifact_types: STANDARD_ARTIFACTS
    };

    // If active roster is empty and mode was 'personas', fall back to no-personas (AC-003-06)
    const effectiveMode = (opts.mode === 'personas' && opts.activeRoster.length === 0)
        ? 'no-personas'
        : opts.mode;

    ctx.analysis_mode = effectiveMode;

    if (effectiveMode === 'no-personas') {
        // AC-004-01: no persona files loaded
        // AC-004-02: no persona voice/context
        ctx.persona_paths = [];
        ctx.active_roster = [];
        // persona_context is intentionally omitted (AC-004-02)
    } else {
        // personas mode
        ctx.persona_paths = opts.personaPaths || [];
        ctx.active_roster = opts.activeRoster || [];
        ctx.verbosity_choice = opts.verbosity || null;

        // AC-005-06: include all available personas (not just active)
        if (opts.allAvailablePersonas) {
            ctx.all_available_personas = opts.allAvailablePersonas;
        }
    }

    return ctx;
}

/**
 * Build a roster proposal string for the user.
 *
 * @param {{ recommended: string[], uncertain: string[], available: string[], disabled: string[] }} roster
 * @returns {string}
 * @traces AC-003-04, AC-003-07
 */
function buildRosterProposal(roster) {
    const lines = [];

    if (roster.recommended.length > 0) {
        lines.push(`I'd recommend these personas for this analysis: ${roster.recommended.join(', ')}.`);
    }

    if (roster.uncertain.length > 0) {
        lines.push(`Also considering: ${roster.uncertain.join(', ')} (partial keyword match).`);
    }

    if (roster.available.length > 0) {
        lines.push(`Also available if you'd like to add them: ${roster.available.join(', ')}.`);
    }

    lines.push('You can add or remove any persona from this roster.');

    return lines.join('\n');
}

/**
 * Build the mode selection prompt (conversational, not a numbered menu).
 *
 * @returns {string}
 * @traces AC-001-04
 */
function buildModePrompt() {
    return 'How would you like to run this analysis? You can go with a roundtable discussion ' +
        'using personas for multi-perspective analysis, or a straight analysis with no personas ' +
        'for a direct, focused pass.';
}

/**
 * Build the verbosity selection prompt.
 *
 * @param {string} [preselection] - Pre-selected verbosity from config
 * @returns {string}
 * @traces AC-002-01
 */
function buildVerbosityPrompt(preselection) {
    let prompt = 'Which conversation style would you like? ' +
        'Conversational (natural dialogue between personas), ' +
        'bulleted (structured observations), or ' +
        'silent (personas analyze internally, no visible conversation).';

    if (preselection) {
        prompt += ` Your config has "${preselection}" as the default.`;
    }

    return prompt;
}

module.exports = {
    parseModeFlags,
    buildDispatchContext,
    buildRosterProposal,
    buildModePrompt,
    buildVerbosityPrompt,
    STANDARD_ARTIFACTS
};

/**
 * Unit Tests: M1 Mode Selection -- REQ-0050
 *
 * Tests mode selection flag parsing, dispatch context assembly,
 * flag interactions, no-persona analysis path, and conversational UX.
 *
 * Traces: FR-001, FR-002, FR-003, FR-004, FR-005
 * @module mode-selection.test
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// We test the new exports from analyze-item helpers (mode selection logic)
// These functions will be extracted into a testable module
const {
    parseModeFlags,
    buildDispatchContext,
    buildRosterProposal,
    buildModePrompt,
    buildVerbosityPrompt,
    STANDARD_ARTIFACTS
} = require('../../../antigravity/mode-selection.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpRoot;

function createTmpRoot() {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'isdlc-mode-test-'));
    fs.mkdirSync(path.join(tmpRoot, 'src', 'claude', 'agents'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, '.isdlc'), { recursive: true });
    return tmpRoot;
}

function cleanupTmpRoot() {
    if (tmpRoot && fs.existsSync(tmpRoot)) {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
}

function writePersonaFile(dir, filename, frontmatter, body) {
    const fm = Object.entries(frontmatter)
        .map(([k, v]) => {
            if (Array.isArray(v)) {
                if (v.length === 0) return `${k}: []`;
                return `${k}:\n${v.map(i => `  - ${i}`).join('\n')}`;
            }
            return `${k}: ${v}`;
        })
        .join('\n');
    const content = `---\n${fm}\n---\n\n${body || '# Persona'}`;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), content, 'utf8');
}

function builtInDir() {
    return path.join(tmpRoot, 'src', 'claude', 'agents');
}

function userDir() {
    return path.join(tmpRoot, '.isdlc', 'personas');
}

// ---------------------------------------------------------------------------
// 1.1 Mode Selection Flag Parsing
// Traces: AC-001-01, AC-001-05, AC-001-06, AC-001-07, AC-002-04
// ---------------------------------------------------------------------------

describe('M1: Mode Selection Flag Parsing -- REQ-0050', () => {
    it('TC-MS-01: default mode when no flags passed', () => {
        // AC-001-01: mode is null => framework will ask user
        const result = parseModeFlags({});
        assert.equal(result.mode, null);
        assert.equal(result.verbosity, null);
        assert.equal(result.preselected, null);
    });

    it('TC-MS-02: --no-roundtable sets no-persona mode', () => {
        // AC-001-07
        const result = parseModeFlags({ noRoundtable: true });
        assert.equal(result.mode, 'no-personas');
    });

    it('TC-MS-03: --silent sets personas+silent mode', () => {
        // AC-001-05
        const result = parseModeFlags({ silent: true });
        assert.equal(result.mode, 'personas');
        assert.equal(result.verbosity, 'silent');
    });

    it('TC-MS-04: --personas sets with-personas mode', () => {
        // AC-001-06
        const result = parseModeFlags({ personas: 'security-reviewer,devops-engineer' });
        assert.equal(result.mode, 'personas');
        assert.deepEqual(result.preselected, ['security-reviewer', 'devops-engineer']);
    });

    it('TC-MS-05: --verbose sets personas+conversational', () => {
        // AC-002-04
        const result = parseModeFlags({ verbose: true });
        assert.equal(result.mode, 'personas');
        assert.equal(result.verbosity, 'conversational');
    });

    it('TC-MS-06: --no-roundtable skips mode question entirely', () => {
        // AC-001-07: dispatch context built with no-personas mode
        const result = parseModeFlags({ noRoundtable: true });
        assert.equal(result.mode, 'no-personas');
        assert.equal(result.skipModeQuestion, true);
    });
});

// ---------------------------------------------------------------------------
// 1.2 Mode Selection Dispatch Context
// Traces: AC-001-02, AC-001-03, AC-003-01, AC-004-01, AC-002-03
// ---------------------------------------------------------------------------

describe('M1: Mode Selection Dispatch Context -- REQ-0050', () => {
    beforeEach(() => createTmpRoot());
    afterEach(() => cleanupTmpRoot());

    it('TC-MS-07: dispatch context includes analysis_mode field', () => {
        // AC-001-02, AC-001-03
        const ctx = buildDispatchContext({
            mode: 'personas',
            verbosity: 'bulleted',
            activeRoster: ['business-analyst'],
            personaPaths: ['/some/path'],
            topicPaths: []
        });
        assert.equal(ctx.analysis_mode, 'personas');
    });

    it('TC-MS-08: no-persona dispatch has zero persona_paths', () => {
        // AC-004-01
        const ctx = buildDispatchContext({
            mode: 'no-personas',
            verbosity: null,
            activeRoster: [],
            personaPaths: [],
            topicPaths: []
        });
        assert.deepEqual(ctx.persona_paths, []);
        assert.equal(ctx.analysis_mode, 'no-personas');
    });

    it('TC-MS-09: with-personas dispatch includes active_roster', () => {
        // AC-001-03, AC-003-01
        const ctx = buildDispatchContext({
            mode: 'personas',
            verbosity: 'conversational',
            activeRoster: ['security-reviewer', 'devops-engineer'],
            personaPaths: ['/path/security', '/path/devops'],
            topicPaths: []
        });
        assert.deepEqual(ctx.active_roster, ['security-reviewer', 'devops-engineer']);
    });

    it('TC-MS-10: dispatch context includes verbosity_choice', () => {
        // AC-002-03
        const ctx = buildDispatchContext({
            mode: 'personas',
            verbosity: 'bulleted',
            activeRoster: ['business-analyst'],
            personaPaths: ['/path/ba'],
            topicPaths: []
        });
        assert.equal(ctx.verbosity_choice, 'bulleted');
    });
});

// ---------------------------------------------------------------------------
// 1.3 Flag Interactions
// Traces: AC-001-05, AC-001-07, AC-001-06, AC-002-04
// ---------------------------------------------------------------------------

describe('M1: Flag Interactions -- REQ-0050', () => {
    it('TC-MS-11: --silent and --verbose are mutually exclusive (last wins)', () => {
        // Both present: silent wins (it is the more explicit/specific flag)
        const result = parseModeFlags({ silent: true, verbose: true });
        assert.equal(result.verbosity, 'silent');
    });

    it('TC-MS-12: --no-roundtable overrides --personas', () => {
        // AC-001-07: no-roundtable has highest precedence
        const result = parseModeFlags({ noRoundtable: true, personas: 'security' });
        assert.equal(result.mode, 'no-personas');
    });

    it('TC-MS-13: --personas with empty string is treated as no pre-selection', () => {
        // AC-001-06
        const result = parseModeFlags({ personas: '' });
        assert.equal(result.mode, 'personas');
        assert.deepEqual(result.preselected, []);
    });

    it('TC-MS-14: --light flag preserved alongside mode flags', () => {
        const result = parseModeFlags({ light: true, silent: true });
        assert.equal(result.light, true);
        assert.equal(result.verbosity, 'silent');
    });
});

// ---------------------------------------------------------------------------
// 1.4 No-Persona Analysis Path
// Traces: AC-004-01, AC-004-02, AC-004-03, AC-004-04, AC-004-05
// ---------------------------------------------------------------------------

describe('M1: No-Persona Analysis Path -- REQ-0050', () => {
    it('TC-MS-15: no-persona mode skips persona file loading', () => {
        // AC-004-01: personaPaths should not be included
        const ctx = buildDispatchContext({
            mode: 'no-personas',
            verbosity: null,
            activeRoster: [],
            personaPaths: [],
            topicPaths: ['/some/topic']
        });
        assert.deepEqual(ctx.persona_paths, []);
    });

    it('TC-MS-16: no-persona mode produces all standard artifacts', () => {
        // AC-004-03
        const ctx = buildDispatchContext({
            mode: 'no-personas',
            verbosity: null,
            activeRoster: [],
            personaPaths: [],
            topicPaths: []
        });
        assert.deepEqual(ctx.artifact_types, STANDARD_ARTIFACTS);
        assert.ok(ctx.artifact_types.includes('requirements-spec'));
        assert.ok(ctx.artifact_types.includes('impact-analysis'));
        assert.ok(ctx.artifact_types.includes('architecture-overview'));
        assert.ok(ctx.artifact_types.includes('module-design'));
    });

    it('TC-MS-17: no-persona mode records analysis_mode in meta', () => {
        // AC-004-05
        const ctx = buildDispatchContext({
            mode: 'no-personas',
            verbosity: null,
            activeRoster: [],
            personaPaths: [],
            topicPaths: []
        });
        assert.equal(ctx.analysis_mode, 'no-personas');
    });

    it('TC-MS-18: no-persona mode excludes persona voice from context', () => {
        // AC-004-02, AC-004-04: no PERSONA_CONTEXT section
        const ctx = buildDispatchContext({
            mode: 'no-personas',
            verbosity: null,
            activeRoster: [],
            personaPaths: [],
            topicPaths: []
        });
        assert.equal(ctx.persona_context, undefined);
        assert.deepEqual(ctx.active_roster, []);
    });
});

// ---------------------------------------------------------------------------
// 1.5 Conversational UX Requirements
// Traces: AC-001-04, AC-002-01, AC-003-04, AC-003-06
// ---------------------------------------------------------------------------

describe('M1: Conversational UX Requirements -- REQ-0050', () => {
    it('TC-MS-19: mode question is conversational not numbered menu', () => {
        // AC-001-04
        const prompt = buildModePrompt();
        // Should NOT contain "1." or "2." style numbering
        assert.ok(!prompt.match(/^\d+\./m), 'Mode prompt should not be a numbered menu');
        // Should mention both options
        assert.ok(prompt.toLowerCase().includes('persona') || prompt.toLowerCase().includes('roundtable'));
        assert.ok(prompt.toLowerCase().includes('straight') || prompt.toLowerCase().includes('no persona'));
    });

    it('TC-MS-20: verbosity question presents three options', () => {
        // AC-002-01
        const prompt = buildVerbosityPrompt();
        assert.ok(prompt.toLowerCase().includes('conversational'));
        assert.ok(prompt.toLowerCase().includes('bulleted'));
        assert.ok(prompt.toLowerCase().includes('silent'));
    });

    it('TC-MS-21: roster proposal shows recommended and available', () => {
        // AC-003-04
        const proposal = buildRosterProposal({
            recommended: ['business-analyst', 'security-reviewer'],
            uncertain: ['devops-engineer'],
            available: ['ux-reviewer', 'qa-tester'],
            disabled: []
        });
        assert.ok(proposal.toLowerCase().includes('recommend'));
        assert.ok(proposal.includes('security-reviewer'));
        assert.ok(proposal.toLowerCase().includes('also') || proposal.toLowerCase().includes('consider'));
        assert.ok(proposal.includes('devops-engineer'));
        assert.ok(proposal.toLowerCase().includes('available'));
    });

    it('TC-MS-22: removing all personas falls back to no-persona mode', () => {
        // AC-003-06: empty roster means no-persona mode
        const modeFlags = parseModeFlags({ personas: '' });
        // When an empty roster is confirmed, mode should fallback
        const ctx = buildDispatchContext({
            mode: modeFlags.mode,
            verbosity: null,
            activeRoster: [],
            personaPaths: [],
            topicPaths: []
        });
        // If activeRoster is empty and mode was personas, dispatch falls back to no-personas
        assert.equal(ctx.analysis_mode, 'no-personas');
    });
});

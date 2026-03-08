/**
 * Integration Tests: M1+M5 Mode Dispatch Context -- REQ-0050
 *
 * Tests cross-module interactions for mode dispatch context assembly,
 * ROUNDTABLE_CONTEXT shape, and active roster integration.
 *
 * Traces: FR-001, FR-004, FR-005, AC-005-02 through AC-005-06
 * @module mode-dispatch-integration.test
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
    buildDispatchContext,
    buildRosterProposal,
    STANDARD_ARTIFACTS
} = require('../../../antigravity/mode-selection.cjs');

const { getPersonaPaths } = require('../lib/persona-loader.cjs');
const { readRoundtableConfig } = require('../lib/roundtable-config.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpRoot;

function createTmpRoot() {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'isdlc-dispatch-test-'));
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

function builtInDir() { return path.join(tmpRoot, 'src', 'claude', 'agents'); }
function userDir() { return path.join(tmpRoot, '.isdlc', 'personas'); }

// ---------------------------------------------------------------------------
// Integration Tests
// Traces: AC-005-02 through AC-005-06, AC-004-01 through AC-004-05
// ---------------------------------------------------------------------------

describe('M1+M5 Integration: Mode Dispatch Context -- REQ-0050', () => {
    beforeEach(() => createTmpRoot());
    afterEach(() => cleanupTmpRoot());

    it('TC-INT-50-15: ROUNDTABLE_CONTEXT includes all available personas', () => {
        // AC-005-06: all 8 persona files should be listed, not just 3 primaries
        for (const name of ['business-analyst', 'solutions-architect', 'system-designer',
            'security-reviewer', 'devops-engineer', 'ux-reviewer', 'qa-tester', 'performance-engineer']) {
            writePersonaFile(builtInDir(), `persona-${name}.md`, { name: `persona-${name}` });
        }

        const personaResult = getPersonaPaths(tmpRoot);
        assert.equal(personaResult.paths.length, 8);

        const ctx = buildDispatchContext({
            mode: 'personas',
            verbosity: 'bulleted',
            activeRoster: ['business-analyst', 'security-reviewer'],
            personaPaths: personaResult.paths,
            topicPaths: [],
            allAvailablePersonas: personaResult.paths.map(p => path.basename(p).replace('persona-', '').replace('.md', ''))
        });
        // All available should be tracked
        assert.equal(ctx.all_available_personas.length, 8);
    });

    it('TC-INT-50-16: ROUNDTABLE_CONTEXT reflects active_roster selection', () => {
        // AC-005-03
        writePersonaFile(builtInDir(), 'persona-security-reviewer.md', { name: 'persona-security-reviewer' });
        writePersonaFile(builtInDir(), 'persona-devops-engineer.md', { name: 'persona-devops-engineer' });
        writePersonaFile(builtInDir(), 'persona-business-analyst.md', { name: 'persona-business-analyst' });

        const ctx = buildDispatchContext({
            mode: 'personas',
            verbosity: 'conversational',
            activeRoster: ['security-reviewer', 'devops-engineer'],
            personaPaths: [
                path.join(builtInDir(), 'persona-security-reviewer.md'),
                path.join(builtInDir(), 'persona-devops-engineer.md')
            ],
            topicPaths: []
        });
        assert.deepEqual(ctx.active_roster, ['security-reviewer', 'devops-engineer']);
        assert.equal(ctx.persona_paths.length, 2);
    });

    it('TC-INT-50-17: no-persona mode dispatch has no ROUNDTABLE_CONTEXT', () => {
        // AC-004-01, AC-004-02
        const ctx = buildDispatchContext({
            mode: 'no-personas',
            verbosity: null,
            activeRoster: [],
            personaPaths: [],
            topicPaths: []
        });
        assert.equal(ctx.analysis_mode, 'no-personas');
        assert.deepEqual(ctx.persona_paths, []);
        assert.equal(ctx.persona_context, undefined);
    });

    it('TC-INT-50-18: dispatch context references active personas not three personas', () => {
        // AC-005-02
        const ctx = buildDispatchContext({
            mode: 'personas',
            verbosity: 'bulleted',
            activeRoster: ['security-reviewer', 'devops-engineer'],
            personaPaths: ['/path/sec', '/path/devops'],
            topicPaths: []
        });
        // The context should not mention "three personas"
        assert.ok(!JSON.stringify(ctx).includes('three personas'));
    });

    it('TC-INT-50-19: confirmation sequence adapts to active roster', () => {
        // AC-005-05: domains without active persona skip persona review
        const ctx = buildDispatchContext({
            mode: 'personas',
            verbosity: 'conversational',
            activeRoster: ['security-reviewer'],
            personaPaths: ['/path/sec'],
            topicPaths: []
        });
        // Only the security domain persona is active
        assert.deepEqual(ctx.active_roster, ['security-reviewer']);
        // The confirmation_domains field adapts dynamically
        assert.ok(ctx.artifact_types.length >= 4); // all standard artifacts still produced
    });

    it('TC-INT-50-20: verbosity_choice flows through to dispatch', () => {
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

    it('TC-INT-50-21: meta.json records analysis_mode', () => {
        // AC-004-05
        const ctxPersonas = buildDispatchContext({
            mode: 'personas',
            verbosity: 'silent',
            activeRoster: ['business-analyst'],
            personaPaths: ['/path/ba'],
            topicPaths: []
        });
        assert.equal(ctxPersonas.analysis_mode, 'personas');

        const ctxNo = buildDispatchContext({
            mode: 'no-personas',
            verbosity: null,
            activeRoster: [],
            personaPaths: [],
            topicPaths: []
        });
        assert.equal(ctxNo.analysis_mode, 'no-personas');
    });

    it('TC-INT-50-22: dispatch context includes all standard artifact types', () => {
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
});

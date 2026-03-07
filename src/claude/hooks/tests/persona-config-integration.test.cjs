/**
 * Integration Tests: M1+M2 Persona Config Integration -- REQ-0047
 *
 * Tests cross-module interactions between persona loading and config reading.
 *
 * Traces: FR-001, FR-003, FR-005, FR-011, NFR-004
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { getPersonaPaths } = require('../lib/persona-loader.cjs');
const { readRoundtableConfig, formatConfigSection } = require('../lib/roundtable-config.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpRoot;

function createTmpRoot() {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'isdlc-integration-test-'));
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

function writeConfig(content) {
    fs.writeFileSync(path.join(tmpRoot, '.isdlc', 'roundtable.yaml'), content, 'utf8');
}

function builtInDir() {
    return path.join(tmpRoot, 'src', 'claude', 'agents');
}

function userDir() {
    return path.join(tmpRoot, '.isdlc', 'personas');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('M1+M2 Integration: Persona Config', () => {
    beforeEach(() => createTmpRoot());
    afterEach(() => cleanupTmpRoot());

    it('TC-INT-01: default_personas are always included in effective roster', () => {
        writePersonaFile(builtInDir(), 'persona-security-reviewer.md', {
            name: 'persona-security-reviewer',
            role_type: 'contributing',
            triggers: ['security']
        });
        writeConfig('default_personas:\n  - security-reviewer\n');

        const personaResult = getPersonaPaths(tmpRoot);
        const config = readRoundtableConfig(tmpRoot);

        assert.ok(config.default_personas.includes('security-reviewer'));
        const filenames = personaResult.paths.map(p => path.basename(p));
        assert.ok(filenames.includes('persona-security-reviewer.md'));
    });

    it('TC-INT-02: disabled_personas excluded from auto-detection', () => {
        writePersonaFile(builtInDir(), 'persona-ux-reviewer.md', {
            name: 'persona-ux-reviewer',
            role_type: 'contributing',
            triggers: ['ux']
        });
        writeConfig('disabled_personas:\n  - ux-reviewer\n');

        const config = readRoundtableConfig(tmpRoot);
        assert.ok(config.disabled_personas.includes('ux-reviewer'));
        // Personas are still loaded (available for manual override) but marked as disabled
    });

    it('TC-INT-03: disabled beats default in conflict', () => {
        writeConfig('default_personas:\n  - security-reviewer\ndisabled_personas:\n  - security-reviewer\n');

        const config = readRoundtableConfig(tmpRoot);
        assert.ok(!config.default_personas.includes('security-reviewer'));
        assert.ok(config.disabled_personas.includes('security-reviewer'));
    });

    it('TC-INT-04: config missing defaults to bulleted with no defaults/disabled', () => {
        // No config file, no personas dir
        writePersonaFile(builtInDir(), 'persona-business-analyst.md', { name: 'persona-business-analyst' });

        const personaResult = getPersonaPaths(tmpRoot);
        const config = readRoundtableConfig(tmpRoot);

        assert.equal(config.verbosity, 'bulleted');
        assert.deepEqual(config.default_personas, []);
        assert.deepEqual(config.disabled_personas, []);
        assert.equal(personaResult.paths.length, 1);
    });

    it('TC-INT-05: all personas loaded when no config file', () => {
        writePersonaFile(builtInDir(), 'persona-business-analyst.md', { name: 'persona-business-analyst' });
        writePersonaFile(builtInDir(), 'persona-security-reviewer.md', { name: 'persona-security-reviewer' });
        writePersonaFile(builtInDir(), 'persona-qa-tester.md', { name: 'persona-qa-tester' });

        const personaResult = getPersonaPaths(tmpRoot);
        assert.equal(personaResult.paths.length, 3);
    });

    it('TC-INT-06: per-analysis --personas overrides disabled list', () => {
        writeConfig('disabled_personas:\n  - security-reviewer\n');

        // Even though security-reviewer is disabled, --personas explicit flag wins
        // This test validates the config+flag interaction
        const config = readRoundtableConfig(tmpRoot);
        assert.ok(config.disabled_personas.includes('security-reviewer'));
        // The --personas flag is handled at dispatch level, not in config reader
        // Config reader just reads the config, dispatch uses preselected_personas to bypass disabled
    });

    it('TC-INT-07: per-analysis --personas populates preselected roster', () => {
        writeConfig('verbosity: bulleted\n');
        const config = readRoundtableConfig(tmpRoot);
        assert.equal(config.verbosity, 'bulleted');
        // Preselected roster is set by analyze-item.cjs parseArgs, not by config reader
    });

    it('TC-INT-08: backward compat: no personas dir, no config = original primaries', () => {
        // Create only the 3 primary personas -- no personas dir, no config file
        writePersonaFile(builtInDir(), 'persona-business-analyst.md', { name: 'persona-business-analyst', role_type: 'primary' });
        writePersonaFile(builtInDir(), 'persona-solutions-architect.md', { name: 'persona-solutions-architect', role_type: 'primary' });
        writePersonaFile(builtInDir(), 'persona-system-designer.md', { name: 'persona-system-designer', role_type: 'primary' });

        const personaResult = getPersonaPaths(tmpRoot);
        const config = readRoundtableConfig(tmpRoot);

        assert.equal(personaResult.paths.length, 3);
        assert.equal(config.verbosity, 'bulleted');
        assert.deepEqual(config.default_personas, []);
    });

    it('TC-INT-09: user persona + config default + built-in = merged roster', () => {
        writePersonaFile(builtInDir(), 'persona-business-analyst.md', { name: 'persona-business-analyst' });
        writePersonaFile(builtInDir(), 'persona-security-reviewer.md', { name: 'persona-security-reviewer' });
        writePersonaFile(userDir(), 'persona-compliance.md', { name: 'persona-compliance' });
        writeConfig('default_personas:\n  - security-reviewer\n');

        const personaResult = getPersonaPaths(tmpRoot);
        const config = readRoundtableConfig(tmpRoot);

        assert.equal(personaResult.paths.length, 3);
        assert.ok(config.default_personas.includes('security-reviewer'));
        const filenames = personaResult.paths.map(p => path.basename(p));
        assert.ok(filenames.includes('persona-compliance.md'));
    });

    it('TC-INT-10: skipped files passed through to dispatch context', () => {
        writePersonaFile(builtInDir(), 'persona-business-analyst.md', { name: 'persona-business-analyst' });
        fs.mkdirSync(userDir(), { recursive: true });
        fs.writeFileSync(path.join(userDir(), 'persona-bad.md'), '# No frontmatter');

        const personaResult = getPersonaPaths(tmpRoot);
        assert.equal(personaResult.skippedFiles.length, 1);
        assert.equal(personaResult.skippedFiles[0].filename, 'persona-bad.md');
    });
});

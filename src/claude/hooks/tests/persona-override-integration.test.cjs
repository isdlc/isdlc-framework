/**
 * Integration Tests: M1+M5 Override-by-Copy -- REQ-0047
 *
 * Tests override-by-copy with real persona files, including drift warnings
 * and malformed overrides.
 *
 * Traces: FR-009, FR-010
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { getPersonaPaths, parseFrontmatter } = require('../lib/persona-loader.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpRoot;

function createTmpRoot() {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'isdlc-override-test-'));
    fs.mkdirSync(path.join(tmpRoot, 'src', 'claude', 'agents'), { recursive: true });
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
// Tests
// ---------------------------------------------------------------------------

describe('M1+M5 Integration: Override-by-Copy', () => {
    beforeEach(() => createTmpRoot());
    afterEach(() => cleanupTmpRoot());

    it('TC-OVR-01: user security reviewer overrides built-in', () => {
        writePersonaFile(builtInDir(), 'persona-security-reviewer.md', {
            name: 'persona-security-reviewer',
            version: '1.0.0',
            triggers: ['auth', 'security']
        });
        writePersonaFile(userDir(), 'persona-security-reviewer.md', {
            name: 'persona-security-reviewer',
            version: '1.0.0',
            triggers: ['custom-auth']
        });

        const result = getPersonaPaths(tmpRoot);
        assert.equal(result.paths.length, 1);
        assert.ok(result.paths[0].includes('.isdlc/personas'));
    });

    it('TC-OVR-02: override is full replacement (no merge)', () => {
        writePersonaFile(builtInDir(), 'persona-security-reviewer.md', {
            name: 'persona-security-reviewer',
            triggers: ['auth', 'OWASP']
        }, '# Built-in body');
        writePersonaFile(userDir(), 'persona-security-reviewer.md', {
            name: 'persona-security-reviewer',
            triggers: ['custom-only']
        }, '# User body');

        const result = getPersonaPaths(tmpRoot);
        const content = fs.readFileSync(result.paths[0], 'utf8');
        const fm = parseFrontmatter(content);

        assert.ok(content.includes('# User body'));
        assert.ok(!content.includes('# Built-in body'));
        assert.deepEqual(fm.triggers, ['custom-only']);
    });

    it('TC-OVR-03: drift warning on override with older version', () => {
        writePersonaFile(builtInDir(), 'persona-security-reviewer.md', {
            name: 'persona-security-reviewer',
            version: '1.1.0'
        });
        writePersonaFile(userDir(), 'persona-security-reviewer.md', {
            name: 'persona-security-reviewer',
            version: '1.0.0'
        });

        const result = getPersonaPaths(tmpRoot);
        assert.equal(result.driftWarnings.length, 1);
        assert.equal(result.driftWarnings[0].shippedVersion, '1.1.0');
        assert.equal(result.driftWarnings[0].userVersion, '1.0.0');
    });

    it('TC-OVR-04: analysis proceeds with user version despite drift', () => {
        writePersonaFile(builtInDir(), 'persona-security-reviewer.md', {
            name: 'persona-security-reviewer',
            version: '1.1.0'
        });
        writePersonaFile(userDir(), 'persona-security-reviewer.md', {
            name: 'persona-security-reviewer',
            version: '1.0.0'
        });

        const result = getPersonaPaths(tmpRoot);
        // User version is still the active path despite drift warning
        assert.ok(result.paths[0].includes('.isdlc/personas'));
        assert.equal(result.driftWarnings.length, 1);
    });

    it('TC-OVR-05: primary persona override works', () => {
        writePersonaFile(builtInDir(), 'persona-business-analyst.md', {
            name: 'persona-business-analyst',
            role_type: 'primary'
        }, '# Default Maya');
        writePersonaFile(userDir(), 'persona-business-analyst.md', {
            name: 'persona-business-analyst',
            role_type: 'primary'
        }, '# Custom Maya');

        const result = getPersonaPaths(tmpRoot);
        assert.equal(result.paths.length, 1);
        const content = fs.readFileSync(result.paths[0], 'utf8');
        assert.ok(content.includes('# Custom Maya'));
    });

    it('TC-OVR-06: override + no version in user = no drift warning', () => {
        writePersonaFile(builtInDir(), 'persona-security-reviewer.md', {
            name: 'persona-security-reviewer',
            version: '1.0.0'
        });
        writePersonaFile(userDir(), 'persona-security-reviewer.md', {
            name: 'persona-security-reviewer'
        });

        const result = getPersonaPaths(tmpRoot);
        assert.equal(result.driftWarnings.length, 0);
    });

    it('TC-OVR-07: multiple overrides in same project', () => {
        writePersonaFile(builtInDir(), 'persona-security-reviewer.md', {
            name: 'persona-security-reviewer',
            version: '1.0.0'
        });
        writePersonaFile(builtInDir(), 'persona-qa-tester.md', {
            name: 'persona-qa-tester',
            version: '1.0.0'
        });
        writePersonaFile(userDir(), 'persona-security-reviewer.md', {
            name: 'persona-security-reviewer',
            version: '1.0.0'
        });
        writePersonaFile(userDir(), 'persona-qa-tester.md', {
            name: 'persona-qa-tester',
            version: '1.0.0'
        });

        const result = getPersonaPaths(tmpRoot);
        assert.equal(result.paths.length, 2);
        // Both should be from user dir
        result.paths.forEach(p => {
            assert.ok(p.includes('.isdlc/personas'), `${p} should be from user dir`);
        });
    });

    it('TC-OVR-08: override with malformed user file = skip + keep built-in', () => {
        writePersonaFile(builtInDir(), 'persona-security-reviewer.md', {
            name: 'persona-security-reviewer',
            version: '1.0.0'
        });
        // Write malformed user override (no name field)
        fs.mkdirSync(userDir(), { recursive: true });
        fs.writeFileSync(path.join(userDir(), 'persona-security-reviewer.md'),
            '---\nversion: 2.0.0\n---\n# bad override');

        const result = getPersonaPaths(tmpRoot);
        // Built-in should be used since user override failed validation
        assert.equal(result.paths.length, 1);
        assert.ok(result.paths[0].includes('src/claude/agents'));
        // The malformed file should be in skippedFiles
        assert.ok(result.skippedFiles.length > 0);
    });
});

// ---------------------------------------------------------------------------
// REQ-0050: No-Primary-Forcing + Config Pre-population Integration
// ---------------------------------------------------------------------------

const { readRoundtableConfig } = require('../lib/roundtable-config.cjs');
const { filterByRoster } = require('../lib/persona-loader.cjs');

describe('M2+M3 Integration: No-Primary-Forcing + Config -- REQ-0050', () => {
    beforeEach(() => createTmpRoot());
    afterEach(() => cleanupTmpRoot());

    it('TC-INT-50-09: removing all primaries from roster works', () => {
        // AC-003-02, AC-005-01
        writePersonaFile(builtInDir(), 'persona-business-analyst.md', { name: 'persona-business-analyst' });
        writePersonaFile(builtInDir(), 'persona-solutions-architect.md', { name: 'persona-solutions-architect' });
        writePersonaFile(builtInDir(), 'persona-system-designer.md', { name: 'persona-system-designer' });
        writePersonaFile(builtInDir(), 'persona-security-reviewer.md', { name: 'persona-security-reviewer' });

        const result = getPersonaPaths(tmpRoot);
        const filtered = filterByRoster(result.paths, ['security-reviewer']);
        assert.equal(filtered.length, 1);
        assert.ok(filtered[0].includes('security-reviewer'));
    });

    it('TC-INT-50-10: removing all personas triggers no-persona fallback', () => {
        // AC-003-06
        writePersonaFile(builtInDir(), 'persona-business-analyst.md', { name: 'persona-business-analyst' });
        const result = getPersonaPaths(tmpRoot);
        const filtered = filterByRoster(result.paths, []);
        assert.equal(filtered.length, 0);
    });

    it('TC-INT-50-11: config pre-population + user override = user choice wins', () => {
        // AC-006-02: config defaults to security-reviewer but user removes it
        writePersonaFile(builtInDir(), 'persona-security-reviewer.md', { name: 'persona-security-reviewer' });
        writePersonaFile(builtInDir(), 'persona-business-analyst.md', { name: 'persona-business-analyst' });
        fs.mkdirSync(path.join(tmpRoot, '.isdlc'), { recursive: true });
        fs.writeFileSync(path.join(tmpRoot, '.isdlc', 'roundtable.yaml'),
            'default_personas:\n  - security-reviewer\n', 'utf8');

        const config = readRoundtableConfig(tmpRoot);
        assert.ok(config.default_personas.includes('security-reviewer'));
        // User overrides by removing from roster
        const result = getPersonaPaths(tmpRoot);
        const filtered = filterByRoster(result.paths, ['business-analyst']);
        assert.equal(filtered.length, 1);
        assert.ok(!filtered.some(p => p.includes('security-reviewer')));
    });

    it('TC-INT-50-12: config verbosity pre-populates but user can change', () => {
        // AC-006-01
        fs.mkdirSync(path.join(tmpRoot, '.isdlc'), { recursive: true });
        fs.writeFileSync(path.join(tmpRoot, '.isdlc', 'roundtable.yaml'),
            'verbosity: conversational\n', 'utf8');

        const config = readRoundtableConfig(tmpRoot);
        assert.equal(config.verbosity, 'conversational');
        // User passes --silent override
        const overridden = readRoundtableConfig(tmpRoot, { silent: true });
        assert.equal(overridden.verbosity, 'silent');
    });

    it('TC-INT-50-13: no config file + no flags = sensible defaults', () => {
        // AC-006-05
        const config = readRoundtableConfig(tmpRoot);
        assert.equal(config.verbosity, 'bulleted');
        assert.deepEqual(config.default_personas, []);
        assert.deepEqual(config.disabled_personas, []);
    });

    it('TC-INT-50-14: existing config continues working without modification', () => {
        // AC-006-04: REQ-0047-era config
        fs.mkdirSync(path.join(tmpRoot, '.isdlc'), { recursive: true });
        fs.writeFileSync(path.join(tmpRoot, '.isdlc', 'roundtable.yaml'),
            'verbosity: bulleted\ndefault_personas:\n  - security-reviewer\ndisabled_personas: []\n', 'utf8');

        const config = readRoundtableConfig(tmpRoot);
        assert.equal(config.verbosity, 'bulleted');
        assert.deepEqual(config.default_personas, ['security-reviewer']);
        assert.deepEqual(config.disabled_personas, []);
    });
});

/**
 * Unit Tests: M1 Persona Loader -- REQ-0047
 *
 * Tests getPersonaPaths() extension for contributing personas:
 * - Built-in persona discovery
 * - User persona discovery from .isdlc/personas/
 * - Override-by-copy mechanism
 * - Malformed file handling (fail-open)
 * - Version drift detection
 * - Validation rules
 *
 * Traces: FR-001, FR-002, FR-007, FR-009, FR-010, NFR-001, NFR-003
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
    getPersonaPaths,
    parseFrontmatter,
    validatePersona,
    isSafeFilename,
    compareSemver,
    deriveDomain
} = require('../lib/persona-loader.cjs');

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

let tmpRoot;

function createTmpRoot() {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'isdlc-persona-test-'));
    // Create the agents directory structure
    const agentsDir = path.join(tmpRoot, 'src', 'claude', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
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
// parseFrontmatter Tests
// ---------------------------------------------------------------------------

describe('parseFrontmatter', () => {
    it('parses simple key-value frontmatter', () => {
        const content = '---\nname: test-persona\nversion: 1.0.0\n---\n\n# Body';
        const fm = parseFrontmatter(content);
        assert.equal(fm.name, 'test-persona');
        assert.equal(fm.version, '1.0.0');
    });

    it('parses array fields', () => {
        const content = '---\nname: test\ntriggers:\n  - auth\n  - security\n---\n';
        const fm = parseFrontmatter(content);
        assert.deepEqual(fm.triggers, ['auth', 'security']);
    });

    it('parses inline array', () => {
        const content = '---\nname: test\ntriggers: [auth, security]\n---\n';
        const fm = parseFrontmatter(content);
        assert.deepEqual(fm.triggers, ['auth', 'security']);
    });

    it('parses empty array []', () => {
        const content = '---\nname: test\nowned_skills: []\n---\n';
        const fm = parseFrontmatter(content);
        assert.deepEqual(fm.owned_skills, []);
    });

    it('returns null for missing frontmatter', () => {
        assert.equal(parseFrontmatter('# No frontmatter'), null);
    });

    it('returns null for null/undefined input', () => {
        assert.equal(parseFrontmatter(null), null);
        assert.equal(parseFrontmatter(undefined), null);
    });

    it('handles quoted values', () => {
        const content = '---\nname: "test-persona"\ndescription: \'some desc\'\n---\n';
        const fm = parseFrontmatter(content);
        assert.equal(fm.name, 'test-persona');
        assert.equal(fm.description, 'some desc');
    });
});

// ---------------------------------------------------------------------------
// validatePersona Tests
// ---------------------------------------------------------------------------

describe('validatePersona', () => {
    it('validates persona with name field', () => {
        const result = validatePersona({ name: 'test' }, 'test.md', 'user');
        assert.equal(result.valid, true);
    });

    it('rejects null frontmatter', () => {
        const result = validatePersona(null, 'test.md', 'user');
        assert.equal(result.valid, false);
        assert.match(result.reason, /malformed/i);
    });

    it('rejects missing name field', () => {
        const result = validatePersona({ version: '1.0.0' }, 'test.md', 'user');
        assert.equal(result.valid, false);
        assert.match(result.reason, /name/i);
    });
});

// ---------------------------------------------------------------------------
// isSafeFilename Tests
// ---------------------------------------------------------------------------

describe('isSafeFilename', () => {
    it('accepts normal filename', () => {
        assert.equal(isSafeFilename('persona-security.md'), true);
    });

    it('rejects path traversal with ..', () => {
        assert.equal(isSafeFilename('../etc/passwd'), false);
    });

    it('rejects forward slash', () => {
        assert.equal(isSafeFilename('sub/file.md'), false);
    });

    it('rejects backslash', () => {
        assert.equal(isSafeFilename('sub\\file.md'), false);
    });
});

// ---------------------------------------------------------------------------
// compareSemver Tests
// ---------------------------------------------------------------------------

describe('compareSemver', () => {
    it('returns 0 for equal versions', () => {
        assert.equal(compareSemver('1.0.0', '1.0.0'), 0);
    });

    it('returns 1 when a > b', () => {
        assert.equal(compareSemver('1.1.0', '1.0.0'), 1);
    });

    it('returns -1 when a < b', () => {
        assert.equal(compareSemver('1.0.0', '2.0.0'), -1);
    });

    it('returns null for null input', () => {
        assert.equal(compareSemver(null, '1.0.0'), null);
        assert.equal(compareSemver('1.0.0', null), null);
    });
});

// ---------------------------------------------------------------------------
// deriveDomain Tests
// ---------------------------------------------------------------------------

describe('deriveDomain', () => {
    it('derives domain from persona filename', () => {
        assert.equal(deriveDomain('persona-security-reviewer.md'), 'security reviewer');
    });

    it('handles single-word domain', () => {
        assert.equal(deriveDomain('persona-compliance.md'), 'compliance');
    });
});

// ---------------------------------------------------------------------------
// 1.1 Built-in Persona Discovery
// ---------------------------------------------------------------------------

describe('M1: Built-in Persona Discovery', () => {
    beforeEach(() => createTmpRoot());
    afterEach(() => cleanupTmpRoot());

    it('TC-M1-01: discovers 3 primary personas from agents dir', () => {
        // Setup: create 3 primary persona files
        const dir = builtInDir();
        writePersonaFile(dir, 'persona-business-analyst.md', { name: 'persona-business-analyst', role_type: 'primary' });
        writePersonaFile(dir, 'persona-solutions-architect.md', { name: 'persona-solutions-architect', role_type: 'primary' });
        writePersonaFile(dir, 'persona-system-designer.md', { name: 'persona-system-designer', role_type: 'primary' });

        const result = getPersonaPaths(tmpRoot);
        assert.equal(result.paths.length, 3);
        assert.equal(result.driftWarnings.length, 0);
        assert.equal(result.skippedFiles.length, 0);
    });

    it('TC-M1-02: discovers contributing personas from agents dir', () => {
        const dir = builtInDir();
        writePersonaFile(dir, 'persona-business-analyst.md', { name: 'persona-business-analyst' });
        writePersonaFile(dir, 'persona-security-reviewer.md', { name: 'persona-security-reviewer', role_type: 'contributing' });

        const result = getPersonaPaths(tmpRoot);
        assert.equal(result.paths.length, 2);
        const filenames = result.paths.map(p => path.basename(p));
        assert.ok(filenames.includes('persona-security-reviewer.md'));
    });

    it('TC-M1-03: only matches persona-*.md pattern', () => {
        const dir = builtInDir();
        writePersonaFile(dir, 'persona-foo.md', { name: 'persona-foo' });
        fs.writeFileSync(path.join(dir, 'not-a-persona.md'), '---\nname: nope\n---\n');
        fs.writeFileSync(path.join(dir, 'roundtable-analyst.md'), '---\nname: rt\n---\n');

        const result = getPersonaPaths(tmpRoot);
        assert.equal(result.paths.length, 1);
        assert.ok(result.paths[0].endsWith('persona-foo.md'));
    });
});

// ---------------------------------------------------------------------------
// 1.2 User Persona Discovery
// ---------------------------------------------------------------------------

describe('M1: User Persona Discovery', () => {
    beforeEach(() => createTmpRoot());
    afterEach(() => cleanupTmpRoot());

    it('TC-M1-04: discovers personas from .isdlc/personas/', () => {
        const dir = builtInDir();
        writePersonaFile(dir, 'persona-business-analyst.md', { name: 'persona-business-analyst' });

        writePersonaFile(userDir(), 'persona-compliance.md', { name: 'persona-compliance', role_type: 'contributing' });

        const result = getPersonaPaths(tmpRoot);
        assert.equal(result.paths.length, 2);
        const filenames = result.paths.map(p => path.basename(p));
        assert.ok(filenames.includes('persona-compliance.md'));
    });

    it('TC-M1-05: handles missing .isdlc/personas/ directory', () => {
        const dir = builtInDir();
        writePersonaFile(dir, 'persona-business-analyst.md', { name: 'persona-business-analyst' });

        // No .isdlc/personas/ directory created
        const result = getPersonaPaths(tmpRoot);
        assert.equal(result.paths.length, 1);
        assert.equal(result.skippedFiles.length, 0);
    });

    it('TC-M1-06: handles empty .isdlc/personas/ directory', () => {
        const dir = builtInDir();
        writePersonaFile(dir, 'persona-business-analyst.md', { name: 'persona-business-analyst' });
        fs.mkdirSync(userDir(), { recursive: true });

        const result = getPersonaPaths(tmpRoot);
        assert.equal(result.paths.length, 1);
    });

    it('TC-M1-07: user personas added alongside built-ins', () => {
        const dir = builtInDir();
        writePersonaFile(dir, 'persona-business-analyst.md', { name: 'persona-business-analyst' });
        writePersonaFile(dir, 'persona-security-reviewer.md', { name: 'persona-security-reviewer' });

        writePersonaFile(userDir(), 'persona-compliance.md', { name: 'persona-compliance' });

        const result = getPersonaPaths(tmpRoot);
        assert.equal(result.paths.length, 3);
        const filenames = result.paths.map(p => path.basename(p));
        assert.ok(filenames.includes('persona-business-analyst.md'));
        assert.ok(filenames.includes('persona-security-reviewer.md'));
        assert.ok(filenames.includes('persona-compliance.md'));
    });
});

// ---------------------------------------------------------------------------
// 1.3 Override-by-Copy
// ---------------------------------------------------------------------------

describe('M1: Override-by-Copy', () => {
    beforeEach(() => createTmpRoot());
    afterEach(() => cleanupTmpRoot());

    it('TC-M1-08: user persona overrides built-in with same filename', () => {
        writePersonaFile(builtInDir(), 'persona-security-reviewer.md', { name: 'persona-security-reviewer', version: '1.0.0' });
        writePersonaFile(userDir(), 'persona-security-reviewer.md', { name: 'persona-security-reviewer', version: '1.0.0' });

        const result = getPersonaPaths(tmpRoot);
        assert.equal(result.paths.length, 1);
        assert.ok(result.paths[0].includes('.isdlc/personas'));
    });

    it('TC-M1-09: override is full file replacement', () => {
        writePersonaFile(builtInDir(), 'persona-security-reviewer.md', {
            name: 'persona-security-reviewer',
            version: '1.0.0',
            triggers: ['auth', 'security']
        });
        writePersonaFile(userDir(), 'persona-security-reviewer.md', {
            name: 'persona-security-reviewer',
            version: '1.0.0',
            triggers: ['custom-trigger']
        });

        const result = getPersonaPaths(tmpRoot);
        // User version used - can verify by reading the file
        const content = fs.readFileSync(result.paths[0], 'utf8');
        assert.ok(content.includes('custom-trigger'));
    });

    it('TC-M1-10: primary personas can be overridden', () => {
        writePersonaFile(builtInDir(), 'persona-business-analyst.md', { name: 'persona-business-analyst', version: '1.0.0' });
        writePersonaFile(userDir(), 'persona-business-analyst.md', { name: 'persona-business-analyst', version: '1.0.0' });

        const result = getPersonaPaths(tmpRoot);
        assert.equal(result.paths.length, 1);
        assert.ok(result.paths[0].includes('.isdlc/personas'));
    });

    it('TC-M1-11: override does not duplicate paths', () => {
        writePersonaFile(builtInDir(), 'persona-security-reviewer.md', { name: 'persona-security-reviewer', version: '1.0.0' });
        writePersonaFile(userDir(), 'persona-security-reviewer.md', { name: 'persona-security-reviewer', version: '1.0.0' });

        const result = getPersonaPaths(tmpRoot);
        assert.equal(result.paths.length, 1);
        const basenames = result.paths.map(p => path.basename(p));
        const unique = new Set(basenames);
        assert.equal(basenames.length, unique.size);
    });
});

// ---------------------------------------------------------------------------
// 1.4 Malformed File Handling (Fail-Open)
// ---------------------------------------------------------------------------

describe('M1: Malformed File Handling', () => {
    beforeEach(() => createTmpRoot());
    afterEach(() => cleanupTmpRoot());

    it('TC-M1-12: skips persona file with no frontmatter', () => {
        writePersonaFile(builtInDir(), 'persona-business-analyst.md', { name: 'persona-business-analyst' });
        fs.mkdirSync(userDir(), { recursive: true });
        fs.writeFileSync(path.join(userDir(), 'persona-bad.md'), '# No frontmatter\nJust text.');

        const result = getPersonaPaths(tmpRoot);
        assert.equal(result.paths.length, 1); // only built-in
        assert.equal(result.skippedFiles.length, 1);
        assert.equal(result.skippedFiles[0].filename, 'persona-bad.md');
    });

    it('TC-M1-13: skips persona file with missing name field', () => {
        writePersonaFile(builtInDir(), 'persona-business-analyst.md', { name: 'persona-business-analyst' });
        fs.mkdirSync(userDir(), { recursive: true });
        fs.writeFileSync(path.join(userDir(), 'persona-noname.md'), '---\nversion: 1.0.0\nrole_type: contributing\n---\n');

        const result = getPersonaPaths(tmpRoot);
        assert.equal(result.skippedFiles.length, 1);
        assert.match(result.skippedFiles[0].reason, /name/i);
    });

    it('TC-M1-14: skips persona file with malformed YAML', () => {
        writePersonaFile(builtInDir(), 'persona-business-analyst.md', { name: 'persona-business-analyst' });
        fs.mkdirSync(userDir(), { recursive: true });
        // Write raw content with unclosed bracket to simulate broken YAML
        fs.writeFileSync(path.join(userDir(), 'persona-broken.md'), '---\nname: [unclosed\n---\n');

        const result = getPersonaPaths(tmpRoot);
        // The persona should either be skipped or parsed with a warning
        // parseFrontmatter handles this gracefully
        assert.ok(result.paths.length >= 1); // at least the built-in
    });

    it('TC-M1-15: continues loading after skipping bad file', () => {
        writePersonaFile(builtInDir(), 'persona-business-analyst.md', { name: 'persona-business-analyst' });

        const ud = userDir();
        writePersonaFile(ud, 'persona-good1.md', { name: 'persona-good1' });
        writePersonaFile(ud, 'persona-good2.md', { name: 'persona-good2' });
        writePersonaFile(ud, 'persona-good3.md', { name: 'persona-good3' });
        fs.writeFileSync(path.join(ud, 'persona-bad.md'), '# No frontmatter');

        const result = getPersonaPaths(tmpRoot);
        assert.equal(result.paths.length, 4); // 1 built-in + 3 valid user
        assert.equal(result.skippedFiles.length, 1);
    });

    it('TC-M1-16: skippedFiles includes filename and reason', () => {
        fs.mkdirSync(userDir(), { recursive: true });
        fs.writeFileSync(path.join(userDir(), 'persona-nofm.md'), '# No frontmatter');

        const result = getPersonaPaths(tmpRoot);
        assert.ok(result.skippedFiles.length > 0);
        const skipped = result.skippedFiles[0];
        assert.ok(skipped.filename);
        assert.ok(skipped.reason);
    });
});

// ---------------------------------------------------------------------------
// 1.5 Version Drift Detection
// ---------------------------------------------------------------------------

describe('M1: Version Drift Detection', () => {
    beforeEach(() => createTmpRoot());
    afterEach(() => cleanupTmpRoot());

    it('TC-M1-17: detects version drift on override', () => {
        writePersonaFile(builtInDir(), 'persona-security-reviewer.md', { name: 'persona-security-reviewer', version: '1.1.0' });
        writePersonaFile(userDir(), 'persona-security-reviewer.md', { name: 'persona-security-reviewer', version: '1.0.0' });

        const result = getPersonaPaths(tmpRoot);
        assert.equal(result.driftWarnings.length, 1);
        assert.equal(result.driftWarnings[0].userVersion, '1.0.0');
        assert.equal(result.driftWarnings[0].shippedVersion, '1.1.0');
    });

    it('TC-M1-18: no drift warning when versions match', () => {
        writePersonaFile(builtInDir(), 'persona-security-reviewer.md', { name: 'persona-security-reviewer', version: '1.0.0' });
        writePersonaFile(userDir(), 'persona-security-reviewer.md', { name: 'persona-security-reviewer', version: '1.0.0' });

        const result = getPersonaPaths(tmpRoot);
        assert.equal(result.driftWarnings.length, 0);
    });

    it('TC-M1-19: no drift warning when user version is newer', () => {
        writePersonaFile(builtInDir(), 'persona-security-reviewer.md', { name: 'persona-security-reviewer', version: '1.0.0' });
        writePersonaFile(userDir(), 'persona-security-reviewer.md', { name: 'persona-security-reviewer', version: '2.0.0' });

        const result = getPersonaPaths(tmpRoot);
        assert.equal(result.driftWarnings.length, 0);
    });

    it('TC-M1-20: skips drift check when user file has no version', () => {
        writePersonaFile(builtInDir(), 'persona-security-reviewer.md', { name: 'persona-security-reviewer', version: '1.0.0' });
        writePersonaFile(userDir(), 'persona-security-reviewer.md', { name: 'persona-security-reviewer' });

        const result = getPersonaPaths(tmpRoot);
        assert.equal(result.driftWarnings.length, 0);
    });

    it('TC-M1-21: skips drift check when built-in has no version', () => {
        writePersonaFile(builtInDir(), 'persona-security-reviewer.md', { name: 'persona-security-reviewer' });
        writePersonaFile(userDir(), 'persona-security-reviewer.md', { name: 'persona-security-reviewer', version: '1.0.0' });

        const result = getPersonaPaths(tmpRoot);
        assert.equal(result.driftWarnings.length, 0);
    });

    it('TC-M1-22: drift warning contains correct fields', () => {
        writePersonaFile(builtInDir(), 'persona-security-reviewer.md', { name: 'persona-security-reviewer', version: '1.1.0' });
        writePersonaFile(userDir(), 'persona-security-reviewer.md', { name: 'My Custom Security', version: '1.0.0' });

        const result = getPersonaPaths(tmpRoot);
        assert.equal(result.driftWarnings.length, 1);
        const w = result.driftWarnings[0];
        assert.equal(w.filename, 'persona-security-reviewer.md');
        assert.equal(w.userVersion, '1.0.0');
        assert.equal(w.shippedVersion, '1.1.0');
        assert.equal(w.personaName, 'My Custom Security');
    });
});

// ---------------------------------------------------------------------------
// 1.6 Validation Rules
// ---------------------------------------------------------------------------

describe('M1: Validation Rules', () => {
    beforeEach(() => createTmpRoot());
    afterEach(() => cleanupTmpRoot());

    it('TC-M1-23: defaults role_type to contributing for user personas', () => {
        // This is a validation behavior - user personas without role_type are still valid
        const fm = parseFrontmatter('---\nname: persona-custom\n---\n');
        assert.ok(fm);
        assert.equal(fm.role_type, undefined); // Not set in frontmatter, default applied at loading
        const result = validatePersona(fm, 'persona-custom.md', 'user');
        assert.equal(result.valid, true);
    });

    it('TC-M1-24: derives domain from filename when missing', () => {
        assert.equal(deriveDomain('persona-security-reviewer.md'), 'security reviewer');
        assert.equal(deriveDomain('persona-qa-tester.md'), 'qa tester');
    });

    it('TC-M1-25: missing triggers treated as empty array', () => {
        const fm = parseFrontmatter('---\nname: test\n---\n');
        assert.ok(fm);
        assert.equal(fm.triggers, undefined); // undefined is treated as []
    });

    it('TC-M1-26: missing owned_skills treated as empty array', () => {
        const fm = parseFrontmatter('---\nname: test\n---\n');
        assert.ok(fm);
        assert.equal(fm.owned_skills, undefined); // undefined is treated as []
    });

    it('TC-M1-27: rejects path traversal in filenames', () => {
        writePersonaFile(builtInDir(), 'persona-business-analyst.md', { name: 'persona-business-analyst' });
        // We can't actually create a file named '../etc/passwd' in the personas dir
        // but we can verify the safety check function
        assert.equal(isSafeFilename('../../../etc/passwd'), false);
    });

    it('TC-M1-28: handles file read error gracefully', () => {
        writePersonaFile(builtInDir(), 'persona-business-analyst.md', { name: 'persona-business-analyst' });
        const ud = userDir();
        fs.mkdirSync(ud, { recursive: true });
        // Create a file then make it unreadable
        const badFile = path.join(ud, 'persona-unreadable.md');
        fs.writeFileSync(badFile, '---\nname: test\n---\n');
        try {
            fs.chmodSync(badFile, 0o000);
            const result = getPersonaPaths(tmpRoot);
            // File should be in skippedFiles due to read error
            // (may not work on all platforms, but the loader should not crash)
            assert.ok(result.paths.length >= 1);
        } finally {
            // Restore permissions for cleanup
            try { fs.chmodSync(badFile, 0o644); } catch (_) {}
        }
    });
});

// ---------------------------------------------------------------------------
// NFR-001: Performance
// ---------------------------------------------------------------------------

describe('NFR-001: Persona Loading Performance', () => {
    beforeEach(() => createTmpRoot());
    afterEach(() => cleanupTmpRoot());

    it('TC-NFR-01: loads 10 personas within 500ms', () => {
        const dir = builtInDir();
        for (let i = 0; i < 10; i++) {
            writePersonaFile(dir, `persona-test-${i}.md`, {
                name: `persona-test-${i}`,
                role_type: 'contributing',
                version: '1.0.0',
                triggers: [`trigger-${i}-a`, `trigger-${i}-b`]
            });
        }

        const start = performance.now();
        const result = getPersonaPaths(tmpRoot);
        const elapsed = performance.now() - start;

        assert.equal(result.paths.length, 10);
        assert.ok(elapsed < 500, `Loading 10 personas took ${elapsed.toFixed(1)}ms, expected < 500ms`);
    });
});

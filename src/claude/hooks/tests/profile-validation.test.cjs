'use strict';

/**
 * Unit Tests: profile validation and self-healing
 *
 * Tests for validateProfile() and healProfile().
 * Traces to: FR-007, FR-009, FR-010
 * REQ-0049: Gate profiles — configurable strictness levels
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

function freshRequire(mod) {
    const resolvedPath = require.resolve(mod);
    delete require.cache[resolvedPath];
    return require(mod);
}

let profileLoader;
let testDir;
let origEnv;

function setup() {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'isdlc-profile-val-test-'));
    origEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = testDir;
    fs.mkdirSync(path.join(testDir, '.isdlc', 'profiles'), { recursive: true });
    profileLoader = freshRequire('../lib/profile-loader.cjs');
}

function teardown() {
    if (origEnv !== undefined) {
        process.env.CLAUDE_PROJECT_DIR = origEnv;
    } else {
        delete process.env.CLAUDE_PROJECT_DIR;
    }
    if (testDir && fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
    }
    testDir = null;
}

function writeFile(name, content) {
    const filePath = path.join(testDir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    return filePath;
}

// ---------------------------------------------------------------------------
// validateProfile - parse errors (E-PROF-001)
// ---------------------------------------------------------------------------

describe('validateProfile - parse errors', () => {
    beforeEach(setup);
    afterEach(teardown);

    it('rejects malformed JSON', () => {
        const fp = writeFile('bad.json', '{ broken json }');
        const result = profileLoader.validateProfile(fp);
        assert.equal(result.valid, false);
        assert.ok(result.errors[0].message.includes('Invalid JSON'));
    });

    it('rejects empty file', () => {
        const fp = writeFile('empty.json', '');
        const result = profileLoader.validateProfile(fp);
        assert.equal(result.valid, false);
        assert.ok(result.errors[0].message.includes('empty'));
    });

    it('rejects non-object root (array)', () => {
        const fp = writeFile('arr.json', '[]');
        const result = profileLoader.validateProfile(fp);
        assert.equal(result.valid, false);
        assert.ok(result.errors[0].message.includes('array'));
    });

    it('rejects non-object root (string)', () => {
        const fp = writeFile('str.json', '"hello"');
        const result = profileLoader.validateProfile(fp);
        assert.equal(result.valid, false);
        assert.ok(result.errors[0].message.includes('string'));
    });

    it('handles file not found', () => {
        const result = profileLoader.validateProfile('/nonexistent/path.json');
        assert.equal(result.valid, false);
        assert.ok(result.errors[0].message.includes('Cannot read file'));
    });
});

// ---------------------------------------------------------------------------
// validateProfile - schema errors (E-PROF-002)
// ---------------------------------------------------------------------------

describe('validateProfile - schema errors', () => {
    beforeEach(setup);
    afterEach(teardown);

    it('rejects missing name', () => {
        const fp = writeFile('no-name.json', { description: 'test', triggers: ['t'] });
        const result = profileLoader.validateProfile(fp);
        assert.equal(result.valid, false);
        assert.ok(result.errors.some(e => e.field === 'name'));
    });

    it('rejects missing description', () => {
        const fp = writeFile('no-desc.json', { name: 'test', triggers: ['t'] });
        const result = profileLoader.validateProfile(fp);
        assert.equal(result.valid, false);
        assert.ok(result.errors.some(e => e.field === 'description'));
    });

    it('rejects missing triggers', () => {
        const fp = writeFile('no-trig.json', { name: 'test', description: 'test' });
        const result = profileLoader.validateProfile(fp);
        assert.equal(result.valid, false);
        assert.ok(result.errors.some(e => e.field === 'triggers'));
    });

    it('rejects empty triggers array', () => {
        const fp = writeFile('empty-trig.json', { name: 'test', description: 'test', triggers: [] });
        const result = profileLoader.validateProfile(fp);
        assert.equal(result.valid, false);
        assert.ok(result.errors.some(e => e.field === 'triggers'));
    });

    it('rejects non-string triggers', () => {
        const fp = writeFile('bad-trig.json', { name: 'test', description: 'test', triggers: [123] });
        const result = profileLoader.validateProfile(fp);
        assert.equal(result.valid, false);
        assert.ok(result.errors.some(e => e.field === 'triggers'));
    });

    it('flags unknown top-level field with typo suggestion', () => {
        const fp = writeFile('typo.json', {
            name: 'test', description: 'test', triggers: ['t'],
            global_overrids: { test_iteration: { enabled: false } }
        });
        const result = profileLoader.validateProfile(fp);
        assert.equal(result.valid, false);
        assert.ok(result.errors.some(e => e.field === 'global_overrids'));
        assert.ok(result.suggestions.some(s => s.suggested === 'global_overrides'));
    });

    it('flags unknown phase key with suggestion', () => {
        const fp = writeFile('bad-phase.json', {
            name: 'test', description: 'test', triggers: ['t'],
            overrides: { '06-implmentation': { test_iteration: { enabled: false } } }
        });
        const result = profileLoader.validateProfile(fp);
        assert.equal(result.valid, false);
        assert.ok(result.errors.some(e => e.field.includes('06-implmentation')));
        assert.ok(result.suggestions.some(s => s.suggested === '06-implementation'));
    });

    it('flags unknown override key', () => {
        const fp = writeFile('bad-override.json', {
            name: 'test', description: 'test', triggers: ['t'],
            global_overrides: { tset_iteration: { enabled: false } }
        });
        const result = profileLoader.validateProfile(fp);
        assert.equal(result.valid, false);
        assert.ok(result.suggestions.some(s => s.suggested === 'test_iteration'));
    });

    it('validates a correct profile as valid', () => {
        const fp = writeFile('good.json', {
            name: 'test', description: 'A valid profile', triggers: ['test'],
            global_overrides: { test_iteration: { max_iterations: 5 } }
        });
        const result = profileLoader.validateProfile(fp);
        assert.equal(result.valid, true);
        assert.equal(result.errors.length, 0);
    });
});

// ---------------------------------------------------------------------------
// healProfile (FR-009)
// ---------------------------------------------------------------------------

describe('healProfile', () => {
    beforeEach(setup);
    afterEach(teardown);

    it('renames a typo field at the top level', () => {
        const fp = writeFile('heal-top.json', {
            name: 'test', description: 'test', triggers: ['t'],
            global_overrids: { test_iteration: { enabled: false } }
        });
        const fixes = [{ field: 'global_overrids', original: 'global_overrids', suggested: 'global_overrides', confidence: 'high' }];
        const success = profileLoader.healProfile(fp, fixes);
        assert.equal(success, true);

        const healed = JSON.parse(fs.readFileSync(fp, 'utf8'));
        assert.ok(healed.global_overrides);
        assert.equal(healed.global_overrids, undefined);
    });

    it('renames a nested typo field', () => {
        const fp = writeFile('heal-nested.json', {
            name: 'test', description: 'test', triggers: ['t'],
            global_overrides: { tset_iteration: { enabled: false } }
        });
        const fixes = [{ field: 'global_overrides.tset_iteration', original: 'tset_iteration', suggested: 'test_iteration', confidence: 'high' }];
        const success = profileLoader.healProfile(fp, fixes);
        assert.equal(success, true);

        const healed = JSON.parse(fs.readFileSync(fp, 'utf8'));
        assert.ok(healed.global_overrides.test_iteration);
        assert.equal(healed.global_overrides.tset_iteration, undefined);
    });

    it('returns false on write failure', () => {
        const success = profileLoader.healProfile('/nonexistent/path.json', []);
        assert.equal(success, false);
    });
});

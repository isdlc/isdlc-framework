/**
 * Unit Tests: M2 Config Reader -- REQ-0047
 *
 * Tests readRoundtableConfig() for .isdlc/roundtable.yaml:
 * - Config file reading
 * - Validation and error handling
 * - Conflict resolution (disabled wins over default)
 * - Context injection formatting
 * - Per-analysis override flags
 *
 * Traces: FR-004, FR-005, FR-011, NFR-003, NFR-004
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
    readRoundtableConfig,
    formatConfigSection,
    parseYaml,
    defaultConfig,
    VALID_VERBOSITY
} = require('../lib/roundtable-config.cjs');

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

let tmpRoot;

function createTmpRoot() {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'isdlc-config-test-'));
    fs.mkdirSync(path.join(tmpRoot, '.isdlc'), { recursive: true });
    return tmpRoot;
}

function cleanupTmpRoot() {
    if (tmpRoot && fs.existsSync(tmpRoot)) {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
}

function writeConfig(content) {
    fs.writeFileSync(path.join(tmpRoot, '.isdlc', 'roundtable.yaml'), content, 'utf8');
}

// ---------------------------------------------------------------------------
// parseYaml Tests
// ---------------------------------------------------------------------------

describe('parseYaml', () => {
    it('parses basic key-value', () => {
        const result = parseYaml('verbosity: conversational\n');
        assert.equal(result.verbosity, 'conversational');
    });

    it('parses array values', () => {
        const result = parseYaml('default_personas:\n  - security-reviewer\n  - qa-tester\n');
        assert.deepEqual(result.default_personas, ['security-reviewer', 'qa-tester']);
    });

    it('handles inline comments', () => {
        const result = parseYaml('verbosity: bulleted  # default mode\n');
        assert.equal(result.verbosity, 'bulleted');
    });

    it('returns null for null input', () => {
        assert.equal(parseYaml(null), null);
    });

    it('returns null for empty string', () => {
        assert.equal(parseYaml(''), null);
    });
});

// ---------------------------------------------------------------------------
// 2.1 Config File Reading
// ---------------------------------------------------------------------------

describe('M2: Config File Reading', () => {
    beforeEach(() => createTmpRoot());
    afterEach(() => cleanupTmpRoot());

    it('TC-M2-01: reads verbosity from roundtable.yaml', () => {
        writeConfig('verbosity: conversational\n');

        const config = readRoundtableConfig(tmpRoot);
        assert.equal(config.verbosity, 'conversational');
    });

    it('TC-M2-02: reads default_personas array', () => {
        writeConfig('default_personas:\n  - security-reviewer\n  - qa-tester\n');

        const config = readRoundtableConfig(tmpRoot);
        assert.deepEqual(config.default_personas, ['security-reviewer', 'qa-tester']);
    });

    it('TC-M2-03: reads disabled_personas array', () => {
        writeConfig('disabled_personas:\n  - ux-reviewer\n');

        const config = readRoundtableConfig(tmpRoot);
        assert.deepEqual(config.disabled_personas, ['ux-reviewer']);
    });

    it('TC-M2-04: defaults when config file missing', () => {
        // No config file written
        const config = readRoundtableConfig(tmpRoot);
        assert.equal(config.verbosity, 'bulleted');
        assert.deepEqual(config.default_personas, []);
        assert.deepEqual(config.disabled_personas, []);
    });

    it('TC-M2-05: defaults when config file is empty', () => {
        writeConfig('');

        const config = readRoundtableConfig(tmpRoot);
        assert.equal(config.verbosity, 'bulleted');
        assert.deepEqual(config.default_personas, []);
        assert.deepEqual(config.disabled_personas, []);
    });
});

// ---------------------------------------------------------------------------
// 2.2 Validation and Error Handling
// ---------------------------------------------------------------------------

describe('M2: Validation and Error Handling', () => {
    beforeEach(() => createTmpRoot());
    afterEach(() => cleanupTmpRoot());

    it('TC-M2-06: rejects invalid verbosity value', () => {
        writeConfig('verbosity: loud\n');

        const config = readRoundtableConfig(tmpRoot);
        assert.equal(config.verbosity, 'bulleted'); // default
    });

    it('TC-M2-07: rejects non-string verbosity', () => {
        writeConfig('verbosity: 42\n');

        const config = readRoundtableConfig(tmpRoot);
        assert.equal(config.verbosity, 'bulleted'); // default
    });

    it('TC-M2-08: rejects non-array default_personas', () => {
        writeConfig('default_personas: security\n');

        const config = readRoundtableConfig(tmpRoot);
        // 'security' is parsed as a string, not an array, so it should default
        assert.deepEqual(config.default_personas, []);
    });

    it('TC-M2-09: rejects non-array disabled_personas', () => {
        writeConfig('disabled_personas: true\n');

        const config = readRoundtableConfig(tmpRoot);
        assert.deepEqual(config.disabled_personas, []);
    });

    it('TC-M2-10: handles malformed YAML gracefully', () => {
        writeConfig('{{{{invalid yaml!!!!\n  broken: [');

        const config = readRoundtableConfig(tmpRoot);
        assert.equal(config.verbosity, 'bulleted');
        assert.deepEqual(config.default_personas, []);
    });

    it('TC-M2-11: ignores unknown keys', () => {
        writeConfig('verbosity: silent\nunknown_field: value\nfuture_feature: true\n');

        const config = readRoundtableConfig(tmpRoot);
        assert.equal(config.verbosity, 'silent');
        // No error thrown for unknown keys
    });
});

// ---------------------------------------------------------------------------
// 2.3 Conflict Resolution
// ---------------------------------------------------------------------------

describe('M2: Conflict Resolution', () => {
    beforeEach(() => createTmpRoot());
    afterEach(() => cleanupTmpRoot());

    it('TC-M2-12: disabled_personas wins over default_personas', () => {
        writeConfig('default_personas:\n  - security-reviewer\n  - qa-tester\ndisabled_personas:\n  - security-reviewer\n');

        const config = readRoundtableConfig(tmpRoot);
        assert.ok(!config.default_personas.includes('security-reviewer'));
        assert.ok(config.disabled_personas.includes('security-reviewer'));
    });

    it('TC-M2-13: default_personas items not in disabled pass through', () => {
        writeConfig('default_personas:\n  - security-reviewer\n  - qa-tester\ndisabled_personas:\n  - security-reviewer\n');

        const config = readRoundtableConfig(tmpRoot);
        assert.ok(config.default_personas.includes('qa-tester'));
    });
});

// ---------------------------------------------------------------------------
// 2.4 Context Injection
// ---------------------------------------------------------------------------

describe('M2: Context Injection', () => {
    beforeEach(() => createTmpRoot());
    afterEach(() => cleanupTmpRoot());

    it('TC-M2-14: formatConfigSection produces valid output', () => {
        const config = { verbosity: 'bulleted', default_personas: ['security-reviewer'], disabled_personas: [] };
        const section = formatConfigSection(config);
        assert.ok(section.includes('verbosity: bulleted'));
    });

    it('TC-M2-15: config section includes verbosity', () => {
        const config = { verbosity: 'silent', default_personas: [], disabled_personas: [] };
        const section = formatConfigSection(config);
        assert.ok(section.includes('verbosity: silent'));
    });

    it('TC-M2-16: config section includes default_personas', () => {
        const config = { verbosity: 'bulleted', default_personas: ['security-reviewer'], disabled_personas: [] };
        const section = formatConfigSection(config);
        assert.ok(section.includes('security-reviewer'));
    });

    it('TC-M2-17: config section includes disabled_personas', () => {
        const config = { verbosity: 'bulleted', default_personas: [], disabled_personas: ['ux-reviewer'] };
        const section = formatConfigSection(config);
        assert.ok(section.includes('ux-reviewer'));
    });
});

// ---------------------------------------------------------------------------
// 2.5 Per-Analysis Override Flags
// ---------------------------------------------------------------------------

describe('M2: Per-Analysis Override Flags', () => {
    beforeEach(() => createTmpRoot());
    afterEach(() => cleanupTmpRoot());

    it('TC-M2-18: --verbose flag overrides verbosity to conversational', () => {
        writeConfig('verbosity: bulleted\n');

        const config = readRoundtableConfig(tmpRoot, { verbose: true });
        assert.equal(config.verbosity, 'conversational');
    });

    it('TC-M2-19: --silent flag overrides verbosity to silent', () => {
        writeConfig('verbosity: conversational\n');

        const config = readRoundtableConfig(tmpRoot, { silent: true });
        assert.equal(config.verbosity, 'silent');
    });

    it('TC-M2-20: per-analysis overrides do not modify config file', () => {
        const configContent = 'verbosity: bulleted\n';
        writeConfig(configContent);

        readRoundtableConfig(tmpRoot, { verbose: true });

        // Verify file is unchanged
        const afterContent = fs.readFileSync(path.join(tmpRoot, '.isdlc', 'roundtable.yaml'), 'utf8');
        assert.equal(afterContent, configContent);
    });
});

// ---------------------------------------------------------------------------
// VALID_VERBOSITY constant
// ---------------------------------------------------------------------------

describe('M2: Constants', () => {
    it('VALID_VERBOSITY includes all three modes', () => {
        assert.deepEqual(VALID_VERBOSITY, ['conversational', 'bulleted', 'silent']);
    });

    it('defaultConfig returns correct defaults', () => {
        const d = defaultConfig();
        assert.equal(d.verbosity, 'bulleted');
        assert.deepEqual(d.default_personas, []);
        assert.deepEqual(d.disabled_personas, []);
    });
});

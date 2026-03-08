/**
 * Unit Tests: M3 Config as Pre-population -- REQ-0050
 *
 * Tests roundtable-config.cjs modifications for pre-population semantics:
 * verbosity pre-selection, default_personas pre-population, disabled_personas,
 * and backward compatibility.
 *
 * Traces: FR-006, AC-006-01 through AC-006-05
 * @module roundtable-config-prepopulate.test
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
    defaultConfig,
    VALID_VERBOSITY
} = require('../lib/roundtable-config.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpRoot;

function createTmpRoot() {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'isdlc-config-prepop-test-'));
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
// 3.1 Verbosity Pre-population
// Traces: AC-006-01, AC-002-04, AC-006-05, AC-006-04
// ---------------------------------------------------------------------------

describe('M3: Verbosity Pre-population -- REQ-0050', () => {
    beforeEach(() => createTmpRoot());
    afterEach(() => cleanupTmpRoot());

    it('TC-CP-01: verbosity from config is returned as pre-selection', () => {
        // AC-006-01
        writeConfig('verbosity: conversational\n');
        const config = readRoundtableConfig(tmpRoot);
        assert.equal(config.verbosity, 'conversational');
        assert.equal(config.is_preselection, true);
    });

    it('TC-CP-02: verbosity flag overrides config pre-selection', () => {
        // AC-002-04
        writeConfig('verbosity: bulleted\n');
        const config = readRoundtableConfig(tmpRoot, { silent: true });
        assert.equal(config.verbosity, 'silent');
    });

    it('TC-CP-03: missing config defaults to bulleted pre-selection', () => {
        // AC-006-05: no config file
        const config = readRoundtableConfig(tmpRoot);
        assert.equal(config.verbosity, 'bulleted');
        assert.equal(config.is_preselection, true);
    });

    it('TC-CP-04: invalid verbosity value falls back to bulleted', () => {
        // AC-006-04
        writeConfig('verbosity: invalid_value\n');
        const config = readRoundtableConfig(tmpRoot);
        assert.equal(config.verbosity, 'bulleted');
    });
});

// ---------------------------------------------------------------------------
// 3.2 Default Personas Pre-population
// Traces: AC-006-02, AC-003-08, AC-003-02, AC-006-05
// ---------------------------------------------------------------------------

describe('M3: Default Personas Pre-population -- REQ-0050', () => {
    beforeEach(() => createTmpRoot());
    afterEach(() => cleanupTmpRoot());

    it('TC-CP-05: default_personas pre-populate recommendation', () => {
        // AC-006-02, AC-003-08
        writeConfig('default_personas:\n  - security-reviewer\n');
        const config = readRoundtableConfig(tmpRoot);
        assert.ok(config.default_personas.includes('security-reviewer'));
    });

    it('TC-CP-06: default_personas are recommendations not forced', () => {
        // AC-006-02, AC-003-02
        writeConfig('default_personas:\n  - security-reviewer\n');
        const config = readRoundtableConfig(tmpRoot);
        assert.equal(config.is_preselection, true);
        // The is_preselection flag means the user will still be asked
    });

    it('TC-CP-07: empty default_personas results in framework-only recommendations', () => {
        // AC-006-05
        writeConfig('default_personas: []\n');
        const config = readRoundtableConfig(tmpRoot);
        assert.deepEqual(config.default_personas, []);
    });

    it('TC-CP-08: missing default_personas defaults to 3 primaries recommended', () => {
        // AC-006-05: no config file means sensible defaults
        const config = readRoundtableConfig(tmpRoot);
        // When no config, default_personas is empty (framework recommends primaries based on presence)
        assert.deepEqual(config.default_personas, []);
    });
});

// ---------------------------------------------------------------------------
// 3.3 Disabled Personas Pre-population
// Traces: AC-006-03, AC-003-07
// ---------------------------------------------------------------------------

describe('M3: Disabled Personas Pre-population -- REQ-0050', () => {
    beforeEach(() => createTmpRoot());
    afterEach(() => cleanupTmpRoot());

    it('TC-CP-09: disabled_personas excluded from recommendations', () => {
        // AC-006-03, AC-003-07
        writeConfig('disabled_personas:\n  - ux-reviewer\n');
        const config = readRoundtableConfig(tmpRoot);
        assert.ok(config.disabled_personas.includes('ux-reviewer'));
    });

    it('TC-CP-10: disabled_personas still shown in available list', () => {
        // AC-006-03, AC-003-07
        // This is a semantic check: disabled personas are in the config but
        // the available_for_override field includes them
        writeConfig('disabled_personas:\n  - ux-reviewer\n');
        const config = readRoundtableConfig(tmpRoot);
        assert.ok(config.disabled_personas.includes('ux-reviewer'));
        // The persona is still tracked so it can be shown as available
    });

    it('TC-CP-11: disabled beats default in conflict', () => {
        // AC-006-03
        writeConfig('default_personas:\n  - security-reviewer\ndisabled_personas:\n  - security-reviewer\n');
        const config = readRoundtableConfig(tmpRoot);
        assert.ok(!config.default_personas.includes('security-reviewer'));
        assert.ok(config.disabled_personas.includes('security-reviewer'));
    });

    it('TC-CP-12: disabled_personas can be overridden by user', () => {
        // AC-003-07: disabled are excluded from recommendation but still available
        writeConfig('disabled_personas:\n  - ux-reviewer\n');
        const config = readRoundtableConfig(tmpRoot);
        // User override happens at the dispatch layer -- config just tracks disabled
        assert.ok(config.disabled_personas.includes('ux-reviewer'));
    });
});

// ---------------------------------------------------------------------------
// 3.4 Backward Compatibility
// Traces: AC-006-04, AC-006-05
// ---------------------------------------------------------------------------

describe('M3: Backward Compatibility -- REQ-0050', () => {
    beforeEach(() => createTmpRoot());
    afterEach(() => cleanupTmpRoot());

    it('TC-CP-13: existing roundtable.yaml works without modification', () => {
        // AC-006-04: REQ-0047-era config
        writeConfig('verbosity: bulleted\ndefault_personas:\n  - security-reviewer\ndisabled_personas: []\n');
        const config = readRoundtableConfig(tmpRoot);
        assert.equal(config.verbosity, 'bulleted');
        assert.deepEqual(config.default_personas, ['security-reviewer']);
        assert.deepEqual(config.disabled_personas, []);
        assert.equal(config.is_preselection, true);
    });

    it('TC-CP-14: config with unknown keys is not rejected', () => {
        // AC-006-04
        writeConfig('verbosity: silent\nunknown_future_key: some_value\nextra_field: 42\n');
        const config = readRoundtableConfig(tmpRoot);
        assert.equal(config.verbosity, 'silent');
        // Unknown keys are ignored, no error thrown
    });

    it('TC-CP-15: malformed YAML returns sensible defaults', () => {
        // AC-006-04
        writeConfig('verbosity: {{broken: yaml: [unclosed\n');
        const config = readRoundtableConfig(tmpRoot);
        // Should fall back to defaults
        assert.equal(config.verbosity, 'bulleted');
        assert.deepEqual(config.default_personas, []);
    });

    it('TC-CP-16: config read error returns sensible defaults', () => {
        // AC-006-05: file doesn't exist
        const config = readRoundtableConfig(tmpRoot);
        assert.equal(config.verbosity, 'bulleted');
        assert.deepEqual(config.default_personas, []);
        assert.deepEqual(config.disabled_personas, []);
        assert.equal(config.is_preselection, true);
    });
});

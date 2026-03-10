'use strict';

/**
 * iSDLC Process Config - Test Suite (CJS)
 * ========================================
 * Unit tests for readProcessConfig() in common.cjs (REQ-0056 FR-001, FR-007)
 *
 * Run: node --test src/claude/hooks/tests/test-process-config.test.cjs
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
    setupTestEnv,
    cleanupTestEnv,
    getTestDir
} = require('./hook-test-utils.cjs');

const commonSrcPath = path.resolve(__dirname, '..', 'lib', 'common.cjs');

function installCommonCjs() {
    const testDir = getTestDir();
    const libDir = path.join(testDir, 'lib');
    if (!fs.existsSync(libDir)) {
        fs.mkdirSync(libDir, { recursive: true });
    }
    const dest = path.join(libDir, 'common.cjs');
    fs.copyFileSync(commonSrcPath, dest);
    return dest;
}

function requireCommon(cjsPath) {
    delete require.cache[require.resolve(cjsPath)];
    return require(cjsPath);
}

// =============================================================================
// readProcessConfig
// =============================================================================

describe('readProcessConfig (REQ-0056)', () => {
    let common;
    let commonCjsPath;
    let savedEnv;

    before(() => {
        savedEnv = { ...process.env };
        setupTestEnv();
        commonCjsPath = installCommonCjs();
        common = requireCommon(commonCjsPath);
    });

    after(() => {
        cleanupTestEnv();
        process.env = savedEnv;
    });

    function freshCommon() {
        return requireCommon(commonCjsPath);
    }

    // ---- AC-001-02: Missing config uses defaults (returns null) ----

    it('T01: returns null when no process.json exists', () => {
        const testDir = getTestDir();
        const configPath = path.join(testDir, '.isdlc', 'process.json');
        if (fs.existsSync(configPath)) fs.unlinkSync(configPath);

        const result = common.readProcessConfig(testDir);
        assert.strictEqual(result, null);
    });

    // ---- AC-001-01: Config override applies custom phases ----

    it('T02: returns parsed object for valid JSON config', () => {
        const testDir = getTestDir();
        const config = {
            feature: ['01-requirements', '06-implementation', '08-code-review']
        };
        fs.writeFileSync(
            path.join(testDir, '.isdlc', 'process.json'),
            JSON.stringify(config, null, 2)
        );

        const result = freshCommon().readProcessConfig(testDir);
        assert.deepStrictEqual(result, config);
    });

    // ---- AC-007-01: Malformed JSON warns and uses defaults ----

    it('T03: returns null for malformed JSON (syntax error)', () => {
        const testDir = getTestDir();
        fs.writeFileSync(
            path.join(testDir, '.isdlc', 'process.json'),
            '{ broken json !!'
        );

        const result = freshCommon().readProcessConfig(testDir);
        assert.strictEqual(result, null);
    });

    it('T04: returns null for JSON array (not object)', () => {
        const testDir = getTestDir();
        fs.writeFileSync(
            path.join(testDir, '.isdlc', 'process.json'),
            '["01-requirements", "06-implementation"]'
        );

        const result = freshCommon().readProcessConfig(testDir);
        assert.strictEqual(result, null);
    });

    it('T05: returns null for JSON null', () => {
        const testDir = getTestDir();
        fs.writeFileSync(
            path.join(testDir, '.isdlc', 'process.json'),
            'null'
        );

        const result = freshCommon().readProcessConfig(testDir);
        assert.strictEqual(result, null);
    });

    it('T06: returns null for JSON string', () => {
        const testDir = getTestDir();
        fs.writeFileSync(
            path.join(testDir, '.isdlc', 'process.json'),
            '"not an object"'
        );

        const result = freshCommon().readProcessConfig(testDir);
        assert.strictEqual(result, null);
    });

    it('T07: returns full config with all workflow types', () => {
        const testDir = getTestDir();
        const config = {
            feature: ['01-requirements', '06-implementation'],
            fix: ['01-requirements', '02-tracing', '06-implementation'],
            upgrade: ['15-upgrade-plan', '15-upgrade-execute'],
            'test-run': ['11-local-testing'],
            'test-generate': ['05-test-strategy', '06-implementation']
        };
        fs.writeFileSync(
            path.join(testDir, '.isdlc', 'process.json'),
            JSON.stringify(config, null, 2)
        );

        const result = freshCommon().readProcessConfig(testDir);
        assert.deepStrictEqual(result, config);
    });

    it('T08: returns empty object for valid empty JSON object', () => {
        const testDir = getTestDir();
        fs.writeFileSync(
            path.join(testDir, '.isdlc', 'process.json'),
            '{}'
        );

        const result = freshCommon().readProcessConfig(testDir);
        assert.deepStrictEqual(result, {});
    });

    it('T09: returns config with extra fields (comments, docs)', () => {
        const testDir = getTestDir();
        const config = {
            _comment: 'Custom process config',
            _docs: 'See docs',
            feature: ['01-requirements', '06-implementation']
        };
        fs.writeFileSync(
            path.join(testDir, '.isdlc', 'process.json'),
            JSON.stringify(config, null, 2)
        );

        const result = freshCommon().readProcessConfig(testDir);
        assert.deepStrictEqual(result, config);
    });

    it('T10: returns null for JSON number', () => {
        const testDir = getTestDir();
        fs.writeFileSync(
            path.join(testDir, '.isdlc', 'process.json'),
            '42'
        );

        const result = freshCommon().readProcessConfig(testDir);
        assert.strictEqual(result, null);
    });
});

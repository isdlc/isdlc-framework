/**
 * Unit Tests: M5 Persona File Schema Validation -- REQ-0047
 *
 * Validates shipped contributing persona files:
 * - All 5 files exist
 * - Frontmatter schema compliance (role_type, owned_skills, triggers, version)
 * - Line count < 40 for each shipped persona
 * - Domain Expert template has placeholder content and authoring guidance
 *
 * Traces: FR-002, FR-007, FR-010, NFR-002
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { parseFrontmatter } = require('../lib/persona-loader.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const AGENTS_DIR = path.join(PROJECT_ROOT, 'src', 'claude', 'agents');

const CONTRIBUTING_PERSONAS = [
    'persona-security-reviewer.md',
    'persona-qa-tester.md',
    'persona-ux-reviewer.md',
    'persona-devops-reviewer.md',
    'persona-domain-expert.md'
];

// Helper: read and parse a persona file
function readPersona(filename) {
    const filePath = path.join(AGENTS_DIR, filename);
    const content = fs.readFileSync(filePath, 'utf8');
    const fm = parseFrontmatter(content);
    return { content, fm, filePath };
}

describe('M5: Contributing Persona File Schema Validation', () => {

    it('TC-M5-01: all 5 contributing persona files exist', () => {
        for (const filename of CONTRIBUTING_PERSONAS) {
            const filePath = path.join(AGENTS_DIR, filename);
            assert.ok(fs.existsSync(filePath), `Missing: ${filename}`);
        }
    });

    it('TC-M5-02: each contributing persona has role_type: contributing', () => {
        for (const filename of CONTRIBUTING_PERSONAS) {
            const { fm } = readPersona(filename);
            assert.ok(fm, `No frontmatter in ${filename}`);
            assert.equal(fm.role_type, 'contributing', `${filename} role_type should be contributing`);
        }
    });

    it('TC-M5-03: each contributing persona has owned_skills array', () => {
        for (const filename of CONTRIBUTING_PERSONAS) {
            const { fm } = readPersona(filename);
            assert.ok(fm, `No frontmatter in ${filename}`);
            assert.ok(
                Array.isArray(fm.owned_skills) || fm.owned_skills === undefined || fm.owned_skills === '',
                `${filename} owned_skills should be an array or empty`
            );
        }
    });

    it('TC-M5-04: each non-template contributing persona has triggers array', () => {
        // Domain expert template has empty triggers, which is expected
        const nonTemplate = CONTRIBUTING_PERSONAS.filter(f => f !== 'persona-domain-expert.md');
        for (const filename of nonTemplate) {
            const { fm } = readPersona(filename);
            assert.ok(fm, `No frontmatter in ${filename}`);
            assert.ok(Array.isArray(fm.triggers), `${filename} triggers should be an array`);
            assert.ok(fm.triggers.length > 0, `${filename} triggers should not be empty`);
        }
    });

    it('TC-M5-05: each shipped persona is under 40 lines', () => {
        for (const filename of CONTRIBUTING_PERSONAS) {
            const { content } = readPersona(filename);
            const lineCount = content.split('\n').length;
            assert.ok(lineCount < 40, `${filename} has ${lineCount} lines, expected < 40`);
        }
    });

    it('TC-M5-06: domain expert template has placeholder content', () => {
        const { content, fm } = readPersona('persona-domain-expert.md');
        assert.ok(fm, 'Domain expert should have frontmatter');
        // Should have empty triggers (placeholder)
        assert.ok(Array.isArray(fm.triggers) && fm.triggers.length === 0,
            'Domain expert triggers should be empty');
        // Should have placeholder body text
        assert.ok(content.includes('(your domain'), 'Domain expert should have placeholder text');
    });

    it('TC-M5-07: domain expert has inline authoring guidance', () => {
        const { content } = readPersona('persona-domain-expert.md');
        assert.ok(content.includes('AUTHORING GUIDANCE'), 'Should include authoring guidance');
        assert.ok(content.includes('triggers'), 'Guidance should mention triggers');
        assert.ok(content.includes('Voice Rules') || content.includes('voice rules'),
            'Guidance should mention voice rules');
        assert.ok(content.includes('context') || content.includes('Context'),
            'Guidance should mention context window trade-offs');
    });

    it('TC-M5-08: security reviewer has correct triggers', () => {
        const { fm } = readPersona('persona-security-reviewer.md');
        assert.ok(fm.triggers.includes('authentication'), 'Should include authentication trigger');
        assert.ok(fm.triggers.includes('authorization'), 'Should include authorization trigger');
        assert.ok(fm.triggers.includes('encryption'), 'Should include encryption trigger');
        assert.ok(fm.triggers.includes('OWASP'), 'Should include OWASP trigger');
    });

    it('TC-M5-09: qa tester has correct triggers', () => {
        const { fm } = readPersona('persona-qa-tester.md');
        assert.ok(fm.triggers.includes('test'), 'Should include test trigger');
        assert.ok(fm.triggers.includes('coverage'), 'Should include coverage trigger');
        assert.ok(fm.triggers.includes('regression'), 'Should include regression trigger');
        assert.ok(fm.triggers.includes('edge case'), 'Should include edge case trigger');
    });

    it('TC-M5-10: each persona has version field', () => {
        for (const filename of CONTRIBUTING_PERSONAS) {
            const { fm } = readPersona(filename);
            assert.ok(fm.version, `${filename} should have a version field`);
        }
    });

    it('TC-M5-11: each persona has valid semver version', () => {
        const semverRegex = /^\d+\.\d+\.\d+$/;
        for (const filename of CONTRIBUTING_PERSONAS) {
            const { fm } = readPersona(filename);
            assert.ok(semverRegex.test(fm.version),
                `${filename} version "${fm.version}" should match semver pattern`);
        }
    });

    it('TC-M5-12: all persona frontmatter parses as valid YAML', () => {
        for (const filename of CONTRIBUTING_PERSONAS) {
            const { fm } = readPersona(filename);
            assert.ok(fm !== null, `${filename} frontmatter should parse successfully`);
            assert.ok(fm.name, `${filename} should have a name field`);
        }
    });
});

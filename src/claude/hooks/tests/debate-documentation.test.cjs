/**
 * Tests for Documentation Updates (Module M6)
 * Traces to: FR-005, CON-003
 * Feature: REQ-0014-multi-agent-requirements-team
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.resolve(__dirname, '..', '..', 'CLAUDE.md.template');
const AGENTS_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'docs', 'AGENTS.md');

describe('M6: Documentation Updates', () => {
    // TC-M6-01: CLAUDE.md.template mentions debate mode
    it('TC-M6-01: CLAUDE.md.template mentions debate mode', () => {
        assert.ok(fs.existsSync(TEMPLATE_PATH), 'CLAUDE.md.template must exist');
        const content = fs.readFileSync(TEMPLATE_PATH, 'utf8');
        assert.ok(
            content.includes('Debate Mode') || content.includes('debate mode') || content.includes('debate'),
            'Template must contain debate mode reference'
        );
    });

    // TC-M6-02: CLAUDE.md.template has --no-debate usage
    it('TC-M6-02: CLAUDE.md.template has --no-debate usage', () => {
        assert.ok(fs.existsSync(TEMPLATE_PATH), 'CLAUDE.md.template must exist');
        const content = fs.readFileSync(TEMPLATE_PATH, 'utf8');
        assert.ok(
            content.includes('--no-debate'),
            'Template must contain --no-debate usage example'
        );
    });

    // TC-M6-03: AGENTS.md lists Critic agent
    it('TC-M6-03: AGENTS.md lists Critic agent', () => {
        assert.ok(fs.existsSync(AGENTS_PATH), 'AGENTS.md must exist');
        const content = fs.readFileSync(AGENTS_PATH, 'utf8');
        assert.ok(
            content.includes('requirements-critic'),
            'AGENTS.md must list requirements-critic agent'
        );
    });

    // TC-M6-04: AGENTS.md lists Refiner agent
    it('TC-M6-04: AGENTS.md lists Refiner agent', () => {
        assert.ok(fs.existsSync(AGENTS_PATH), 'AGENTS.md must exist');
        const content = fs.readFileSync(AGENTS_PATH, 'utf8');
        assert.ok(
            content.includes('requirements-refiner'),
            'AGENTS.md must list requirements-refiner agent'
        );
    });
});

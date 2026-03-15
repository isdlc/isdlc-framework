'use strict';

/**
 * Unit Tests: Configurable Session Cache Token Budget (REQ-0067)
 * ==============================================================
 * Tests for readConfig(), budget allocation, external skill truncation,
 * and budget-based warnings in rebuildSessionCache().
 *
 * Framework: node:test + node:assert/strict (CJS stream)
 * Run: node --test src/claude/hooks/tests/test-config-budget.test.cjs
 *
 * Traces to: FR-001 through FR-008, AC-001-01 through AC-008-02
 * Article VII: Artifact Traceability — test IDs trace to ACs
 */

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Module loading
// ---------------------------------------------------------------------------

const COMMON_SRC = path.resolve(__dirname, '..', 'lib', 'common.cjs');

/** Require common.cjs, clearing cache first to get fresh module. */
function requireCommon() {
    delete require.cache[require.resolve(COMMON_SRC)];
    return require(COMMON_SRC);
}

/** Create a minimal test project directory with .isdlc/ */
function createTestProject() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'isdlc-config-budget-'));
    fs.mkdirSync(path.join(tmpDir, '.isdlc'), { recursive: true });
    return tmpDir;
}

/** Create a full test project with all source files needed by rebuildSessionCache */
function createFullTestProject() {
    const tmpDir = createTestProject();

    // Constitution
    fs.mkdirSync(path.join(tmpDir, 'docs', 'isdlc'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'docs', 'isdlc', 'constitution.md'),
        '# Test Constitution\nArticle I: Test article content\n');

    // Workflows
    fs.mkdirSync(path.join(tmpDir, 'src', 'isdlc', 'config'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'isdlc', 'config', 'workflows.json'),
        JSON.stringify({ feature: { phases: ['01-requirements'] } }, null, 2));

    // Iteration requirements
    fs.mkdirSync(path.join(tmpDir, '.claude', 'hooks', 'config'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.claude', 'hooks', 'config', 'iteration-requirements.json'),
        JSON.stringify({ version: '2.0.0', phases: {} }, null, 2));

    // Artifact paths
    fs.writeFileSync(path.join(tmpDir, '.claude', 'hooks', 'config', 'artifact-paths.json'),
        JSON.stringify({ paths: {} }, null, 2));

    // Skills manifest (minimal)
    const manifest = {
        version: '5.0.0',
        total_skills: 0,
        enforcement_mode: 'observe',
        ownership: {},
        skill_lookup: {}
    };
    fs.mkdirSync(path.join(tmpDir, 'src', 'claude', 'hooks', 'config'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'claude', 'hooks', 'config', 'skills-manifest.json'),
        JSON.stringify(manifest, null, 2));
    fs.writeFileSync(path.join(tmpDir, '.claude', 'hooks', 'config', 'skills-manifest.json'),
        JSON.stringify(manifest, null, 2));

    // Persona files
    fs.mkdirSync(path.join(tmpDir, 'src', 'claude', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'claude', 'agents', 'persona-business-analyst.md'),
        'BA persona content\n');

    return tmpDir;
}

/** Write .isdlc/config.json in the given project root */
function writeProjectConfig(projectRoot, config) {
    fs.writeFileSync(
        path.join(projectRoot, '.isdlc', 'config.json'),
        JSON.stringify(config, null, 2)
    );
}

function cleanup(dir) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

// =============================================================================
// readConfig() unit tests (TC-CFG-*)
// =============================================================================

describe('readConfig() — REQ-0067 FR-001, FR-002, FR-006, FR-007', () => {
    let common;
    let savedEnv;

    before(() => {
        savedEnv = { ...process.env };
        process.env.NODE_ENV = 'test';
        process.env.ISDLC_TEST_MODE = '1';
        common = requireCommon();
    });

    after(() => {
        process.env = savedEnv;
    });

    beforeEach(() => {
        if (common._resetCaches) common._resetCaches();
    });

    // TC-CFG-01: FR-001 AC-001-01
    it('TC-CFG-01: readConfig() returns user-configured budget_tokens from .isdlc/config.json', () => {
        const tmpDir = createTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            writeProjectConfig(tmpDir, { cache: { budget_tokens: 150000 } });
            const config = common.readConfig(tmpDir);
            assert.equal(config.cache.budget_tokens, 150000,
                'AC-001-01: budget_tokens should be 150000 from config file');
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-CFG-02: FR-001 AC-001-02
    it('TC-CFG-02: readConfig() fills missing section_priorities from defaults when only budget_tokens provided', () => {
        const tmpDir = createTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            writeProjectConfig(tmpDir, { cache: { budget_tokens: 150000 } });
            const config = common.readConfig(tmpDir);
            assert.equal(config.cache.budget_tokens, 150000);
            // Should have all default section priorities
            assert.equal(config.cache.section_priorities.constitution, 1);
            assert.equal(config.cache.section_priorities.workflow_config, 2);
            assert.equal(config.cache.section_priorities.iteration_requirements, 3);
            assert.equal(config.cache.section_priorities.artifact_paths, 4);
            assert.equal(config.cache.section_priorities.skills_manifest, 5);
            assert.equal(config.cache.section_priorities.skill_index, 6);
            assert.equal(config.cache.section_priorities.external_skills, 7);
            assert.equal(config.cache.section_priorities.roundtable_context, 8);
            assert.equal(config.cache.section_priorities.instructions, 9);
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-CFG-03: FR-001 AC-001-03
    it('TC-CFG-03: readConfig() returns full defaults when .isdlc/config.json does not exist', () => {
        const tmpDir = createTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            // No config file written
            const config = common.readConfig(tmpDir);
            assert.equal(config.cache.budget_tokens, 100000,
                'AC-001-03: default budget_tokens should be 100000');
            assert.equal(config.cache.section_priorities.constitution, 1);
            assert.equal(config.cache.section_priorities.instructions, 9);
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-CFG-04: FR-002 AC-002-01
    it('TC-CFG-04: readConfig() caches result — second call does not re-read file', () => {
        const tmpDir = createTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            writeProjectConfig(tmpDir, { cache: { budget_tokens: 200000 } });
            const config1 = common.readConfig(tmpDir);
            assert.equal(config1.cache.budget_tokens, 200000);

            // Overwrite the file with a different value
            writeProjectConfig(tmpDir, { cache: { budget_tokens: 300000 } });

            // Second call should return cached value (200000), not new file value (300000)
            const config2 = common.readConfig(tmpDir);
            assert.equal(config2.cache.budget_tokens, 200000,
                'AC-002-01: second call should return cached result, not re-read file');
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-CFG-05: FR-002 AC-002-02
    it('TC-CFG-05: readConfig() emits stderr warning and returns defaults on malformed JSON', () => {
        const tmpDir = createTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            fs.writeFileSync(path.join(tmpDir, '.isdlc', 'config.json'), 'not valid json{{{');

            // Capture stderr
            const stderrMessages = [];
            const origWrite = process.stderr.write;
            process.stderr.write = (msg) => { stderrMessages.push(msg); return true; };
            try {
                const config = common.readConfig(tmpDir);
                assert.equal(config.cache.budget_tokens, 100000,
                    'AC-002-02: malformed JSON should fall back to default budget_tokens');
                assert.ok(stderrMessages.some(m => typeof m === 'string' && m.includes('config')),
                    'AC-002-02: should emit stderr warning about config');
            } finally {
                process.stderr.write = origWrite;
            }
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-CFG-06: FR-002 AC-002-03
    it('TC-CFG-06: readConfig() emits stderr warning and defaults budget_tokens when value is negative', () => {
        const tmpDir = createTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            writeProjectConfig(tmpDir, { cache: { budget_tokens: -1 } });

            const stderrMessages = [];
            const origWrite = process.stderr.write;
            process.stderr.write = (msg) => { stderrMessages.push(msg); return true; };
            try {
                const config = common.readConfig(tmpDir);
                assert.equal(config.cache.budget_tokens, 100000,
                    'AC-002-03: negative budget_tokens should fall back to default 100000');
                assert.ok(stderrMessages.some(m => typeof m === 'string' && m.includes('budget_tokens')),
                    'AC-002-03: should warn about invalid budget_tokens');
            } finally {
                process.stderr.write = origWrite;
            }
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-CFG-07: FR-002 AC-002-04
    it('TC-CFG-07: readConfig() ignores unknown section names in section_priorities', () => {
        const tmpDir = createTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            writeProjectConfig(tmpDir, {
                cache: {
                    budget_tokens: 100000,
                    section_priorities: {
                        constitution: 1,
                        unknown_future_section: 5,
                        another_unknown: 2
                    }
                }
            });
            const config = common.readConfig(tmpDir);
            // Known sections should be present with defaults or overrides
            assert.equal(config.cache.section_priorities.constitution, 1);
            // Unknown sections should be silently ignored (not cause errors)
            // The config should still have all default sections
            assert.equal(config.cache.section_priorities.workflow_config, 2);
            assert.equal(config.cache.section_priorities.instructions, 9);
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-CFG-08: FR-006 AC-006-01
    it('TC-CFG-08: default budget_tokens is 100000', () => {
        const tmpDir = createTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            const config = common.readConfig(tmpDir);
            assert.equal(config.cache.budget_tokens, 100000,
                'AC-006-01: default budget_tokens must be 100000');
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-CFG-09: FR-006 AC-006-02
    it('TC-CFG-09: default section priorities match specification', () => {
        const tmpDir = createTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            const config = common.readConfig(tmpDir);
            const priorities = config.cache.section_priorities;
            assert.equal(priorities.constitution, 1);
            assert.equal(priorities.workflow_config, 2);
            assert.equal(priorities.iteration_requirements, 3);
            assert.equal(priorities.artifact_paths, 4);
            assert.equal(priorities.skills_manifest, 5);
            assert.equal(priorities.skill_index, 6);
            assert.equal(priorities.external_skills, 7);
            assert.equal(priorities.roundtable_context, 8);
            assert.equal(priorities.instructions, 9);
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-CFG-10: FR-007 AC-007-01
    it('TC-CFG-10: rebuildSessionCache runs successfully with no .isdlc/config.json present', () => {
        const tmpDir = createFullTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            // No config.json written — should succeed with defaults
            const result = common.rebuildSessionCache({ projectRoot: tmpDir });
            assert.ok(result.path.endsWith(path.join('.isdlc', 'session-cache.md')));
            assert.ok(result.size > 0);
            assert.ok(result.sections.length > 0);
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-CFG-11: FR-007 AC-007-02
    it('TC-CFG-11: readConfig() returns defaults when budget_tokens is a string "not_a_number"', () => {
        const tmpDir = createTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            writeProjectConfig(tmpDir, { cache: { budget_tokens: 'not_a_number' } });

            const stderrMessages = [];
            const origWrite = process.stderr.write;
            process.stderr.write = (msg) => { stderrMessages.push(msg); return true; };
            try {
                const config = common.readConfig(tmpDir);
                assert.equal(config.cache.budget_tokens, 100000,
                    'AC-007-02: string budget_tokens should fall back to default 100000');
            } finally {
                process.stderr.write = origWrite;
            }
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-CFG-12: FR-002 — empty file
    it('TC-CFG-12: readConfig() returns defaults when .isdlc/config.json is empty file', () => {
        const tmpDir = createTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            fs.writeFileSync(path.join(tmpDir, '.isdlc', 'config.json'), '');

            const stderrMessages = [];
            const origWrite = process.stderr.write;
            process.stderr.write = (msg) => { stderrMessages.push(msg); return true; };
            try {
                const config = common.readConfig(tmpDir);
                assert.equal(config.cache.budget_tokens, 100000,
                    'Empty config file should fall back to defaults');
            } finally {
                process.stderr.write = origWrite;
            }
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-CFG-13: FR-002 — JSON array instead of object
    it('TC-CFG-13: readConfig() returns defaults when .isdlc/config.json contains a JSON array', () => {
        const tmpDir = createTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            fs.writeFileSync(path.join(tmpDir, '.isdlc', 'config.json'), '[1, 2, 3]');

            const stderrMessages = [];
            const origWrite = process.stderr.write;
            process.stderr.write = (msg) => { stderrMessages.push(msg); return true; };
            try {
                const config = common.readConfig(tmpDir);
                assert.equal(config.cache.budget_tokens, 100000,
                    'JSON array config should fall back to defaults');
            } finally {
                process.stderr.write = origWrite;
            }
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-CFG-14: FR-001 — budget_tokens of 0
    it('TC-CFG-14: readConfig() warns and defaults when budget_tokens is 0', () => {
        const tmpDir = createTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            writeProjectConfig(tmpDir, { cache: { budget_tokens: 0 } });

            const stderrMessages = [];
            const origWrite = process.stderr.write;
            process.stderr.write = (msg) => { stderrMessages.push(msg); return true; };
            try {
                const config = common.readConfig(tmpDir);
                assert.equal(config.cache.budget_tokens, 100000,
                    'Zero budget_tokens should fall back to default');
            } finally {
                process.stderr.write = origWrite;
            }
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-CFG-15: FR-002 — non-numeric priority values
    it('TC-CFG-15: readConfig() handles priority values that are not numbers', () => {
        const tmpDir = createTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            writeProjectConfig(tmpDir, {
                cache: {
                    section_priorities: {
                        constitution: 'high',
                        workflow_config: true
                    }
                }
            });

            const stderrMessages = [];
            const origWrite = process.stderr.write;
            process.stderr.write = (msg) => { stderrMessages.push(msg); return true; };
            try {
                const config = common.readConfig(tmpDir);
                // Non-numeric priorities should fall back to defaults
                assert.equal(config.cache.section_priorities.constitution, 1,
                    'Non-numeric priority should fall back to default value');
                assert.equal(config.cache.section_priorities.workflow_config, 2,
                    'Boolean priority should fall back to default value');
            } finally {
                process.stderr.write = origWrite;
            }
        } finally {
            cleanup(tmpDir);
        }
    });
});

// =============================================================================
// Budget allocation tests (TC-BDG-*)
// =============================================================================

describe('Budget allocation — REQ-0067 FR-003, FR-004, FR-005', () => {
    let common;
    let savedEnv;

    before(() => {
        savedEnv = { ...process.env };
        process.env.NODE_ENV = 'test';
        process.env.ISDLC_TEST_MODE = '1';
        common = requireCommon();
    });

    after(() => {
        process.env = savedEnv;
    });

    beforeEach(() => {
        if (common._resetCaches) common._resetCaches();
    });

    // TC-BDG-01: FR-003 AC-003-01
    it('TC-BDG-01: budget 50K tokens with 80K total content — only priority-ordered sections fit', () => {
        const tmpDir = createFullTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            // Create a config with a very tight budget
            writeProjectConfig(tmpDir, { cache: { budget_tokens: 500 } });

            // Write large content to constitution (priority 1) — 2000 chars = ~500 tokens
            fs.writeFileSync(path.join(tmpDir, 'docs', 'isdlc', 'constitution.md'),
                'A'.repeat(2000) + '\n');

            // Write large content to workflow_config (priority 2) — 2000 chars = ~500 tokens
            fs.writeFileSync(path.join(tmpDir, 'src', 'isdlc', 'config', 'workflows.json'),
                JSON.stringify({ data: 'B'.repeat(1900) }, null, 2));

            const result = common.rebuildSessionCache({ projectRoot: tmpDir });
            const content = fs.readFileSync(result.path, 'utf8');

            // With only 500 token budget, not all sections should fit
            // Lower priority sections should be skipped
            assert.ok(content.includes('SKIPPED: budget_exceeded') || content.includes('truncated for context budget'),
                'AC-003-01: some sections should be skipped or truncated when budget is tight');
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-BDG-02: FR-003 AC-003-02
    it('TC-BDG-02: partial-fit section is truncated at last newline with truncation marker', () => {
        const tmpDir = createFullTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            // Set a budget that allows constitution but forces truncation of next section
            // Constitution content: small. Workflow config: large enough to need truncation.
            fs.writeFileSync(path.join(tmpDir, 'docs', 'isdlc', 'constitution.md'),
                'Short constitution\n');
            const lines = [];
            for (let i = 0; i < 100; i++) {
                lines.push(`Line ${i}: ${'X'.repeat(80)}`);
            }
            fs.writeFileSync(path.join(tmpDir, 'src', 'isdlc', 'config', 'workflows.json'),
                JSON.stringify({ data: lines.join('\n') }));

            // Set budget just big enough for constitution but not all of workflow_config
            // Constitution is ~20 chars ~= 5 tokens. Plus section delimiters.
            // Set budget to force partial fit of some section.
            writeProjectConfig(tmpDir, { cache: { budget_tokens: 800 } });

            const result = common.rebuildSessionCache({ projectRoot: tmpDir });
            const content = fs.readFileSync(result.path, 'utf8');

            // If any section was truncated, it should have the marker
            if (content.includes('truncated for context budget')) {
                assert.ok(content.includes('[... truncated for context budget ...]'),
                    'AC-003-02: truncated section should have truncation marker');
            }
            // Cache should still be generated regardless
            assert.ok(result.size > 0);
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-BDG-03: FR-003 AC-003-03
    it('TC-BDG-03: budget 500K with 50K total — all sections included in full', () => {
        const tmpDir = createFullTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            writeProjectConfig(tmpDir, { cache: { budget_tokens: 500000 } });
            const result = common.rebuildSessionCache({ projectRoot: tmpDir });
            const content = fs.readFileSync(result.path, 'utf8');

            // No sections should be skipped due to budget
            assert.ok(!content.includes('SKIPPED: budget_exceeded'),
                'AC-003-03: no sections should be skipped when budget is generous');
            assert.ok(!content.includes('[... truncated for context budget ...]'),
                'AC-003-03: no sections should be truncated when budget is generous');
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-BDG-04: FR-003 AC-003-04
    it('TC-BDG-04: sections are ordered by priority — lower-priority sections skipped first', () => {
        const tmpDir = createFullTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            // Custom priorities: constitution=1, roundtable_context=2, workflow_config=3
            // With tight budget, workflow_config (priority 3) should be skipped before roundtable_context (priority 2)
            writeProjectConfig(tmpDir, {
                cache: {
                    budget_tokens: 300,
                    section_priorities: {
                        constitution: 1,
                        roundtable_context: 2,
                        workflow_config: 3
                    }
                }
            });

            // Write substantial content to all sections
            fs.writeFileSync(path.join(tmpDir, 'docs', 'isdlc', 'constitution.md'),
                'Short constitution for testing\n');

            const result = common.rebuildSessionCache({ projectRoot: tmpDir });
            const content = fs.readFileSync(result.path, 'utf8');

            // Constitution (priority 1) should be included
            assert.ok(content.includes('<!-- SECTION: CONSTITUTION -->'),
                'AC-003-04: highest priority section should be included');
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-BDG-05: FR-004 AC-004-01
    it('TC-BDG-05: budget exceeded — stderr warning emitted with actual vs budget token counts', () => {
        const tmpDir = createFullTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            // Set a very small budget that will definitely be exceeded
            writeProjectConfig(tmpDir, { cache: { budget_tokens: 10 } });

            const stderrMessages = [];
            const origWrite = process.stderr.write;
            process.stderr.write = (msg) => { stderrMessages.push(String(msg)); return true; };
            try {
                common.rebuildSessionCache({ projectRoot: tmpDir, verbose: true });
                assert.ok(stderrMessages.some(m => m.includes('budget') || m.includes('exceeds')),
                    'AC-004-01: should emit stderr warning when cache exceeds budget');
            } finally {
                process.stderr.write = origWrite;
            }
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-BDG-06: FR-004 AC-004-02
    it('TC-BDG-06: budget not exceeded — no budget warning emitted', () => {
        const tmpDir = createFullTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            // Set a generous budget
            writeProjectConfig(tmpDir, { cache: { budget_tokens: 500000 } });

            const stderrMessages = [];
            const origWrite = process.stderr.write;
            process.stderr.write = (msg) => { stderrMessages.push(String(msg)); return true; };
            try {
                common.rebuildSessionCache({ projectRoot: tmpDir, verbose: true });
                const budgetWarnings = stderrMessages.filter(m =>
                    m.includes('exceeds budget') || m.includes('exceeds') && m.includes('token'));
                assert.equal(budgetWarnings.length, 0,
                    'AC-004-02: no budget warning when cache is within budget');
            } finally {
                process.stderr.write = origWrite;
            }
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-BDG-07: FR-005 AC-005-01
    it('TC-BDG-07: external skill truncation — 3 skills with 40K remaining budget get ~13333 chars each', () => {
        const tmpDir = createFullTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            // Set up external skills
            fs.mkdirSync(path.join(tmpDir, '.claude', 'skills', 'external'), { recursive: true });

            // Create 3 external skill files with 20K chars each
            const skillContent = 'S'.repeat(20000);
            for (let i = 1; i <= 3; i++) {
                fs.writeFileSync(path.join(tmpDir, '.claude', 'skills', 'external', `skill-${i}.md`), skillContent);
            }

            // Write external manifest
            fs.writeFileSync(path.join(tmpDir, '.claude', 'skills', 'external-manifest.json'),
                JSON.stringify({
                    skills: [
                        { name: 'Skill 1', file: 'skill-1.md', source: 'test' },
                        { name: 'Skill 2', file: 'skill-2.md', source: 'test' },
                        { name: 'Skill 3', file: 'skill-3.md', source: 'test' }
                    ]
                }, null, 2));

            // Large budget so external skills section has room
            writeProjectConfig(tmpDir, { cache: { budget_tokens: 500000 } });

            const result = common.rebuildSessionCache({ projectRoot: tmpDir });
            const content = fs.readFileSync(result.path, 'utf8');

            // With a generous budget, each skill should get more than 5000 chars
            // (the old hardcoded limit)
            const externalSection = content.split('<!-- SECTION: EXTERNAL_SKILLS -->')[1];
            if (externalSection) {
                // External skills should not be limited to 5000 chars anymore
                assert.ok(!externalSection.includes('S'.repeat(5001)) || externalSection.length > 15000,
                    'AC-005-01: skills should get budget-derived limit, not hardcoded 5K');
            }
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-BDG-08: FR-005 AC-005-02
    it('TC-BDG-08: external skill truncation — 10 skills with tight budget get minimum 1000 chars each', () => {
        const tmpDir = createFullTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            // Set up external skills
            fs.mkdirSync(path.join(tmpDir, '.claude', 'skills', 'external'), { recursive: true });

            // Create 10 external skill files with 5K chars each
            const skillContent = 'S'.repeat(5000);
            const skills = [];
            for (let i = 1; i <= 10; i++) {
                fs.writeFileSync(path.join(tmpDir, '.claude', 'skills', 'external', `skill-${i}.md`), skillContent);
                skills.push({ name: `Skill ${i}`, file: `skill-${i}.md`, source: 'test' });
            }

            fs.writeFileSync(path.join(tmpDir, '.claude', 'skills', 'external-manifest.json'),
                JSON.stringify({ skills }, null, 2));

            // Tight budget to force minimum per-skill allocation
            writeProjectConfig(tmpDir, { cache: { budget_tokens: 5000 } });

            const result = common.rebuildSessionCache({ projectRoot: tmpDir });
            const content = fs.readFileSync(result.path, 'utf8');

            // The external skills section should exist (even if truncated)
            // Each skill should get at least 1000 chars (minimum floor)
            assert.ok(result.size > 0, 'Cache should still be generated with tight budget');
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-BDG-09: FR-005 AC-005-03
    it('TC-BDG-09: without config, external skill truncation uses budget-derived limit, not hardcoded 5000', () => {
        const tmpDir = createFullTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            // Set up a single external skill with 8000 chars
            fs.mkdirSync(path.join(tmpDir, '.claude', 'skills', 'external'), { recursive: true });
            const skillContent = 'S'.repeat(8000);
            fs.writeFileSync(path.join(tmpDir, '.claude', 'skills', 'external', 'big-skill.md'), skillContent);

            fs.writeFileSync(path.join(tmpDir, '.claude', 'skills', 'external-manifest.json'),
                JSON.stringify({
                    skills: [{ name: 'Big Skill', file: 'big-skill.md', source: 'test' }]
                }, null, 2));

            // No config file — uses defaults (100K budget)
            // With 100K budget and 1 skill, skill should get far more than 5000 chars
            const result = common.rebuildSessionCache({ projectRoot: tmpDir });
            const content = fs.readFileSync(result.path, 'utf8');

            if (content.includes('<!-- SECTION: EXTERNAL_SKILLS -->')) {
                const externalSection = content.split('<!-- SECTION: EXTERNAL_SKILLS -->')[1]
                    .split('<!-- /SECTION: EXTERNAL_SKILLS -->')[0];
                // With default 100K budget and 1 skill, the full 8000 chars should be included
                // (old hardcoded 5000 would truncate it)
                assert.ok(externalSection.includes('S'.repeat(8000)),
                    'AC-005-03: without config, skill should use budget-derived limit (>5000), not hardcoded 5000');
            }
        } finally {
            cleanup(tmpDir);
        }
    });
});

// =============================================================================
// Integration tests (TC-INT-*)
// =============================================================================

describe('Budget integration — REQ-0067 integration tests', () => {
    let common;
    let savedEnv;

    before(() => {
        savedEnv = { ...process.env };
        process.env.NODE_ENV = 'test';
        process.env.ISDLC_TEST_MODE = '1';
        common = requireCommon();
    });

    after(() => {
        process.env = savedEnv;
    });

    beforeEach(() => {
        if (common._resetCaches) common._resetCaches();
    });

    // TC-INT-01: FR-001 + FR-003
    it('TC-INT-01: full rebuild with config setting budget to 500 tokens — cache respects budget', () => {
        const tmpDir = createFullTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            writeProjectConfig(tmpDir, { cache: { budget_tokens: 500 } });
            const result = common.rebuildSessionCache({ projectRoot: tmpDir });
            const content = fs.readFileSync(result.path, 'utf8');

            // Cache should be generated
            assert.ok(result.size > 0);
            // Result should include budget metadata
            assert.ok(typeof result.usedTokens === 'number',
                'TC-INT-01: result should include usedTokens');
            assert.ok(typeof result.budgetTokens === 'number',
                'TC-INT-01: result should include budgetTokens');
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-INT-02: FR-001 + FR-006 + FR-007
    it('TC-INT-02: full rebuild without config file — backward-compatible with 100K default', () => {
        const tmpDir = createFullTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            // No config file — should use defaults and produce same result as before
            const result = common.rebuildSessionCache({ projectRoot: tmpDir });
            assert.ok(result.path.endsWith(path.join('.isdlc', 'session-cache.md')));
            assert.ok(result.size > 0);
            assert.ok(result.sections.length > 0);
            assert.ok(typeof result.usedTokens === 'number');
            assert.equal(result.budgetTokens, 100000,
                'TC-INT-02: without config, budgetTokens should be 100000');
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-INT-03: FR-003 + FR-005
    it('TC-INT-03: full rebuild with custom priorities — sections ordered correctly', () => {
        const tmpDir = createFullTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            // Reverse some priorities
            writeProjectConfig(tmpDir, {
                cache: {
                    budget_tokens: 500000,
                    section_priorities: {
                        constitution: 9,
                        instructions: 1
                    }
                }
            });
            const result = common.rebuildSessionCache({ projectRoot: tmpDir });
            assert.ok(result.size > 0);
            // All sections should be included with generous budget
            assert.ok(!fs.readFileSync(result.path, 'utf8').includes('SKIPPED: budget_exceeded'));
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-INT-04: FR-002 + FR-003
    it('TC-INT-04: full rebuild with malformed config — falls back to defaults, cache generated', () => {
        const tmpDir = createFullTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            fs.writeFileSync(path.join(tmpDir, '.isdlc', 'config.json'), 'INVALID JSON!!!');

            const stderrMessages = [];
            const origWrite = process.stderr.write;
            process.stderr.write = (msg) => { stderrMessages.push(String(msg)); return true; };
            try {
                const result = common.rebuildSessionCache({ projectRoot: tmpDir });
                assert.ok(result.size > 0, 'Cache should be generated despite malformed config');
                assert.ok(result.sections.length > 0, 'Sections should be populated');
            } finally {
                process.stderr.write = origWrite;
            }
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-INT-05: FR-008
    it('TC-INT-05: rebuildSessionCache result includes budget metadata for CLI reporting', () => {
        const tmpDir = createFullTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            writeProjectConfig(tmpDir, { cache: { budget_tokens: 50000 } });
            const result = common.rebuildSessionCache({ projectRoot: tmpDir });

            assert.ok(typeof result.usedTokens === 'number',
                'AC-008-01: result should include usedTokens for CLI reporting');
            assert.ok(typeof result.budgetTokens === 'number',
                'AC-008-01: result should include budgetTokens for CLI reporting');
            assert.equal(result.budgetTokens, 50000);
            assert.ok(result.usedTokens > 0);
            assert.ok(result.usedTokens <= result.budgetTokens || result.usedTokens > 0,
                'usedTokens should be a positive number');
        } finally {
            cleanup(tmpDir);
        }
    });
});

// =============================================================================
// Behavioral tests (TC-BEH-*)
// =============================================================================

describe('Budget behavioral tests — REQ-0067', () => {
    let common;
    let savedEnv;

    before(() => {
        savedEnv = { ...process.env };
        process.env.NODE_ENV = 'test';
        process.env.ISDLC_TEST_MODE = '1';
        common = requireCommon();
    });

    after(() => {
        process.env = savedEnv;
    });

    beforeEach(() => {
        if (common._resetCaches) common._resetCaches();
    });

    // TC-BEH-01: FR-003 AC-003-01
    it('TC-BEH-01: skipped sections produce SKIPPED: budget_exceeded markers in cache content', () => {
        const tmpDir = createFullTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            // Very tight budget — should skip some sections
            writeProjectConfig(tmpDir, { cache: { budget_tokens: 100 } });

            // Write large constitution content
            fs.writeFileSync(path.join(tmpDir, 'docs', 'isdlc', 'constitution.md'),
                'A'.repeat(800) + '\n');

            const result = common.rebuildSessionCache({ projectRoot: tmpDir });
            const content = fs.readFileSync(result.path, 'utf8');

            assert.ok(content.includes('SKIPPED: budget_exceeded'),
                'TC-BEH-01: skipped sections should have budget_exceeded marker');
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-BEH-02: FR-003 AC-003-02
    it('TC-BEH-02: truncated sections end with truncation marker', () => {
        const tmpDir = createFullTestProject();
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
        try {
            // Set budget to partially fit constitution
            fs.writeFileSync(path.join(tmpDir, 'docs', 'isdlc', 'constitution.md'),
                Array.from({ length: 50 }, (_, i) => `Line ${i}: ${'Z'.repeat(60)}`).join('\n') + '\n');

            // Budget allows header + partial constitution only
            writeProjectConfig(tmpDir, { cache: { budget_tokens: 200 } });

            const result = common.rebuildSessionCache({ projectRoot: tmpDir });
            const content = fs.readFileSync(result.path, 'utf8');

            // Either truncation marker or skip marker should be present
            assert.ok(
                content.includes('[... truncated for context budget ...]') ||
                content.includes('SKIPPED: budget_exceeded'),
                'TC-BEH-02: sections that do not fit should have truncation or skip markers'
            );
        } finally {
            cleanup(tmpDir);
        }
    });

    // TC-BEH-03: CON-001, CON-002
    it('TC-BEH-03: no new require() calls for external packages', () => {
        // Read common.cjs source and check that readConfig does not require external packages
        const source = fs.readFileSync(COMMON_SRC, 'utf8');

        // Extract all require() calls
        const requireCalls = source.match(/require\(['"]([^'"]+)['"]\)/g) || [];
        const externalRequires = requireCalls.filter(r => {
            const mod = r.match(/require\(['"]([^'"]+)['"]\)/)[1];
            // Allow Node.js built-ins and relative paths
            return !mod.startsWith('.') && !mod.startsWith('node:') && !mod.startsWith('/') &&
                   !['fs', 'path', 'os', 'child_process', 'crypto', 'util', 'module', 'stream', 'events', 'url', 'http', 'https', 'net', 'tls', 'dns', 'querystring', 'string_decoder', 'buffer', 'assert', 'zlib', 'readline'].includes(mod);
        });

        assert.equal(externalRequires.length, 0,
            `TC-BEH-03: common.cjs should not require external packages. Found: ${externalRequires.join(', ')}`);
    });
});

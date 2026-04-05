/**
 * Tests for output-format-validator.cjs hook
 * Traces to: FR-06, AC-06a-g, NFR-01
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'output-format-validator.cjs');

function setupTestEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'output-fmt-test-'));
    const isdlcDir = path.join(tmpDir, '.isdlc');
    fs.mkdirSync(isdlcDir, { recursive: true });
    return tmpDir;
}

function runHook(tmpDir, stdinJson) {
    const stdinStr = typeof stdinJson === 'string' ? stdinJson : JSON.stringify(stdinJson);
    const result = spawnSync('node', [HOOK_PATH], {
        cwd: tmpDir,
        input: stdinStr,
        env: {
            ...process.env,
            CLAUDE_PROJECT_DIR: tmpDir,
            SKILL_VALIDATOR_DEBUG: '0',
            PATH: process.env.PATH
        },
        encoding: 'utf8',
        timeout: 5000
    });
    return {
        stdout: (result.stdout || '').trim(),
        stderr: (result.stderr || '').trim(),
        exitCode: result.status || 0
    };
}

function writeArtifact(filePath, content) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
}

function writeTemplates(baseDir) {
    const templatesDir = path.join(baseDir, '.isdlc', 'config', 'templates');
    fs.mkdirSync(templatesDir, { recursive: true });
    fs.writeFileSync(path.join(templatesDir, 'traceability.template.json'), JSON.stringify({
        domain: 'traceability',
        format: {
            columns: [
                { key: 'fr_id', header: 'FR' },
                { key: 'requirement', header: 'Requirement' },
                { key: 'design_blast_radius', header: 'Design / Blast Radius' },
                { key: 'related_tasks', header: 'Related Tasks' }
            ],
            post_table_sections: ['assumptions_and_inferences']
        }
    }, null, 2));
    fs.writeFileSync(path.join(templatesDir, 'requirements.template.json'), JSON.stringify({
        domain: 'requirements',
        format: {
            section_order: [
                'functional_requirements',
                'assumptions_and_inferences',
                'non_functional_requirements',
                'out_of_scope',
                'prioritization'
            ],
            required_sections: [
                'functional_requirements',
                'assumptions_and_inferences',
                'prioritization'
            ]
        }
    }, null, 2));
    fs.writeFileSync(path.join(templatesDir, 'tasks.template.json'), JSON.stringify({
        domain: 'tasks',
        format: {
            required_phases: ['05', '06', '16', '08'],
            required_task_categories: {
                '05': ['test_case_design'],
                '06': ['setup', 'core_implementation', 'unit_tests', 'wiring_claude', 'wiring_codex', 'cleanup'],
                '16': ['test_execution', 'parity_verification'],
                '08': ['constitutional_review', 'dual_file_check']
            },
            required_sections: [
                'progress_summary',
                'dependency_graph',
                'traceability_matrix',
                'assumptions_and_inferences'
            ]
        }
    }, null, 2));
}

function makeToolInput(filePath, toolName = 'Write') {
    return {
        tool_name: toolName,
        tool_input: { file_path: filePath }
    };
}

describe('output-format-validator hook', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = setupTestEnv();
        writeTemplates(tmpDir);
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('AC-06a: validates user-stories.json has required fields', () => {
        const filePath = path.join(tmpDir, 'docs', 'requirements', 'user-stories.json');
        writeArtifact(filePath, JSON.stringify({
            stories: [{ id: 'US-01', title: 'Test', acceptance_criteria: ['AC-01'] }]
        }));
        const result = runHook(tmpDir, makeToolInput(filePath));
        assert.equal(result.stderr, '');
    });

    it('AC-06a: warns on invalid user-stories.json (missing stories)', () => {
        const filePath = path.join(tmpDir, 'docs', 'requirements', 'user-stories.json');
        writeArtifact(filePath, JSON.stringify({ version: '1.0' }));
        const result = runHook(tmpDir, makeToolInput(filePath));
        assert.ok(result.stderr.includes('ARTIFACT FORMAT WARNING'));
        assert.ok(result.stderr.includes('stories'));
    });

    it('AC-06b: validates traceability-matrix.csv against the template-backed table shape', () => {
        const filePath = path.join(tmpDir, 'docs', 'requirements', 'REQ-GH-234', 'traceability-matrix.csv');
        writeArtifact(filePath, [
            '| FR | Requirement | Design / Blast Radius | Related Tasks |',
            '|----|-------------|----------------------|---------------|',
            '| FR-001 | Narrative',
            'AC-001-01: detail | Design narrative',
            'src/example.js (MODIFY) | T001 update validator |',
            '## Assumptions and Inferences',
            '- Assumption'
        ].join('\n'));
        const result = runHook(tmpDir, makeToolInput(filePath));
        assert.equal(result.stderr, '');
    });

    it('AC-06b: warns on traceability-matrix.csv with wrong template columns', () => {
        const filePath = path.join(tmpDir, 'docs', 'requirements', 'REQ-GH-234', 'traceability-matrix.csv');
        writeArtifact(filePath, [
            '| ID | Requirement | Tests | Status |',
            '|----|-------------|-------|--------|',
            '| FR-001 | Narrative | T001 | pending |',
            '## Assumptions and Inferences',
            '- Assumption'
        ].join('\n'));
        const result = runHook(tmpDir, makeToolInput(filePath));
        assert.ok(result.stderr.includes('TEMPLATE DRIFT DETECTED'));
        assert.ok(result.stderr.includes('EXACTLY these columns'));
    });

    it('GH-234: warns when traceability artifact omits assumptions and inferences section', () => {
        const filePath = path.join(tmpDir, 'docs', 'requirements', 'REQ-GH-234', 'traceability-matrix.csv');
        writeArtifact(filePath, [
            '| FR | Requirement | Design / Blast Radius | Related Tasks |',
            '|----|-------------|----------------------|---------------|',
            '| FR-001 | Narrative | Design narrative | T001 implement |'
        ].join('\n'));
        const result = runHook(tmpDir, makeToolInput(filePath));
        assert.ok(result.stderr.includes('TEMPLATE DRIFT DETECTED'));
        assert.ok(result.stderr.includes('assumptions and inferences'));
    });

    it('AC-06c: validates ADR with required sections', () => {
        const filePath = path.join(tmpDir, 'docs', 'adr-001-tech-stack.md');
        writeArtifact(filePath, '# ADR-001\n## Status\nAccepted\n## Context\nWe need X\n## Decision\nUse Y\n## Consequences\nFaster dev');
        const result = runHook(tmpDir, makeToolInput(filePath));
        assert.equal(result.stderr, '');
    });

    it('AC-06c: warns on ADR missing sections', () => {
        const filePath = path.join(tmpDir, 'docs', 'adr-001-tech-stack.md');
        writeArtifact(filePath, '# ADR-001\n## Status\nAccepted\nSome text');
        const result = runHook(tmpDir, makeToolInput(filePath));
        assert.ok(result.stderr.includes('ARTIFACT FORMAT WARNING'));
    });

    it('AC-06d: validates test-strategy.md sections', () => {
        const filePath = path.join(tmpDir, 'docs', 'test-strategy.md');
        writeArtifact(filePath, '# Test Strategy\n## Scope\nAll hooks\n## Approach\nTDD\n## Entry Criteria\nCode complete\n## Exit Criteria\nAll pass');
        const result = runHook(tmpDir, makeToolInput(filePath));
        assert.equal(result.stderr, '');
    });

    it('AC-06e: silent for unrecognized file types', () => {
        const filePath = path.join(tmpDir, 'src', 'app.js');
        writeArtifact(filePath, 'console.log("hello")');
        const result = runHook(tmpDir, makeToolInput(filePath));
        assert.equal(result.stderr, '');
    });

    it('AC-06f: fails open on read errors', () => {
        const filePath = '/nonexistent/path/user-stories.json';
        const result = runHook(tmpDir, makeToolInput(filePath));
        assert.equal(result.exitCode, 0);
        assert.equal(result.stderr, '');
    });

    it('AC-06g: reports specific missing fields', () => {
        const filePath = path.join(tmpDir, 'docs', 'user-stories.json');
        writeArtifact(filePath, JSON.stringify({ stories: [{ id: 'US-01' }] }));
        const result = runHook(tmpDir, makeToolInput(filePath));
        assert.ok(result.stderr.includes('title'));
        assert.ok(result.stderr.includes('acceptance_criteria'));
    });

    it('handles empty stdin', () => {
        const result = runHook(tmpDir, '');
        assert.equal(result.exitCode, 0);
    });

    it('handles invalid JSON in user-stories.json', () => {
        const filePath = path.join(tmpDir, 'docs', 'user-stories.json');
        writeArtifact(filePath, 'not json {{{');
        const result = runHook(tmpDir, makeToolInput(filePath));
        assert.ok(result.stderr.includes('ARTIFACT FORMAT WARNING'));
        assert.ok(result.stderr.includes('valid JSON'));
    });

    it('GH-234: warns on unexpected template section in requirements artifact', () => {
        const filePath = path.join(tmpDir, 'docs', 'requirements', 'REQ-GH-234', 'requirements-spec.md');
        writeArtifact(filePath, [
            '# Requirements Spec',
            '## Functional Requirements',
            'content',
            '## Assumptions and Inferences',
            'content',
            '## Non-Functional Requirements',
            'content',
            '## ADRs',
            'content',
            '## Out of Scope',
            'content',
            '## Prioritization',
            'content'
        ].join('\n'));
        const result = runHook(tmpDir, makeToolInput(filePath));
        assert.ok(result.stderr.includes('TEMPLATE DRIFT DETECTED'));
        assert.ok(result.stderr.includes('Unexpected sections'));
    });

    it('GH-234: validates template-backed artifacts on Edit too', () => {
        const filePath = path.join(tmpDir, 'docs', 'requirements', 'REQ-GH-234', 'requirements-spec.md');
        writeArtifact(filePath, [
            '# Requirements Spec',
            '## Functional Requirements',
            'content',
            '## Assumptions and Inferences',
            'content',
            '## Surprise Section',
            'content',
            '## Prioritization',
            'content'
        ].join('\n'));
        const result = runHook(tmpDir, makeToolInput(filePath, 'Edit'));
        assert.ok(result.stderr.includes('TEMPLATE DRIFT DETECTED'));
        assert.ok(result.stderr.includes('Unexpected sections'));
    });

    it('GH-234: warns when tasks artifact lacks required category headings', () => {
        const filePath = path.join(tmpDir, 'docs', 'requirements', 'REQ-GH-234', 'tasks.md');
        writeArtifact(filePath, [
            '# Task Plan: REQ-GH-234 strict-template-enforcement',
            '## Progress Summary',
            'summary',
            '## Phase 05: Test Strategy -- PENDING',
            '- [ ] T001 Design tests | traces: FR-001',
            '## Phase 06: Implementation -- PENDING',
            '- [ ] T002 Implement validator | traces: FR-001',
            '## Phase 16: Quality Loop -- PENDING',
            '- [ ] T003 Run tests | traces: FR-001',
            '## Phase 08: Code Review -- PENDING',
            '- [ ] T004 Review changes | traces: FR-001',
            '## Dependency Graph',
            'graph',
            '## Traceability Matrix',
            'matrix',
            '## Assumptions and Inferences',
            'assumptions'
        ].join('\n'));
        const result = runHook(tmpDir, makeToolInput(filePath));
        assert.ok(result.stderr.includes('TEMPLATE DRIFT DETECTED'));
        assert.ok(result.stderr.includes('category'));
    });
});

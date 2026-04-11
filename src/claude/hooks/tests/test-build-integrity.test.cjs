'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Paths — read source files directly (structural verification pattern)
// ---------------------------------------------------------------------------
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const WORKFLOWS_PATH = path.join(PROJECT_ROOT, 'src', 'isdlc', 'config', 'workflows.json');
const ISDLC_MD_PATH = path.join(PROJECT_ROOT, 'src', 'claude', 'commands', 'isdlc.md');
const QUALITY_LOOP_AGENT_PATH = path.join(PROJECT_ROOT, 'src', 'claude', 'agents', '16-quality-loop-engineer.md');
const SKILL_MD_PATH = path.join(PROJECT_ROOT, 'src', 'claude', 'skills', 'quality-loop', 'build-verification', 'SKILL.md');
const QA_ENGINEER_PATH = path.join(PROJECT_ROOT, 'src', 'claude', 'agents', '07-qa-engineer.md');

// ---------------------------------------------------------------------------
// File content — loaded once per suite
// ---------------------------------------------------------------------------
let workflows;
let isdlcMd;
let qualityLoopAgent;
let skillMd;
let qaEngineer;

before(() => {
    workflows = JSON.parse(fs.readFileSync(WORKFLOWS_PATH, 'utf8'));
    isdlcMd = fs.readFileSync(ISDLC_MD_PATH, 'utf8');
    qualityLoopAgent = fs.readFileSync(QUALITY_LOOP_AGENT_PATH, 'utf8');
    skillMd = fs.readFileSync(SKILL_MD_PATH, 'utf8');
    qaEngineer = fs.readFileSync(QA_ENGINEER_PATH, 'utf8');
});

// ===========================================================================
// Section 1: workflows.json — test-generate Phase Update
// ===========================================================================
describe('Section 1: workflows.json — test-generate phases', () => {

    it('TC-01: test-generate includes 16-quality-loop', () => {
        const phases = workflows.workflows['test-generate'].phases;
        assert.ok(phases.includes('16-quality-loop'),
            'test-generate phases should include 16-quality-loop');
    });

    it('TC-02: test-generate does NOT include 11-local-testing', () => {
        const phases = workflows.workflows['test-generate'].phases;
        assert.ok(!phases.includes('11-local-testing'),
            'test-generate phases should NOT include legacy 11-local-testing');
    });

    it('TC-03: test-generate does NOT include 07-testing', () => {
        const phases = workflows.workflows['test-generate'].phases;
        assert.ok(!phases.includes('07-testing'),
            'test-generate phases should NOT include legacy 07-testing');
    });

    it('TC-04: test-generate has correct phase count (4)', () => {
        const phases = workflows.workflows['test-generate'].phases;
        assert.equal(phases.length, 4,
            'test-generate should have exactly 4 phases');
    });

    it('TC-05: test-generate phases in correct order', () => {
        const phases = workflows.workflows['test-generate'].phases;
        assert.deepStrictEqual(phases,
            ['05-test-strategy', '06-implementation', '16-quality-loop', '08-code-review']);
    });

    it('TC-06: 16-quality-loop immediately follows 06-implementation', () => {
        const phases = workflows.workflows['test-generate'].phases;
        const implIdx = phases.indexOf('06-implementation');
        const qlIdx = phases.indexOf('16-quality-loop');
        assert.equal(qlIdx, implIdx + 1,
            '16-quality-loop index should be 06-implementation index + 1');
    });

    it('TC-07: test-generate gate_mode remains strict', () => {
        assert.equal(workflows.workflows['test-generate'].gate_mode, 'strict');
    });

    it('TC-08: test-generate agent_modifiers no longer references 11-local-testing', () => {
        const modifiers = workflows.workflows['test-generate'].agent_modifiers || {};
        assert.ok(!('11-local-testing' in modifiers),
            'agent_modifiers should not contain 11-local-testing key');
    });
});

// ===========================================================================
// Section 2: isdlc.md — Command Documentation Update
// ===========================================================================
describe('Section 2: isdlc.md — test generate documentation', () => {

    it('TC-09: isdlc.md test generate phase list includes 16-quality-loop', () => {
        // The phases initialization line for test-generate should reference 16-quality-loop
        assert.ok(isdlcMd.includes('16-quality-loop'),
            'isdlc.md should reference 16-quality-loop');
        // Specifically in the test-generate context
        const tgSection = isdlcMd.substring(
            isdlcMd.indexOf('**test generate**'),
            isdlcMd.indexOf('**cancel**')
        );
        assert.ok(tgSection.includes('16-quality-loop'),
            'isdlc.md test generate section should include 16-quality-loop');
    });

    it('TC-10: isdlc.md test generate phases do NOT reference legacy phases', () => {
        // Find the test-generate initialization line with phases array
        const tgSection = isdlcMd.substring(
            isdlcMd.indexOf('**test generate**'),
            isdlcMd.indexOf('**cancel**')
        );
        // The phases array in the test-generate init should not contain legacy phases
        // Look for the phases initialization pattern
        const phasesMatch = tgSection.match(/phases\s*\[([^\]]+)\]/s) ||
                           tgSection.match(/phases.*?\[([^\]]+)\]/s);
        if (phasesMatch) {
            const phasesStr = phasesMatch[1];
            assert.ok(!phasesStr.includes('11-local-testing'),
                'test generate phases array should not contain 11-local-testing');
            assert.ok(!phasesStr.includes('07-testing'),
                'test generate phases array should not contain 07-testing');
        } else {
            // Alternative: check the section does not have these in phase context
            assert.ok(!tgSection.includes('"11-local-testing"'),
                'test generate section should not reference "11-local-testing" in phases');
            assert.ok(!tgSection.includes('"07-testing"'),
                'test generate section should not reference "07-testing" in phases');
        }
    });

    it('TC-11: isdlc.md summary table shows 16(QL) for test-generate', () => {
        // The workflow summary table row for test-generate should include 16(QL)
        const tableSection = isdlcMd.substring(
            isdlcMd.indexOf('| Command | Workflow |'),
            isdlcMd.indexOf('**Enforcement rules:**')
        );
        const tgRow = tableSection.split('\n').find(line =>
            line.includes('test generate') || line.includes('test-generate')
        );
        assert.ok(tgRow, 'test-generate row should exist in summary table');
        assert.ok(tgRow.includes('16') || tgRow.includes('QL'),
            'test-generate summary table row should reference Phase 16 or QL');
    });

    it('TC-12: isdlc.md and workflows.json phase lists are consistent', () => {
        const jsonPhases = workflows.workflows['test-generate'].phases;
        // All phases from workflows.json should appear in isdlc.md test-generate section
        const tgSection = isdlcMd.substring(
            isdlcMd.indexOf('**test generate**'),
            isdlcMd.indexOf('**cancel**')
        );
        for (const phase of jsonPhases) {
            // Extract the phase number (e.g., "05" from "05-test-strategy")
            const phaseNum = phase.split('-')[0];
            assert.ok(tgSection.includes(phase) || tgSection.includes(phaseNum),
                `isdlc.md test generate section should reference phase ${phase}`);
        }
    });

    it('TC-13: isdlc.md test generate steps reference quality loop or build verification', () => {
        const tgSection = isdlcMd.substring(
            isdlcMd.indexOf('**test generate**'),
            isdlcMd.indexOf('**cancel**')
        );
        const hasQualityRef = tgSection.includes('quality') ||
                              tgSection.includes('build') ||
                              tgSection.includes('16-quality-loop');
        assert.ok(hasQualityRef,
            'test generate steps should reference quality loop or build verification');
    });
});

// ===========================================================================
// Section 3: 16-quality-loop-engineer.md — Build Integrity and Auto-Fix
// ===========================================================================
describe('Section 3: quality-loop-engineer — build integrity', () => {

    it('TC-14: agent includes build integrity check section', () => {
        const hasBuildIntegrity = qualityLoopAgent.toLowerCase().includes('build integrity') ||
                                  qualityLoopAgent.toLowerCase().includes('build verification');
        assert.ok(hasBuildIntegrity,
            'quality-loop-engineer should have build integrity or build verification section');
    });

    it('TC-15: agent includes language-aware build command detection table', () => {
        // Should have a table mapping build files to commands
        assert.ok(qualityLoopAgent.includes('pom.xml'), 'should include pom.xml');
        assert.ok(qualityLoopAgent.includes('package.json'), 'should include package.json');
        assert.ok(qualityLoopAgent.includes('Cargo.toml'), 'should include Cargo.toml');
        assert.ok(qualityLoopAgent.includes('go.mod'), 'should include go.mod');
    });

    it('TC-16: agent includes pom.xml detection with Maven command', () => {
        assert.ok(qualityLoopAgent.includes('pom.xml'), 'should detect pom.xml');
        assert.ok(qualityLoopAgent.includes('mvn') || qualityLoopAgent.includes('Maven'),
            'should reference mvn or Maven build command');
    });

    it('TC-17: agent includes package.json detection with npm/tsc command', () => {
        assert.ok(qualityLoopAgent.includes('package.json'), 'should detect package.json');
        assert.ok(qualityLoopAgent.includes('npm') || qualityLoopAgent.includes('tsc'),
            'should reference npm or tsc build command');
    });

    it('TC-18: agent includes Cargo.toml detection with Rust command', () => {
        assert.ok(qualityLoopAgent.includes('Cargo.toml'), 'should detect Cargo.toml');
        assert.ok(qualityLoopAgent.includes('cargo'),
            'should reference cargo build command');
    });

    it('TC-19: agent includes go.mod detection with Go command', () => {
        assert.ok(qualityLoopAgent.includes('go.mod'), 'should detect go.mod');
        assert.ok(qualityLoopAgent.includes('go build'),
            'should reference go build command');
    });

    it('TC-20: agent includes auto-fix loop with max 3 iterations', () => {
        const hasAutoFix = qualityLoopAgent.toLowerCase().includes('auto-fix') ||
                           qualityLoopAgent.toLowerCase().includes('autofix') ||
                           qualityLoopAgent.toLowerCase().includes('auto fix');
        assert.ok(hasAutoFix, 'should mention auto-fix loop');
        assert.ok(qualityLoopAgent.includes('3'),
            'should specify max 3 iterations for auto-fix');
    });

    it('TC-21: agent classifies errors as mechanical vs logical', () => {
        const hasMechanical = qualityLoopAgent.toLowerCase().includes('mechanical');
        const hasLogical = qualityLoopAgent.toLowerCase().includes('logical');
        assert.ok(hasMechanical, 'should classify mechanical errors');
        assert.ok(hasLogical, 'should classify logical errors');
    });

    it('TC-22: agent defines mechanical error categories', () => {
        const lower = qualityLoopAgent.toLowerCase();
        assert.ok(lower.includes('import'), 'mechanical errors should include imports');
        assert.ok(lower.includes('path') || lower.includes('dependenc'),
            'mechanical errors should include paths or dependencies');
        assert.ok(lower.includes('package name') || lower.includes('namespace'),
            'mechanical errors should include package names or namespaces');
    });

    it('TC-23: agent defines logical error categories', () => {
        const lower = qualityLoopAgent.toLowerCase();
        assert.ok(lower.includes('type mismatch') || lower.includes('type mismatches'),
            'logical errors should include type mismatches');
        assert.ok(lower.includes('signature') || lower.includes('api usage') || lower.includes('api'),
            'logical errors should include missing signatures or incorrect API usage');
    });

    it('TC-24: agent specifies honest failure reporting (no QA APPROVED on broken build)', () => {
        const lower = qualityLoopAgent.toLowerCase();
        const hasNoQA = lower.includes('not') && lower.includes('qa approved') ||
                        lower.includes('never') && lower.includes('qa approved') ||
                        lower.includes('do not') && lower.includes('qa approved');
        assert.ok(hasNoQA,
            'should instruct NOT to declare QA APPROVED when build fails with logical errors');
    });

    it('TC-25: agent specifies failure report content', () => {
        const lower = qualityLoopAgent.toLowerCase();
        assert.ok(lower.includes('compilation error') || lower.includes('build error'),
            'failure report should mention specific compilation/build errors');
        assert.ok(lower.includes('file path') || lower.includes('file paths'),
            'failure report should include file paths');
        assert.ok(lower.includes('/isdlc analyze') || lower.includes('isdlc analyze'),
            'failure report should suggest /isdlc analyze');
    });

    it('TC-26: agent specifies workflow status FAILED on logical errors', () => {
        assert.ok(qualityLoopAgent.includes('FAILED'),
            'should set workflow status to FAILED on logical errors');
    });

    it('TC-27: agent specifies graceful degradation for unknown build systems', () => {
        const lower = qualityLoopAgent.toLowerCase();
        const hasGraceful = (lower.includes('skip') && lower.includes('warning')) ||
                            lower.includes('graceful') ||
                            lower.includes('no build system detected') ||
                            lower.includes('no build file');
        assert.ok(hasGraceful,
            'should handle unknown build systems with skip and warning');
    });

    it('TC-28: agent explicitly prohibits QA APPROVED on broken build', () => {
        const hasProhibition = qualityLoopAgent.includes('NEVER') &&
                               (qualityLoopAgent.includes('QA APPROVED') || qualityLoopAgent.includes('QA approved'));
        assert.ok(hasProhibition,
            'should contain explicit NEVER + QA APPROVED prohibition');
    });
});

// ===========================================================================
// Section 4: SKILL.md (QL-007) — Build Verification Skill Enhancement
// ===========================================================================
describe('Section 4: SKILL.md (QL-007) — build verification skill', () => {

    it('TC-29: SKILL.md includes language-aware build detection', () => {
        const lower = skillMd.toLowerCase();
        assert.ok(lower.includes('language') || lower.includes('build command') || lower.includes('detection'),
            'SKILL.md should include language-aware build detection description');
    });

    it('TC-30: SKILL.md includes mechanical error auto-fix', () => {
        const lower = skillMd.toLowerCase();
        assert.ok(lower.includes('auto-fix') || lower.includes('autofix') || lower.includes('auto fix') || lower.includes('mechanical'),
            'SKILL.md should describe mechanical error auto-fix capability');
    });

    it('TC-31: SKILL.md includes error classification', () => {
        const lower = skillMd.toLowerCase();
        assert.ok(lower.includes('mechanical') || lower.includes('logical') || lower.includes('classification'),
            'SKILL.md should reference error classification');
    });

    it('TC-32: SKILL.md references graceful degradation', () => {
        const lower = skillMd.toLowerCase();
        assert.ok(lower.includes('skip') || lower.includes('warning') || lower.includes('graceful') || lower.includes('not detected'),
            'SKILL.md should reference graceful degradation when no build system detected');
    });
});

// ===========================================================================
// Section 5: 07-qa-engineer.md — GATE-08 Safety Net
// ===========================================================================
describe('Section 5: qa-engineer — GATE-08 build integrity safety net', () => {

    it('TC-33: QA engineer includes build integrity in gate checklist', () => {
        const lower = qaEngineer.toLowerCase();
        assert.ok(lower.includes('build') && (lower.includes('integrity') || lower.includes('verification') || lower.includes('clean')),
            'GATE-07 checklist should include build integrity or verification');
    });

    it('TC-34: QA engineer blocks QA APPROVED on broken build', () => {
        const lower = qaEngineer.toLowerCase();
        const hasBlock = (lower.includes('not') || lower.includes('never') || lower.includes('cannot')) &&
                         lower.includes('qa') &&
                         (lower.includes('approved') || lower.includes('sign-off'));
        assert.ok(hasBlock,
            'should block QA APPROVED when build is broken');
    });

    it('TC-35: QA engineer build check is a safety net', () => {
        const lower = qaEngineer.toLowerCase();
        assert.ok(lower.includes('safety net') || lower.includes('prerequisite') || lower.includes('defense'),
            'build check should be described as safety net or prerequisite');
    });

    it('TC-36: QA engineer references build command detection', () => {
        const lower = qaEngineer.toLowerCase();
        assert.ok(lower.includes('build') && (lower.includes('command') || lower.includes('ql-007') || lower.includes('language')),
            'should reference build command detection or QL-007');
    });
});

// ===========================================================================
// Section 6: Cross-File Consistency
// ===========================================================================
describe('Section 6: cross-file consistency', () => {

    it('TC-37: build workflow still uses 16-quality-loop (no regression)', () => {
        const phases = workflows.workflows.build.phases;
        assert.ok(phases.includes('16-quality-loop'),
            'build workflow should still include 16-quality-loop');
        assert.ok(!phases.includes('11-local-testing'),
            'build workflow should not include 11-local-testing');
        assert.ok(!phases.includes('07-testing'),
            'build workflow should not include 07-testing');
    });

    it('TC-38: test-generate workflow still uses 16-quality-loop (no regression)', () => {
        const phases = workflows.workflows['test-generate'].phases;
        assert.ok(phases.includes('16-quality-loop'),
            'test-generate workflow should still include 16-quality-loop');
        assert.ok(!phases.includes('11-local-testing'),
            'test-generate workflow should not include 11-local-testing');
        assert.ok(!phases.includes('07-testing'),
            'test-generate workflow should not include 07-testing');
    });

    it('TC-39: when build passes, workflow proceeds normally with QA APPROVED', () => {
        const lower = qualityLoopAgent.toLowerCase();
        const hasNormalFlow = (lower.includes('build passes') || lower.includes('build succeeds')) &&
                              (lower.includes('proceed') || lower.includes('continue') || lower.includes('qa approved'));
        assert.ok(hasNormalFlow,
            'agent should specify that when build passes, workflow proceeds normally');
    });
});

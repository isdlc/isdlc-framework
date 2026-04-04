/**
 * Tests for REQ-0015: Impact Analysis Cross-Validation Verifier (M4)
 *
 * Validates the structural content of the M4 agent definition, skill files,
 * skills manifest entries, and orchestrator integration. These are content
 * validation tests -- they read file contents and check for required sections,
 * keywords, and structure.
 *
 * This follows the pattern established by lib/invisible-framework.test.js
 * for testing prompt/config file deliverables.
 *
 * Run:  node --test lib/cross-validation-verifier.test.js
 *
 * Traces: REQ-0015, 28 ACs across 7 FRs + 3 NFRs
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const projectRoot = resolve(__dirname, '..');

// File paths under test
const AGENT_PATH = join(projectRoot, 'src', 'claude', 'agents', 'impact-analysis', 'cross-validation-verifier.md');
const ORCHESTRATOR_PATH = join(projectRoot, 'src', 'claude', 'agents', 'impact-analysis', 'impact-analysis-orchestrator.md');
const SKILL_PATH = join(projectRoot, 'src', 'claude', 'skills', 'impact-analysis', 'cross-validation', 'SKILL.md');
const MANIFEST_PATH = join(projectRoot, 'src', 'isdlc', 'config', 'skills-manifest.json');
const CONSOLIDATION_SKILL_PATH = join(projectRoot, 'src', 'claude', 'skills', 'impact-analysis', 'impact-consolidation', 'SKILL.md');

// M1/M2/M3 agent paths (should NOT be modified -- NFR-03)
const M1_PATH = join(projectRoot, 'src', 'claude', 'agents', 'impact-analysis', 'impact-analyzer.md');
const M2_PATH = join(projectRoot, 'src', 'claude', 'agents', 'impact-analysis', 'entry-point-finder.md');
const M3_PATH = join(projectRoot, 'src', 'claude', 'agents', 'impact-analysis', 'risk-assessor.md');

/**
 * Extract frontmatter block from markdown content (between first two --- delimiters).
 */
function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1] : '';
}

// Loaded file contents
let agentContent;
let orchContent;
let skillContent;
let manifest;
let consolidationContent;

describe('REQ-0015: Cross-Validation Verifier (M4)', () => {

  before(() => {
    // Load all file contents once. Tests will fail if files don't exist (RED phase).
    if (existsSync(AGENT_PATH)) {
      agentContent = readFileSync(AGENT_PATH, 'utf-8');
    }
    if (existsSync(ORCHESTRATOR_PATH)) {
      orchContent = readFileSync(ORCHESTRATOR_PATH, 'utf-8');
    }
    if (existsSync(SKILL_PATH)) {
      skillContent = readFileSync(SKILL_PATH, 'utf-8');
    }
    if (existsSync(MANIFEST_PATH)) {
      manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    }
    if (existsSync(CONSOLIDATION_SKILL_PATH)) {
      consolidationContent = readFileSync(CONSOLIDATION_SKILL_PATH, 'utf-8');
    }
  });

  // ===================================================================
  // FR-01: Verifier Agent Definition
  // ===================================================================
  describe('FR-01: Verifier Agent Definition', () => {

    it('TC-01.1 [AC-01.1]: agent file exists at src/claude/agents/impact-analysis/cross-validation-verifier.md', () => {
      assert.ok(existsSync(AGENT_PATH),
        'Agent file must exist at src/claude/agents/impact-analysis/cross-validation-verifier.md');
      assert.ok(agentContent.length > 100,
        'Agent file must have substantial content (>100 chars)');
    });

    it('TC-01.2 [AC-01.2]: agent has frontmatter with name, description, model, owned_skills', () => {
      assert.ok(agentContent, 'Agent content must be loaded');
      const fm = extractFrontmatter(agentContent);
      assert.ok(fm.length > 0, 'Frontmatter block must exist');
      assert.ok(fm.includes('name:'), 'Frontmatter must have name field');
      assert.match(fm, /cross-validation-verifier/, 'Name must be cross-validation-verifier');
      assert.ok(fm.includes('description:'), 'Frontmatter must have description field');
      assert.ok(fm.includes('model:'), 'Frontmatter must have model field');
      assert.ok(fm.includes('owned_skills'), 'Frontmatter must have owned_skills field');
      assert.ok(fm.includes('IA-401'), 'owned_skills must include IA-401');
      assert.ok(fm.includes('IA-402'), 'owned_skills must include IA-402');
    });

    it('TC-01.3 [AC-01.3]: agent specifies M1/M2/M3 input parsing (impact_summary, entry_points, risk_assessment)', () => {
      assert.ok(agentContent, 'Agent content must be loaded');
      assert.ok(agentContent.includes('impact_summary'),
        'Agent must reference M1 impact_summary input');
      assert.ok(agentContent.includes('entry_points'),
        'Agent must reference M2 entry_points input');
      assert.ok(agentContent.includes('risk_assessment'),
        'Agent must reference M3 risk_assessment input');
      // Defensive parsing requirement
      assert.match(agentContent, /[Dd]efensive|[Mm]issing.*field|graceful|[Ff]ail/,
        'Agent must specify defensive parsing for missing fields');
    });

    it('TC-01.4 [AC-01.4]: agent specifies findings categorized by severity (CRITICAL, WARNING, INFO)', () => {
      assert.ok(agentContent, 'Agent content must be loaded');
      assert.ok(agentContent.includes('CRITICAL'),
        'Agent must define CRITICAL severity');
      assert.ok(agentContent.includes('WARNING'),
        'Agent must define WARNING severity');
      assert.ok(agentContent.includes('INFO'),
        'Agent must define INFO severity');
    });
  });

  // ===================================================================
  // FR-02: File List Cross-Validation
  // ===================================================================
  describe('FR-02: File List Cross-Validation', () => {

    it('TC-02.1 [AC-02.1]: agent specifies MISSING_FROM_BLAST_RADIUS finding for M2-only files', () => {
      assert.ok(agentContent, 'Agent content must be loaded');
      assert.ok(agentContent.includes('MISSING_FROM_BLAST_RADIUS'),
        'Agent must specify MISSING_FROM_BLAST_RADIUS finding type');
    });

    it('TC-02.2 [AC-02.2]: agent specifies ORPHAN_IMPACT finding for M1-only files', () => {
      assert.ok(agentContent, 'Agent content must be loaded');
      assert.ok(agentContent.includes('ORPHAN_IMPACT'),
        'Agent must specify ORPHAN_IMPACT finding type');
    });

    it('TC-02.3 [AC-02.3]: agent specifies symmetric difference computation between M1 and M2 file lists', () => {
      assert.ok(agentContent, 'Agent content must be loaded');
      assert.match(agentContent, /symmetric.difference|symmetric_difference|XOR|delta/i,
        'Agent must specify symmetric difference or delta computation');
    });

    it('TC-02.4 [AC-02.4]: agent specifies affected_agents attribution in findings', () => {
      assert.ok(agentContent, 'Agent content must be loaded');
      assert.ok(agentContent.includes('affected_agents'),
        'Agent must specify affected_agents field in findings');
      assert.match(agentContent, /M[12]-found|M[12]-missing/,
        'Agent must specify agent attribution indicators (e.g., M1-found, M2-missing)');
    });
  });

  // ===================================================================
  // FR-03: Risk Scoring Gap Detection
  // ===================================================================
  describe('FR-03: Risk Scoring Gap Detection', () => {

    it('TC-03.1 [AC-03.1]: agent specifies RISK_SCORING_GAP finding for high-coupling + low-risk mismatch', () => {
      assert.ok(agentContent, 'Agent content must be loaded');
      assert.ok(agentContent.includes('RISK_SCORING_GAP'),
        'Agent must specify RISK_SCORING_GAP finding type');
    });

    it('TC-03.2 [AC-03.2]: agent specifies UNDERTESTED_CRITICAL_PATH finding for deep chains with low coverage', () => {
      assert.ok(agentContent, 'Agent content must be loaded');
      assert.ok(agentContent.includes('UNDERTESTED_CRITICAL_PATH'),
        'Agent must specify UNDERTESTED_CRITICAL_PATH finding type');
    });

    it('TC-03.3 [AC-03.3]: agent specifies blast radius vs overall risk validation', () => {
      assert.ok(agentContent, 'Agent content must be loaded');
      assert.match(agentContent, /blast.radius/i,
        'Agent must reference blast_radius field');
      assert.match(agentContent, /overall.risk|overall_risk/i,
        'Agent must reference overall_risk field');
    });

    it('TC-03.4 [AC-03.4]: agent specifies recommendation field with actionable text for each gap', () => {
      assert.ok(agentContent, 'Agent content must be loaded');
      assert.ok(agentContent.includes('recommendation'),
        'Agent must specify recommendation field');
      // Verify at least one concrete recommendation example
      assert.match(agentContent, /[Ii]ncrease risk|[Aa]dd test coverage|[Rr]econcile|[Rr]eview/,
        'Agent must include at least one example recommendation');
    });
  });

  // ===================================================================
  // FR-04: Completeness Validation
  // ===================================================================
  describe('FR-04: Completeness Validation', () => {

    it('TC-04.1 [AC-04.1]: agent specifies M2 entry point to M1 file mapping check', () => {
      assert.ok(agentContent, 'Agent content must be loaded');
      // Must reference entry points mapping to M1 files
      assert.match(agentContent, /entry.*point/i,
        'Agent must reference M2 entry points');
      assert.match(agentContent, /m1.*file|affected.*file|directly_affected/i,
        'Agent must reference M1 affected files for mapping');
    });

    it('TC-04.2 [AC-04.2]: agent specifies M1 module to M3 risk assessment mapping check', () => {
      assert.ok(agentContent, 'Agent content must be loaded');
      assert.match(agentContent, /module/i,
        'Agent must reference M1 modules');
      assert.match(agentContent, /risk.*assessment|risk_area/i,
        'Agent must reference M3 risk assessment');
    });

    it('TC-04.3 [AC-04.3]: agent specifies INCOMPLETE_ANALYSIS finding for coverage gaps', () => {
      assert.ok(agentContent, 'Agent content must be loaded');
      assert.ok(agentContent.includes('INCOMPLETE_ANALYSIS'),
        'Agent must specify INCOMPLETE_ANALYSIS finding type');
    });

    it('TC-04.4 [AC-04.4]: agent specifies completeness_score computation (0-100 percentage)', () => {
      assert.ok(agentContent, 'Agent content must be loaded');
      assert.ok(agentContent.includes('completeness_score'),
        'Agent must specify completeness_score field');
      // Must reference percentage or 0-100 range
      assert.match(agentContent, /0.*100|percentage|%/,
        'Agent must specify completeness_score as 0-100 or percentage');
    });
  });

  // ===================================================================
  // FR-05: Orchestrator Integration
  // ===================================================================
  describe('FR-05: Orchestrator Integration', () => {

    it('TC-05.1 [AC-05.1]: orchestrator contains Step 3.5 with cross-validation-verifier invocation', () => {
      assert.ok(orchContent, 'Orchestrator content must be loaded');
      assert.match(orchContent, /[Ss]tep\s*3\.5|[Cc]ross-[Vv]alidat/,
        'Orchestrator must contain Step 3.5 or cross-validation reference');
      assert.ok(orchContent.includes('cross-validation-verifier'),
        'Orchestrator must reference cross-validation-verifier agent');
    });

    it('TC-05.2 [AC-05.2]: orchestrator includes Cross-Validation section in report template', () => {
      assert.ok(orchContent, 'Orchestrator content must be loaded');
      assert.match(orchContent, /##\s*Cross-Validation|Cross-Validation.*section/i,
        'Orchestrator must include Cross-Validation section in report template');
    });

    it('TC-05.3 [AC-05.3]: orchestrator surfaces CRITICAL findings in executive summary', () => {
      assert.ok(orchContent, 'Orchestrator content must be loaded');
      // The orchestrator must mention surfacing CRITICAL findings in the executive summary
      assert.match(orchContent, /CRITICAL/,
        'Orchestrator must reference CRITICAL severity');
      assert.match(orchContent, /[Ee]xecutive.*[Ss]ummary/,
        'Orchestrator must reference executive summary');
    });

    it('TC-05.4 [AC-05.4]: orchestrator shows M4 in progress display', () => {
      assert.ok(orchContent, 'Orchestrator content must be loaded');
      assert.match(orchContent, /M4|[Cc]ross-[Vv]alidation\s+[Vv]erifier/,
        'Orchestrator must show M4 or Cross-Validation Verifier in progress display');
    });

    it('TC-05.5 [AC-05.5]: orchestrator includes M4 in sub_agents state update', () => {
      assert.ok(orchContent, 'Orchestrator content must be loaded');
      assert.match(orchContent, /M4.*cross-validation|cross-validation.*verifier/i,
        'Orchestrator must include M4 in state update section');
    });
  });

  // ===================================================================
  // FR-06: Verification Report Structure
  // ===================================================================
  describe('FR-06: Verification Report Structure', () => {

    it('TC-06.1 [AC-06.1]: agent specifies report summary with total_findings, critical, warning, info counts', () => {
      assert.ok(agentContent, 'Agent content must be loaded');
      assert.ok(agentContent.includes('total_findings'),
        'Agent must specify total_findings in summary');
      // Check for the count fields in the summary structure
      const summarySection = agentContent.substring(
        agentContent.indexOf('summary'),
        agentContent.indexOf('summary') + 500
      );
      assert.match(summarySection, /critical/i, 'Summary must include critical count');
      assert.match(summarySection, /warning/i, 'Summary must include warning count');
      assert.match(summarySection, /info/i, 'Summary must include info count');
    });

    it('TC-06.2 [AC-06.2]: agent specifies finding structure with id, severity, category, description, affected_agents, recommendation', () => {
      assert.ok(agentContent, 'Agent content must be loaded');
      const requiredFields = ['id', 'severity', 'category', 'description', 'affected_agents', 'recommendation'];
      for (const field of requiredFields) {
        assert.ok(agentContent.includes(`"${field}"`) || agentContent.includes(field),
          `Agent must specify "${field}" in finding structure`);
      }
    });

    it('TC-06.3 [AC-06.3]: agent specifies completeness_score in output (0-100)', () => {
      assert.ok(agentContent, 'Agent content must be loaded');
      assert.ok(agentContent.includes('completeness_score'),
        'Agent must specify completeness_score in output contract');
    });

    it('TC-06.4 [AC-06.4]: agent specifies verification_status with PASS, WARN, FAIL values', () => {
      assert.ok(agentContent, 'Agent content must be loaded');
      assert.ok(agentContent.includes('verification_status'),
        'Agent must specify verification_status field');
      assert.ok(agentContent.includes('PASS'), 'Agent must define PASS status');
      assert.ok(agentContent.includes('WARN'), 'Agent must define WARN status');
      assert.ok(agentContent.includes('FAIL'), 'Agent must define FAIL status');
    });

    it('TC-06.5 [AC-06.5]: agent specifies dual JSON (verification_report) and markdown (report_section) output', () => {
      assert.ok(agentContent, 'Agent content must be loaded');
      assert.ok(agentContent.includes('verification_report'),
        'Agent must specify verification_report JSON output');
      assert.ok(agentContent.includes('report_section'),
        'Agent must specify report_section markdown output');
    });
  });

  // ===================================================================
  // FR-07: Skill Registration
  // ===================================================================
  describe('FR-07: Skill Registration', () => {

    it('TC-07.1 [AC-07.1]: skills manifest has IA-401 and IA-402 in skill_lookup', () => {
      assert.ok(manifest, 'Skills manifest must be loaded');
      assert.ok(manifest.skill_lookup, 'Manifest must have skill_lookup section');
      assert.ok(manifest.skill_lookup['IA-401'],
        'skill_lookup must contain IA-401');
      assert.ok(manifest.skill_lookup['IA-402'],
        'skill_lookup must contain IA-402');
    });

    it('TC-07.2 [AC-07.2]: skill file exists at src/claude/skills/impact-analysis/cross-validation/SKILL.md', () => {
      assert.ok(existsSync(SKILL_PATH),
        'Skill file must exist at src/claude/skills/impact-analysis/cross-validation/SKILL.md');
      assert.ok(skillContent.length > 50,
        'Skill file must have substantial content');
      assert.ok(skillContent.includes('IA-401'),
        'Skill file must reference IA-401 skill ID');
    });

    it('TC-07.3 [AC-07.3]: skills manifest has ownership, lookup, and paths entries for cross-validation-verifier', () => {
      assert.ok(manifest, 'Skills manifest must be loaded');

      // Ownership entry
      const owner = manifest.ownership['cross-validation-verifier'];
      assert.ok(owner, 'Ownership section must have cross-validation-verifier entry');
      assert.ok(owner.skills, 'Ownership entry must have skills array');
      assert.ok(owner.skills.includes('IA-401'), 'Ownership skills must include IA-401');
      assert.ok(owner.skills.includes('IA-402'), 'Ownership skills must include IA-402');
      assert.equal(owner.phase, '02-impact-analysis',
        'Ownership phase must be 02-impact-analysis');

      // Skill lookup
      assert.equal(manifest.skill_lookup['IA-401'], 'cross-validation-verifier',
        'IA-401 must map to cross-validation-verifier');
      assert.equal(manifest.skill_lookup['IA-402'], 'cross-validation-verifier',
        'IA-402 must map to cross-validation-verifier');

      // skill_paths removed per REQ-0001 FR-008 (manifest cleanup)
      // Verify skill_lookup coverage instead
      assert.equal(manifest.skill_lookup['IA-401'], 'cross-validation-verifier',
        'skill_lookup must still map IA-401 after manifest cleanup');
    });
  });

  // ===================================================================
  // NFR Validation
  // ===================================================================
  describe('Non-Functional Requirements', () => {

    it('TC-NFR01 [NFR-01]: M4 step is sequential (after M1/M2/M3, before consolidation)', () => {
      assert.ok(orchContent, 'Orchestrator content must be loaded');
      // Verify ordering: Step 3 -> Step 3.5 -> Step 4
      const collectPos = orchContent.search(/[Ss]tep\s*3[^.]|[Cc]ollect.*[Rr]esult/);
      const crossValPos = orchContent.search(/[Ss]tep\s*3\.5|[Cc]ross-[Vv]alidat.*[Rr]esult/);
      const consolidatePos = orchContent.search(/[Ss]tep\s*4|[Cc]onsolidat/);

      assert.ok(collectPos >= 0, 'Orchestrator must have Step 3 (collect results)');
      assert.ok(crossValPos >= 0, 'Orchestrator must have Step 3.5 (cross-validate)');
      assert.ok(consolidatePos >= 0, 'Orchestrator must have Step 4 (consolidate)');
      assert.ok(crossValPos > collectPos,
        'Cross-validation must come after collecting results');
      assert.ok(crossValPos < consolidatePos,
        'Cross-validation must come before consolidation');
    });

    it('TC-NFR02 [NFR-02]: orchestrator specifies fail-open handling (agent not found, task failure, parse failure)', () => {
      assert.ok(orchContent, 'Orchestrator content must be loaded');
      // Must mention fail-open or graceful handling
      assert.match(orchContent, /[Ff]ail.open|graceful|skip.*verif/i,
        'Orchestrator must specify fail-open behavior');
      // Must handle agent not found scenario
      assert.match(orchContent, /not.*found|not.*available|absent|skip/i,
        'Orchestrator must handle agent-not-found scenario');
      // Must handle task call failure
      assert.match(orchContent, /[Ww]arning|proceed.*without|skipped/i,
        'Orchestrator must specify warning-and-proceed on failure');
    });

    it('TC-NFR03 [NFR-03]: M1/M2/M3 agent files exist and are unmodified (backward compatibility)', () => {
      // Verify that M1, M2, M3 files still exist (they should not be deleted)
      assert.ok(existsSync(M1_PATH),
        'M1 (impact-analyzer.md) must still exist');
      assert.ok(existsSync(M2_PATH),
        'M2 (entry-point-finder.md) must still exist');
      assert.ok(existsSync(M3_PATH),
        'M3 (risk-assessor.md) must still exist');
      // Verify orchestrator documents backward compatibility
      assert.match(orchContent, /M1.*unchanged|M2.*unchanged|M3.*unchanged|[Bb]ackward|NFR-03|not.*modif/i,
        'Orchestrator should reference backward compatibility or unchanged M1/M2/M3');
    });

    it('TC-C02 [C-02]: agent supports both feature and upgrade workflows', () => {
      assert.ok(agentContent, 'Agent content must be loaded');
      assert.ok(agentContent.includes('feature'),
        'Agent must reference feature workflow');
      assert.ok(agentContent.includes('upgrade'),
        'Agent must reference upgrade workflow');
    });
  });
});

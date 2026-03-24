/**
 * Tests for src/codex/AGENTS.md.template
 * REQ-0138: Codex Session Cache Re-priming + AGENTS.md Template
 *
 * Validates that the template file exists and contains all required
 * sections per the requirements specification.
 *
 * Test ID prefix: TPL-
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');
const templatePath = join(__dirname, '..', '..', 'src', 'codex', 'AGENTS.md.template');

// ---------------------------------------------------------------------------
// Template existence
// ---------------------------------------------------------------------------

describe('AGENTS.md.template existence (REQ-0138 FR-001)', () => {
  // TPL-01: Template file exists
  it('TPL-01: template file exists at src/codex/AGENTS.md.template (AC-001-01)', () => {
    assert.ok(existsSync(templatePath), 'AGENTS.md.template should exist');
  });

  // TPL-02: Template is non-empty
  it('TPL-02: template is non-empty', () => {
    const content = readFileSync(templatePath, 'utf-8');
    assert.ok(content.length > 100, 'Template should have substantial content');
  });
});

// ---------------------------------------------------------------------------
// FR-002: Behavioral Instructions
// ---------------------------------------------------------------------------

describe('AGENTS.md.template behavioral instructions (REQ-0138 FR-002)', () => {
  let content;

  it('setup: read template', () => {
    content = readFileSync(templatePath, 'utf-8');
  });

  // TPL-03: Intent detection table
  it('TPL-03: contains intent detection table with all verbs (AC-002-01)', () => {
    assert.ok(content.includes('Detect Intent'), 'Should have intent detection section');
    assert.ok(content.includes('| **Add**'), 'Should have Add intent');
    assert.ok(content.includes('| **Analyze**'), 'Should have Analyze intent');
    assert.ok(content.includes('| **Build**'), 'Should have Build intent');
    assert.ok(content.includes('| **Fix**'), 'Should have Fix intent');
    assert.ok(content.includes('| **Upgrade**'), 'Should have Upgrade intent');
    assert.ok(content.includes('| **Test run**'), 'Should have Test run intent');
    assert.ok(content.includes('| **Test generate**'), 'Should have Test generate intent');
    assert.ok(content.includes('| **Discovery**'), 'Should have Discovery intent');
    assert.ok(content.includes('| **Skill mgmt**'), 'Should have Skill mgmt intent');
  });

  // TPL-04: Consent patterns
  it('TPL-04: contains consent patterns with good/bad examples (AC-002-02)', () => {
    assert.ok(content.includes('Get Consent'), 'Should have consent section');
    assert.ok(content.includes('**Good examples**'), 'Should have good examples');
    assert.ok(content.includes('**Bad examples**'), 'Should have bad examples');
  });

  // TPL-05: Analysis completion rules
  it('TPL-05: contains analysis completion rules with three-domain confirmation (AC-002-03)', () => {
    assert.ok(content.includes('Analysis Completion Rules'), 'Should have analysis rules');
    assert.ok(
      content.toLowerCase().includes('three-domain confirmation'),
      'Should reference three-domain confirmation'
    );
    assert.ok(content.includes('Requirements'), 'Should reference Requirements domain');
    assert.ok(content.includes('Architecture'), 'Should reference Architecture domain');
    assert.ok(content.includes('Design'), 'Should reference Design domain');
  });

  // TPL-06: Agent framework context adapted for codex exec
  it('TPL-06: agent framework context uses codex exec, not Task tool (AC-002-04)', () => {
    assert.ok(content.includes('codex exec'), 'Should reference codex exec');
    assert.ok(!content.includes('Task tool'), 'Should NOT reference Task tool');
  });

  // TPL-07: Git commit prohibition
  it('TPL-07: contains git commit prohibition (AC-002-05)', () => {
    assert.ok(content.includes('Git Commit Prohibition'), 'Should have git commit prohibition section');
    assert.ok(content.includes('Do NOT run `git'), 'Should prohibit git commands');
  });

  // TPL-08: Constitutional principles preamble
  it('TPL-08: contains constitutional principles preamble reference (AC-002-06)', () => {
    assert.ok(content.includes('CONSTITUTIONAL PRINCIPLES'), 'Should reference constitutional principles');
    assert.ok(content.includes('docs/isdlc/constitution.md'), 'Should reference constitution path');
  });
});

// ---------------------------------------------------------------------------
// FR-003: Intent Detection Reinforcement
// ---------------------------------------------------------------------------

describe('AGENTS.md.template intent detection reinforcement (REQ-0138 FR-003)', () => {
  let content;

  it('setup: read template', () => {
    content = readFileSync(templatePath, 'utf-8');
  });

  // TPL-09: Reinforced wording
  it('TPL-09: has reinforced wording "You MUST classify" (AC-003-01)', () => {
    assert.ok(content.includes('You MUST classify'), 'Should have reinforced wording');
  });

  // TPL-10: Worked examples for Add
  it('TPL-10: has at least 2 worked examples for Add intent (AC-003-02)', () => {
    const addSection = content.slice(content.indexOf('**Add**:'));
    const addExamples = addSection.slice(0, addSection.indexOf('**Analyze**:'));
    const exampleCount = (addExamples.match(/User says:/g) || []).length;
    assert.ok(exampleCount >= 2, `Should have >= 2 Add examples, found ${exampleCount}`);
  });

  // TPL-11: Worked examples for Build
  it('TPL-11: has at least 2 worked examples for Build intent (AC-003-02)', () => {
    const buildSection = content.slice(content.indexOf('**Build**:'));
    const buildExamples = buildSection.slice(0, buildSection.indexOf('**Fix**:'));
    const exampleCount = (buildExamples.match(/User says:/g) || []).length;
    assert.ok(exampleCount >= 2, `Should have >= 2 Build examples, found ${exampleCount}`);
  });

  // TPL-12: Worked examples for Fix
  it('TPL-12: has at least 2 worked examples for Fix intent (AC-003-02)', () => {
    const fixSection = content.slice(content.indexOf('**Fix**:'));
    const fixExamples = fixSection.slice(0, fixSection.indexOf('**Upgrade**:'));
    const exampleCount = (fixExamples.match(/User says:/g) || []).length;
    assert.ok(exampleCount >= 2, `Should have >= 2 Fix examples, found ${exampleCount}`);
  });

  // TPL-13: Fallback for uncertain classification
  it('TPL-13: acknowledges probabilistic routing with fallback (AC-003-03)', () => {
    assert.ok(
      content.includes('uncertain') || content.includes('If uncertain'),
      'Should have fallback for uncertain classification'
    );
  });
});

// ---------------------------------------------------------------------------
// FR-004: Session Cache Re-prime
// ---------------------------------------------------------------------------

describe('AGENTS.md.template session cache re-prime (REQ-0138 FR-004)', () => {
  let content;

  it('setup: read template', () => {
    content = readFileSync(templatePath, 'utf-8');
  });

  // TPL-14: Cache re-prime section exists
  it('TPL-14: contains session cache re-prime section (AC-004-01)', () => {
    assert.ok(content.includes('Session Cache Re-prime'), 'Should have cache re-prime section');
  });

  // TPL-15: References session-cache.md
  it('TPL-15: references .isdlc/session-cache.md (AC-004-01)', () => {
    assert.ok(content.includes('.isdlc/session-cache.md'), 'Should reference session-cache.md');
  });

  // TPL-16: Instructs to use if present
  it('TPL-16: instructs to use cache if present (AC-004-02)', () => {
    assert.ok(
      content.includes('If present') || content.includes('if present'),
      'Should instruct to use cache when present'
    );
  });

  // TPL-17: References rebuild command
  it('TPL-17: references bin/rebuild-cache.js for manual rebuild (AC-004-04)', () => {
    assert.ok(content.includes('bin/rebuild-cache.js'), 'Should reference rebuild command');
  });
});

// ---------------------------------------------------------------------------
// FR-005: Three-Tier Governance
// ---------------------------------------------------------------------------

describe('AGENTS.md.template governance (REQ-0138 FR-005)', () => {
  let content;

  it('setup: read template', () => {
    content = readFileSync(templatePath, 'utf-8');
  });

  // TPL-18: Tier 1 section
  it('TPL-18: contains Tier 1 adapter-enforced governance (AC-005-01)', () => {
    assert.ok(content.includes('Tier 1'), 'Should have Tier 1');
    assert.ok(content.includes('phase transition') || content.includes('Phase transition'), 'Should mention phase transitions');
    assert.ok(content.includes('artifact') || content.includes('Artifact'), 'Should mention artifact existence');
    assert.ok(content.includes('state schema') || content.includes('State schema'), 'Should mention state schema');
  });

  // TPL-19: Tier 2 section
  it('TPL-19: contains Tier 2 instruction-level governance (AC-005-02)', () => {
    assert.ok(content.includes('Tier 2'), 'Should have Tier 2');
    assert.ok(content.includes('commit prohibition') || content.includes('git commit'), 'Should mention commit prohibition');
    assert.ok(
      content.includes('constitutional compliance') || content.includes('Constitutional compliance'),
      'Should mention constitutional compliance'
    );
    assert.ok(
      content.includes('blast radius') || content.includes('Blast radius'),
      'Should mention blast radius'
    );
  });

  // TPL-20: Tier 3 section
  it('TPL-20: contains Tier 3 manual fallback governance (AC-005-03)', () => {
    assert.ok(content.includes('Tier 3'), 'Should have Tier 3');
    assert.ok(
      content.includes('ask the user') || content.includes('Ask the user') || content.includes('ask the User'),
      'Should mention asking the user as fallback'
    );
  });
});

// ---------------------------------------------------------------------------
// Codex-specific adaptations (no Claude-only content)
// ---------------------------------------------------------------------------

describe('AGENTS.md.template Codex adaptations', () => {
  let content;

  it('setup: read template', () => {
    content = readFileSync(templatePath, 'utf-8');
  });

  // TPL-21: No hook block auto-recovery (Codex has no hooks)
  it('TPL-21: does not contain Hook Block Auto-Recovery Protocol', () => {
    assert.ok(!content.includes('Hook Block Auto-Recovery'), 'Should NOT have hook auto-recovery');
  });

  // TPL-22: No relay-and-resume protocol
  it('TPL-22: does not contain relay-and-resume protocol', () => {
    assert.ok(!content.includes('relay-and-resume'), 'Should NOT have relay-and-resume');
  });

  // TPL-23: References .codex/ provider directory
  it('TPL-23: references .codex/ for provider-owned files', () => {
    assert.ok(content.includes('.codex/'), 'Should reference .codex/ directory');
  });
});

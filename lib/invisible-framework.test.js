/**
 * invisible-framework.test.js -- Structural validation of the Invisible Framework
 * rewrite of the ## Workflow-First Development section in CLAUDE.md and template.
 *
 * REQ-0012-invisible-framework: 49 test cases covering intent detection,
 * consent protocol, command mapping, edge cases, invisible principle,
 * template consistency, and regression guards.
 *
 * @module invisible-framework.test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');

// ---------------------------------------------------------------------------
// File Paths
// ---------------------------------------------------------------------------

const CLAUDE_MD_PATH = resolve(__dirname, '..', 'CLAUDE.md');
const TEMPLATE_PATH = resolve(__dirname, '..', 'src', 'claude', 'CLAUDE.md.template');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the Workflow-First Development section from a markdown file.
 * Returns content between `## Workflow-First Development` and the next `## ` heading.
 */
function extractWorkflowFirstSection(content) {
  const marker = '## Workflow-First Development';
  const idx = content.indexOf(marker);
  if (idx === -1) return null;
  const rest = content.slice(idx + marker.length);
  // Find next ## heading (not ###)
  const nextH2 = rest.search(/\n## [^\#]/);
  const section = nextH2 === -1 ? rest : rest.slice(0, nextH2);
  return section;
}

/**
 * Check if content contains at least N of the given keywords (case-insensitive).
 */
function containsAtLeast(content, keywords, min) {
  const lower = content.toLowerCase();
  const found = keywords.filter(kw => lower.includes(kw.toLowerCase()));
  return found.length >= min;
}

// ---------------------------------------------------------------------------
// Read files once for all tests
// ---------------------------------------------------------------------------

const claudeMd = readFileSync(CLAUDE_MD_PATH, 'utf-8');
const templateMd = readFileSync(TEMPLATE_PATH, 'utf-8');
const wfSection = extractWorkflowFirstSection(claudeMd);
const wfSectionTemplate = extractWorkflowFirstSection(templateMd);

// ===========================================================================
// Group 1: Section Structure (T01-T05)
// ===========================================================================

describe('Group 1: Section Structure', () => {
  it('T01: Workflow-First Development section exists in CLAUDE.md', () => {
    assert.ok(
      claudeMd.includes('## Workflow-First Development'),
      'CLAUDE.md must contain ## Workflow-First Development heading'
    );
  });

  it('T02: Workflow-First Development section exists in template', () => {
    assert.ok(
      templateMd.includes('## Workflow-First Development'),
      'Template must contain ## Workflow-First Development heading'
    );
  });

  it('T03: Intent Detection subsection exists', () => {
    assert.ok(wfSection, 'Workflow-First section not found in CLAUDE.md');
    const hasIntentKeywords = containsAtLeast(
      wfSection,
      ['intent', 'detect', 'feature', 'fix', 'upgrade'],
      3
    );
    assert.ok(hasIntentKeywords, 'Workflow-First section must contain intent detection content (at least 3 of: intent, detect, feature, fix, upgrade)');
  });

  it('T04: Consent Protocol subsection exists', () => {
    assert.ok(wfSection, 'Workflow-First section not found in CLAUDE.md');
    const hasConsentKeywords = containsAtLeast(
      wfSection,
      ['consent', 'confirm', 'approval', 'permission'],
      1
    );
    assert.ok(hasConsentKeywords, 'Workflow-First section must contain consent protocol content');
  });

  it('T05: Edge Case handling subsection exists', () => {
    assert.ok(wfSection, 'Workflow-First section not found in CLAUDE.md');
    const hasEdgeCaseKeywords = containsAtLeast(
      wfSection,
      ['ambiguous', 'clarif', 'active workflow'],
      2
    );
    assert.ok(hasEdgeCaseKeywords, 'Workflow-First section must contain edge case handling content');
  });
});

// ===========================================================================
// Group 2: Intent Detection -- Feature (T06-T07)
// ===========================================================================

describe('Group 2: Intent Detection -- Feature', () => {
  it('T06: Feature intent keywords present', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    const hasKeywords = containsAtLeast(
      wfSection,
      ['add', 'build', 'implement', 'create', 'feature'],
      3
    );
    assert.ok(hasKeywords, 'Section must contain at least 3 feature intent keywords (add, build, implement, create, feature)');
  });

  it('T07: Feature intent example phrases present', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    // Section should reference feature-type conversational patterns
    const lower = wfSection.toLowerCase();
    const hasFeaturePatterns = (
      lower.includes('add a') ||
      lower.includes('build a') ||
      lower.includes('implement') ||
      lower.includes('create a') ||
      lower.includes('new feature')
    );
    assert.ok(hasFeaturePatterns, 'Section must contain feature-type conversational patterns');
  });
});

// ===========================================================================
// Group 3: Intent Detection -- Fix (T08-T09)
// ===========================================================================

describe('Group 3: Intent Detection -- Fix', () => {
  it('T08: Fix intent keywords present', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    const hasKeywords = containsAtLeast(
      wfSection,
      ['broken', 'fix', 'bug', 'crash', 'error'],
      3
    );
    assert.ok(hasKeywords, 'Section must contain at least 3 fix intent keywords (broken, fix, bug, crash, error)');
  });

  it('T09: Fix intent maps to fix workflow', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    assert.ok(
      wfSection.includes('/isdlc fix'),
      'Section must map fix intent to /isdlc fix command'
    );
  });
});

// ===========================================================================
// Group 4: Intent Detection -- Upgrade (T10-T11)
// ===========================================================================

describe('Group 4: Intent Detection -- Upgrade', () => {
  it('T10: Upgrade intent keywords present', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    const hasKeywords = containsAtLeast(
      wfSection,
      ['upgrade', 'update', 'bump', 'version'],
      2
    );
    assert.ok(hasKeywords, 'Section must contain at least 2 upgrade intent keywords');
  });

  it('T11: Upgrade intent maps to upgrade workflow', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    assert.ok(
      wfSection.includes('/isdlc upgrade'),
      'Section must map upgrade intent to /isdlc upgrade command'
    );
  });
});

// ===========================================================================
// Group 5: Intent Detection -- Test Run (T12-T13)
// ===========================================================================

describe('Group 5: Intent Detection -- Test Run', () => {
  it('T12: Test run intent keywords present', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    const lower = wfSection.toLowerCase();
    const hasTestRunPhrases = (
      lower.includes('run tests') ||
      lower.includes('run the tests') ||
      lower.includes('check if tests pass') ||
      lower.includes('test suite') ||
      lower.includes('execute test')
    );
    assert.ok(hasTestRunPhrases, 'Section must contain test-run-related phrases');
  });

  it('T13: Test run intent maps to test run command', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    assert.ok(
      wfSection.includes('/isdlc test run'),
      'Section must map test run intent to /isdlc test run command'
    );
  });
});

// ===========================================================================
// Group 6: Intent Detection -- Test Generate (T14-T15)
// ===========================================================================

describe('Group 6: Intent Detection -- Test Generate', () => {
  it('T14: Test generate intent keywords present', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    const lower = wfSection.toLowerCase();
    const hasTestGenPhrases = (
      lower.includes('write tests') ||
      lower.includes('add tests') ||
      lower.includes('generate tests') ||
      lower.includes('test coverage') ||
      lower.includes('add unit tests')
    );
    assert.ok(hasTestGenPhrases, 'Section must contain test-generation-related phrases');
  });

  it('T15: Test generate intent maps to test generate command', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    assert.ok(
      wfSection.includes('/isdlc test generate'),
      'Section must map test generate intent to /isdlc test generate command'
    );
  });
});

// ===========================================================================
// Group 7: Intent Detection -- Discovery (T16-T17)
// ===========================================================================

describe('Group 7: Intent Detection -- Discovery', () => {
  it('T16: Discovery intent keywords present', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    const hasKeywords = containsAtLeast(
      wfSection,
      ['set up', 'configure', 'initialize', 'discover'],
      2
    );
    assert.ok(hasKeywords, 'Section must contain at least 2 discovery intent keywords');
  });

  it('T17: Discovery intent maps to discover command', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    assert.ok(
      wfSection.includes('/discover'),
      'Section must map discovery intent to /discover command'
    );
  });
});

// ===========================================================================
// Group 8: Consent Protocol (T18-T24)
// ===========================================================================

describe('Group 8: Consent Protocol', () => {
  it('T18: Consent inform step described', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    const hasInformKeywords = containsAtLeast(
      wfSection,
      ['inform', 'tell', 'present', 'explain what', 'detected'],
      1
    );
    assert.ok(hasInformKeywords, 'Section must describe the consent inform step');
  });

  it('T19: No jargon in consent messages', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    const lower = wfSection.toLowerCase();
    const hasNoJargonInstruction = (
      lower.includes('plain language') ||
      lower.includes('no jargon') ||
      lower.includes("don't mention phases") ||
      lower.includes("don't say phase") ||
      lower.includes('do not mention phase') ||
      lower.includes('avoid jargon') ||
      lower.includes('user-friendly') ||
      lower.includes('user terms') ||
      lower.includes('conversational') ||
      lower.includes('do not parrot') ||
      lower.includes('do not describe the workflow') ||
      lower.includes('do not label the intent') ||
      lower.includes('exposes internals')
    );
    assert.ok(hasNoJargonInstruction, 'Section must instruct to avoid framework jargon');
  });

  it('T20: Confirmation handling described', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    const lower = wfSection.toLowerCase();
    const hasConfirmHandling = (
      lower.includes('confirms') ||
      lower.includes('yes') ||
      lower.includes('go ahead') ||
      lower.includes('invoke') ||
      lower.includes('proceed')
    );
    assert.ok(hasConfirmHandling, 'Section must describe how to handle positive confirmation');
  });

  it('T21: Decline handling described', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    const lower = wfSection.toLowerCase();
    const hasDeclineHandling = (
      lower.includes('declines') ||
      (lower.includes('no') && lower.includes('ask what')) ||
      lower.includes("don't") ||
      lower.includes('do not invoke') ||
      lower.includes('decline')
    );
    assert.ok(hasDeclineHandling, 'Section must describe how to handle user decline');
  });

  it('T22: Consent message brevity requirement', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    const lower = wfSection.toLowerCase();
    const hasBrevityInstruction = (
      lower.includes('short') ||
      lower.includes('concise') ||
      lower.includes('brief') ||
      lower.includes('single') ||
      lower.includes('one sentence') ||
      lower.includes('one-sentence')
    );
    assert.ok(hasBrevityInstruction, 'Section must specify consent message brevity');
  });

  it('T23: Consent uses user-friendly language', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    const lower = wfSection.toLowerCase();
    const hasUserTermsInstruction = (
      lower.includes('user terms') ||
      lower.includes('user-friendly') ||
      lower.includes("don't say /isdlc") ||
      lower.includes('do not say /isdlc') ||
      lower.includes('never mention slash') ||
      lower.includes('do not mention slash') ||
      lower.includes("don't mention slash") ||
      lower.includes('invisible') ||
      lower.includes('not secret') ||
      lower.includes('conversational, not mechanical') ||
      lower.includes('natural conversation')
    );
    assert.ok(hasUserTermsInstruction, 'Section must instruct to use user-friendly language in consent');
  });

  it('T24: No slash command suggestions to users', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    const lower = wfSection.toLowerCase();
    const hasNoSlashInstruction = (
      lower.includes("don't suggest") ||
      lower.includes('never mention') ||
      lower.includes('not suggest') ||
      lower.includes('slash command') ||
      lower.includes('do not suggest') ||
      lower.includes('never suggest')
    );
    assert.ok(hasNoSlashInstruction, 'Section must instruct not to suggest slash commands to users');
  });
});

// ===========================================================================
// Group 9: Intent-to-Command Mapping Table (T25-T31)
// ===========================================================================

describe('Group 9: Intent-to-Command Mapping Table', () => {
  it('T25: Feature maps to /isdlc feature', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    assert.ok(
      wfSection.includes('/isdlc feature'),
      'Section must contain /isdlc feature command in mapping'
    );
  });

  it('T26: Fix maps to /isdlc fix', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    assert.ok(
      wfSection.includes('/isdlc fix'),
      'Section must contain /isdlc fix command in mapping'
    );
  });

  it('T27: Upgrade maps to /isdlc upgrade', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    assert.ok(
      wfSection.includes('/isdlc upgrade'),
      'Section must contain /isdlc upgrade command in mapping'
    );
  });

  it('T28: Test run maps to /isdlc test run', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    assert.ok(
      wfSection.includes('/isdlc test run'),
      'Section must contain /isdlc test run command in mapping'
    );
  });

  it('T29: Test generate maps to /isdlc test generate', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    assert.ok(
      wfSection.includes('/isdlc test generate'),
      'Section must contain /isdlc test generate command in mapping'
    );
  });

  it('T30: Discovery maps to /discover', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    assert.ok(
      wfSection.includes('/discover'),
      'Section must contain /discover command in mapping'
    );
  });

  it('T31: Slash command passthrough preserved', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    const lower = wfSection.toLowerCase();
    const hasPassthrough = (
      lower.includes('immediately') ||
      lower.includes('execute') ||
      lower.includes('directly') ||
      lower.includes('without re-asking') ||
      lower.includes('already invoked')
    );
    assert.ok(hasPassthrough, 'Section must preserve slash command passthrough (immediately execute explicit commands)');
  });
});

// ===========================================================================
// Group 10: Edge Cases (T32-T36)
// ===========================================================================

describe('Group 10: Edge Cases', () => {
  it('T32: Ambiguous intent handling described', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    const lower = wfSection.toLowerCase();
    const hasAmbiguityHandling = (
      (lower.includes('ambiguous') || lower.includes('unclear')) &&
      (lower.includes('clarif') || lower.includes('ask'))
    );
    assert.ok(hasAmbiguityHandling, 'Section must describe ambiguous intent handling with clarifying questions');
  });

  it('T33: Non-development passthrough described', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    const lower = wfSection.toLowerCase();
    const hasNonDevPassthrough = (
      (lower.includes('question') || lower.includes('explore') || lower.includes('explain') || lower.includes('understand')) &&
      (lower.includes('normally') || lower.includes('not trigger') || lower.includes('do not') || lower.includes('skip'))
    );
    assert.ok(hasNonDevPassthrough, 'Section must describe non-development passthrough (questions/exploration)');
  });

  it('T34: Active workflow protection described', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    const lower = wfSection.toLowerCase();
    const hasActiveWorkflowGuard = (
      lower.includes('active workflow') ||
      lower.includes('in progress') ||
      lower.includes('already running')
    );
    assert.ok(hasActiveWorkflowGuard, 'Section must describe active workflow protection');
  });

  it('T35: Refactoring treated as feature', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    const lower = wfSection.toLowerCase();
    assert.ok(
      lower.includes('refactor'),
      'Section must mention refactoring and treat it as feature intent'
    );
  });

  it('T36: Non-dev requests passthrough', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    const lower = wfSection.toLowerCase();
    const hasNonDevExclusion = (
      lower.includes('explain') ||
      lower.includes('understand') ||
      lower.includes('what does') ||
      lower.includes('help me')
    );
    assert.ok(hasNonDevExclusion, 'Section must exclude explanation/understanding requests from intent detection');
  });
});

// ===========================================================================
// Group 11: Invisible Framework Principle (T37-T40)
// ===========================================================================

describe('Group 11: Invisible Framework Principle', () => {
  it('T37: Progress updates remain visible', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    const lower = wfSection.toLowerCase();
    const hasVisibility = containsAtLeast(
      wfSection,
      ['progress', 'visible', 'transition', 'quality'],
      2
    );
    assert.ok(hasVisibility, 'Section must clarify that progress/quality updates remain visible');
  });

  it('T38: Framework explainable on request', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    const lower = wfSection.toLowerCase();
    const hasDiscoverability = (
      lower.includes('asks about') ||
      (lower.includes('explain') && lower.includes('command')) ||
      lower.includes('not secret') ||
      lower.includes('asks how') ||
      lower.includes('if asked')
    );
    assert.ok(hasDiscoverability, 'Section must allow explaining slash commands when user asks');
  });

  it('T39: No framework jargon in consent example language', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    // If example consent messages exist (lines with quotes), verify "good" examples use user terms
    // "Bad example" lines are intentionally showing what NOT to do, so exclude them
    const lines = wfSection.split('\n');
    let inBadExampleBlock = false;
    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();
      // Track whether we are inside a "Bad examples" block (lines following a bad-example header
      // until the next heading, rules section, or blank line after list ends)
      if (trimmed.includes('bad example') || trimmed.includes('bad:')) {
        inBadExampleBlock = true;
        continue;
      }
      // A new heading, "Good example", or "Rules" section ends the bad-example block
      if (inBadExampleBlock && (trimmed.startsWith('#') || trimmed.includes('good example') || trimmed.startsWith('**rules'))) {
        inBadExampleBlock = false;
      }
      // Skip lines inside a bad-example block (they show what NOT to do)
      if (inBadExampleBlock) {
        continue;
      }
      // Skip lines explicitly about what not to do
      if (trimmed.includes('don\'t say') || trimmed.includes('do not say') || trimmed.startsWith('do not')) {
        continue;
      }
      // For "good example" lines or unmarked example quotes, check for /isdlc leakage
      const quotes = line.match(/"[^"]+"/g) || [];
      for (const example of quotes) {
        const lower = example.toLowerCase();
        if (lower.includes("i'll") || lower.includes('i will') || lower.includes('looks like')) {
          assert.ok(
            !lower.includes('/isdlc'),
            `Example consent message should not expose /isdlc to users: ${example}`
          );
        }
      }
    }
    // Test passes if no example messages found (no jargon by absence)
    assert.ok(true, 'Consent examples (if present) use user-friendly language');
  });

  it('T40: Section does not expose slash commands as primary interaction', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    const lower = wfSection.toLowerCase();
    // The section should NOT instruct Claude to "offer" or "suggest" slash commands to users
    // as the primary way to interact
    const offersSlashCommands = (
      lower.includes('offer the appropriate /isdlc command') ||
      lower.includes('suggest `/isdlc') ||
      lower.includes('offer `/isdlc')
    );
    assert.ok(
      !offersSlashCommands,
      'Section must NOT instruct offering slash commands as primary interaction'
    );
  });
});

// ===========================================================================
// Group 12: Template Consistency Integration Tests (T41-T43)
// ===========================================================================

describe('Group 12: Template Consistency', () => {
  it('T41: Workflow-First section present in both files', () => {
    assert.ok(
      claudeMd.includes('## Workflow-First Development'),
      'CLAUDE.md must have ## Workflow-First Development'
    );
    assert.ok(
      templateMd.includes('## Workflow-First Development'),
      'Template must have ## Workflow-First Development'
    );
  });

  it('T42: Intent detection content present in both files', () => {
    assert.ok(wfSection, 'CLAUDE.md Workflow-First section not found');
    assert.ok(wfSectionTemplate, 'Template Workflow-First section not found');

    const categories = ['feature', 'fix', 'upgrade', 'test run', 'test generate', 'discover'];
    for (const cat of categories) {
      assert.ok(
        wfSection.toLowerCase().includes(cat),
        `CLAUDE.md Workflow-First section missing intent category: ${cat}`
      );
      assert.ok(
        wfSectionTemplate.toLowerCase().includes(cat),
        `Template Workflow-First section missing intent category: ${cat}`
      );
    }
  });

  it('T43: Template Workflow-First section is subset of CLAUDE.md section', () => {
    assert.ok(wfSection, 'CLAUDE.md Workflow-First section not found');
    assert.ok(wfSectionTemplate, 'Template Workflow-First section not found');

    // Extract key content paragraphs from template (non-empty, non-heading lines)
    const templateLines = wfSectionTemplate
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 20 && !l.startsWith('#') && !l.startsWith('|--'));

    // At least 80% of template key lines should appear in CLAUDE.md section
    let matchCount = 0;
    for (const line of templateLines) {
      if (wfSection.includes(line)) {
        matchCount++;
      }
    }

    const matchRatio = templateLines.length > 0 ? matchCount / templateLines.length : 1;
    assert.ok(
      matchRatio >= 0.8,
      `Template content should be >= 80% contained in CLAUDE.md (got ${Math.round(matchRatio * 100)}%, ${matchCount}/${templateLines.length} lines matched)`
    );
  });
});

// ===========================================================================
// Group 13: Regression Tests -- Unchanged Sections (T44-T46)
// ===========================================================================

describe('Group 13: Regression -- Unchanged Sections', () => {
  it('T44: Agent Framework Context section unchanged', () => {
    assert.ok(
      claudeMd.includes('## Agent Framework Context'),
      'CLAUDE.md must have ## Agent Framework Context heading'
    );
    assert.ok(
      claudeMd.includes('### SKILL OBSERVABILITY Protocol'),
      'CLAUDE.md must have ### SKILL OBSERVABILITY Protocol subheading'
    );
    assert.ok(
      claudeMd.includes('### SUGGESTED PROMPTS'),
      'CLAUDE.md must have ### SUGGESTED PROMPTS subheading'
    );
    assert.ok(
      claudeMd.includes('### CONSTITUTIONAL PRINCIPLES'),
      'CLAUDE.md must have ### CONSTITUTIONAL PRINCIPLES subheading'
    );
  });

  it('T45: SKILL OBSERVABILITY content preserved', () => {
    assert.ok(
      claudeMd.includes('logged for visibility'),
      'CLAUDE.md SKILL OBSERVABILITY must contain "logged for visibility"'
    );
    assert.ok(
      claudeMd.includes('cross-phase-usage'),
      'CLAUDE.md SKILL OBSERVABILITY must contain "cross-phase-usage"'
    );
  });

  it('T46: SUGGESTED PROMPTS content preserved', () => {
    assert.ok(
      claudeMd.includes('SUGGESTED NEXT STEPS'),
      'CLAUDE.md must contain "SUGGESTED NEXT STEPS"'
    );
    assert.ok(
      claudeMd.includes('primary prompt'),
      'CLAUDE.md must contain "primary prompt"'
    );
  });
});

// ===========================================================================
// Group 14: NFR Validation (T47-T49)
// ===========================================================================

describe('Group 14: NFR Validation', () => {
  it('T47: All 6 mapping commands referenced', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    const commands = [
      '/isdlc feature',
      '/isdlc fix',
      '/isdlc upgrade',
      '/isdlc test run',
      '/isdlc test generate',
      '/discover',
    ];
    const found = commands.filter(cmd => wfSection.includes(cmd));
    assert.equal(
      found.length,
      6,
      `Expected all 6 commands referenced, found ${found.length}: ${found.join(', ')}. Missing: ${commands.filter(c => !found.includes(c)).join(', ')}`
    );
  });

  it('T48: Mapping table is consolidated (maintainability)', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    // Check for table format (pipe characters) or structured list with commands close together
    const hasTable = wfSection.includes('|') && wfSection.includes('/isdlc');

    // Alternative: check that all 6 commands appear within 20 lines of each other
    const lines = wfSection.split('\n');
    const commandLines = [];
    const commands = ['/isdlc feature', '/isdlc fix', '/isdlc upgrade', '/isdlc test run', '/isdlc test generate', '/discover'];
    for (let i = 0; i < lines.length; i++) {
      if (commands.some(cmd => lines[i].includes(cmd))) {
        commandLines.push(i);
      }
    }
    const isConsolidated = commandLines.length >= 6 &&
      (commandLines[commandLines.length - 1] - commandLines[0]) <= 20;

    assert.ok(
      hasTable || isConsolidated,
      'Commands must appear in a structured table or within 20 lines of each other'
    );
  });

  it('T49: All 6 intent categories have distinct signal words', () => {
    assert.ok(wfSection, 'Workflow-First section not found');
    // Each category should have at least 2 distinct signal words
    const categories = {
      feature: ['add', 'build', 'implement', 'create', 'feature', 'new'],
      fix: ['broken', 'fix', 'bug', 'crash', 'error', 'wrong', 'failing'],
      upgrade: ['upgrade', 'update', 'bump', 'version', 'dependency', 'migrate'],
      'test run': ['run tests', 'check tests', 'execute test', 'test suite', 'pass'],
      'test generate': ['write tests', 'add tests', 'generate test', 'test coverage', 'unit test'],
      discover: ['set up', 'configure', 'initialize', 'discover', 'setup'],
    };

    const lower = wfSection.toLowerCase();
    for (const [category, keywords] of Object.entries(categories)) {
      const found = keywords.filter(kw => lower.includes(kw));
      assert.ok(
        found.length >= 2,
        `Category "${category}" must have at least 2 signal words present (found ${found.length}: ${found.join(', ')})`
      );
    }
  });
});

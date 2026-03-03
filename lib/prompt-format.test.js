/**
 * prompt-format.test.js — Structural validation of SUGGESTED PROMPTS sections
 * across all 40 agent markdown files.
 *
 * REQ-0003-suggested-prompts: Framework-controlled suggested prompts
 * 39 test cases covering: section presence, format compliance, tier order,
 * dynamic resolution, ASCII compliance, sub-agent minimal format, and more.
 *
 * @module prompt-format.test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const AGENTS_DIR = join(__dirname, '..', 'src', 'claude', 'agents');

// ---------------------------------------------------------------------------
// Agent Classification
// ---------------------------------------------------------------------------

const PHASE_AGENTS = [
  '01-requirements-analyst.md',
  '02-solution-architect.md',
  '03-system-designer.md',
  '04-test-design-engineer.md',
  '05-software-developer.md',
  '06-integration-tester.md',
  '07-qa-engineer.md',
  '08-security-compliance-auditor.md',
  '09-cicd-engineer.md',
  '10-dev-environment-engineer.md',
  '11-deployment-engineer-staging.md',
  '12-release-manager.md',
  '13-site-reliability-engineer.md',
  '14-upgrade-engineer.md',
  join('quick-scan', 'quick-scan-agent.md'),
];

const ORCHESTRATOR = '00-sdlc-orchestrator.md';

const SUB_ORCHESTRATORS = [
  join('impact-analysis', 'impact-analysis-orchestrator.md'),
  join('tracing', 'tracing-orchestrator.md'),
  'discover-orchestrator.md',
];

const SUB_AGENTS = [
  join('discover', 'architecture-analyzer.md'),
  join('discover', 'test-evaluator.md'),
  join('discover', 'constitution-generator.md'),
  join('discover', 'skills-researcher.md'),
  join('discover', 'data-model-analyzer.md'),
  join('discover', 'product-analyst.md'),
  join('discover', 'architecture-designer.md'),
  join('discover', 'feature-mapper.md'),
  join('discover', 'characterization-test-generator.md'),
  join('discover', 'artifact-integration.md'),
  join('discover', 'atdd-bridge.md'),
  join('discover', 'domain-researcher.md'),
  join('discover', 'technical-scout.md'),
  join('discover', 'solution-architect-party.md'),
  join('discover', 'security-advisor.md'),
  join('discover', 'devops-pragmatist.md'),
  join('discover', 'data-model-designer.md'),
  join('discover', 'test-strategist.md'),
  join('discover', 'security-auditor.md'),
  join('discover', 'technical-debt-auditor.md'),
  join('discover', 'performance-analyst.md'),
  join('discover', 'ops-readiness-reviewer.md'),
  join('impact-analysis', 'impact-analyzer.md'),
  join('impact-analysis', 'entry-point-finder.md'),
  join('impact-analysis', 'risk-assessor.md'),
  join('tracing', 'symptom-analyzer.md'),
  join('tracing', 'execution-path-tracer.md'),
  join('tracing', 'root-cause-identifier.md'),
];

// Agents that don't follow the SUGGESTED PROMPTS protocol pattern (debate-loop
// critics/refiners, persona agents, roundtable orchestrator, skill-manager, etc.)
const OTHER_AGENTS = [
  '01-requirements-critic.md',
  '01-requirements-refiner.md',
  '02-architecture-critic.md',
  '02-architecture-refiner.md',
  '03-design-critic.md',
  '03-design-refiner.md',
  '04-test-strategy-critic.md',
  '04-test-strategy-refiner.md',
  '05-implementation-reviewer.md',
  '05-implementation-updater.md',
  '16-quality-loop-engineer.md',
  join('impact-analysis', 'cross-validation-verifier.md'),
  'persona-business-analyst.md',
  'persona-solutions-architect.md',
  'persona-system-designer.md',
  'roundtable-analyst.md',
  'skill-manager.md',
];

const ALL_AGENTS = [ORCHESTRATOR, ...SUB_ORCHESTRATORS, ...PHASE_AGENTS, ...SUB_AGENTS, ...OTHER_AGENTS];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readAgent(relPath) {
  return readFileSync(join(AGENTS_DIR, relPath), 'utf-8');
}

/**
 * Extract content of the SUGGESTED PROMPTS section from a file.
 * Returns null if not found.
 * Stops at the next top-level `# ` heading, or at the closing motivational
 * line (a non-blank, non-heading line that follows a blank line after the
 * last `---` delimiter).
 */
function extractSuggestedPromptsSection(content) {
  const marker = '# SUGGESTED PROMPTS';
  const idx = content.indexOf(marker);
  if (idx === -1) return null;
  // Find the next top-level heading (# at start of line) after our section
  const rest = content.slice(idx + marker.length);
  const nextH1 = rest.search(/\n# [A-Z]/);
  let section = nextH1 === -1 ? rest : rest.slice(0, nextH1);
  // Trim any trailing motivational line (non-empty line after a blank line
  // that follows the last --- block). We detect this by finding the last
  // "---" and removing any content after the blank line that follows it.
  const lastDash = section.lastIndexOf('\n---');
  if (lastDash !== -1) {
    const afterDash = section.slice(lastDash + 4); // after "---"
    // If there's trailing content after a blank line, trim it
    const trailingMatch = afterDash.match(/\n\n.+$/s);
    if (trailingMatch) {
      section = section.slice(0, lastDash + 4 + trailingMatch.index);
    }
  }
  return section;
}

/**
 * Extract content of the PROMPT EMISSION PROTOCOL section from orchestrator.
 * Returns null if not found.
 */
function extractEmissionProtocol(content) {
  const marker = '# PROMPT EMISSION PROTOCOL';
  const idx = content.indexOf(marker);
  if (idx === -1) return null;
  const rest = content.slice(idx + marker.length);
  const nextH1 = rest.search(/\n# [A-Z]/);
  if (nextH1 === -1) return rest;
  return rest.slice(0, nextH1);
}

/**
 * Collect all .md files under AGENTS_DIR recursively, returning relative paths.
 */
function collectAgentFiles(dir, base) {
  base = base || dir;
  let results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(collectAgentFiles(full, base));
    } else if (entry.endsWith('.md')) {
      results.push(relative(base, full));
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// TC-13: Agent Inventory (Meta)
// ---------------------------------------------------------------------------

describe('TC-13: Agent Inventory', () => {
  it('TC-13-01: Exactly 64 agent markdown files exist', () => {
    const files = collectAgentFiles(AGENTS_DIR);
    assert.equal(files.length, 64, `Expected 64 agent files, found ${files.length}: ${files.join(', ')}`);
  });

  it('TC-13-02: Classification counts match expected (1 orch + 3 sub-orch + 15 phase + 28 sub + 17 other = 64)', () => {
    assert.equal(PHASE_AGENTS.length, 15, 'Phase agents');
    assert.equal(SUB_ORCHESTRATORS.length, 3, 'Sub-orchestrators');
    assert.equal(SUB_AGENTS.length, 28, 'Sub-agents');
    assert.equal(OTHER_AGENTS.length, 17, 'Other agents');
    // Orchestrator is 1 file
    const total = 1 + SUB_ORCHESTRATORS.length + PHASE_AGENTS.length + SUB_AGENTS.length + OTHER_AGENTS.length;
    assert.equal(total, 64);
  });
});

// ---------------------------------------------------------------------------
// TC-01: Section Presence (VR-001)
// ---------------------------------------------------------------------------

describe('TC-01: Section Presence', () => {
  it('TC-01-01: All 43 agent files exist and are readable', () => {
    for (const agent of ALL_AGENTS) {
      const content = readAgent(agent);
      assert.ok(content.length > 0, `${agent} should be readable and non-empty`);
    }
  });

  it('TC-01-02: All 15 phase agents have # SUGGESTED PROMPTS section', () => {
    for (const agent of PHASE_AGENTS) {
      const content = readAgent(agent);
      assert.ok(content.includes('# SUGGESTED PROMPTS'), `${agent} missing # SUGGESTED PROMPTS`);
    }
  });

  it('TC-01-03: All 24 sub-agents have # SUGGESTED PROMPTS section', () => {
    for (const agent of SUB_AGENTS) {
      const content = readAgent(agent);
      assert.ok(content.includes('# SUGGESTED PROMPTS'), `${agent} missing # SUGGESTED PROMPTS`);
    }
  });

  it('TC-01-04: Orchestrator has # PROMPT EMISSION PROTOCOL section', () => {
    const content = readAgent(ORCHESTRATOR);
    assert.ok(content.includes('# PROMPT EMISSION PROTOCOL'), 'Orchestrator missing # PROMPT EMISSION PROTOCOL');
  });
});

// ---------------------------------------------------------------------------
// TC-02: Phase Agent Format (VR-002, VR-014)
// ---------------------------------------------------------------------------

describe('TC-02: Phase Agent Format', () => {
  it('TC-02-01: Phase agents reference CLAUDE.md protocol', () => {
    for (const agent of PHASE_AGENTS) {
      const section = extractSuggestedPromptsSection(readAgent(agent));
      assert.ok(section, `${agent} has no SUGGESTED PROMPTS section`);
      assert.ok(section.includes('CLAUDE.md'), `${agent} missing CLAUDE.md reference`);
    }
  });

  it('TC-02-02: Phase agents have Agent-specific [2] option', () => {
    for (const agent of PHASE_AGENTS) {
      const section = extractSuggestedPromptsSection(readAgent(agent));
      assert.ok(section, `${agent} has no SUGGESTED PROMPTS section`);
      assert.ok(section.includes('Agent-specific [2] option'), `${agent} missing Agent-specific [2] option`);
    }
  });

  it('TC-02-03: Phase agents follow compact CLAUDE.md reference format', () => {
    for (const agent of PHASE_AGENTS) {
      const section = extractSuggestedPromptsSection(readAgent(agent));
      assert.ok(section, `${agent} has no SUGGESTED PROMPTS section`);
      assert.ok(section.includes('Follow the SUGGESTED PROMPTS'), `${agent} missing Follow reference`);
    }
  });

  it('TC-02-04: Phase agents have protocol and agent-specific content', () => {
    for (const agent of PHASE_AGENTS) {
      const section = extractSuggestedPromptsSection(readAgent(agent));
      assert.ok(section, `${agent} has no SUGGESTED PROMPTS section`);
      assert.ok(section.includes('Phase Agent Protocol'), `${agent} missing Phase Agent Protocol reference`);
    }
  });

  it('TC-02-05: Phase agents have [2] with backtick-quoted option text', () => {
    for (const agent of PHASE_AGENTS) {
      const section = extractSuggestedPromptsSection(readAgent(agent));
      assert.ok(section, `${agent} has no SUGGESTED PROMPTS section`);
      assert.ok(section.includes('[2]'), `${agent} missing [2]`);
      assert.ok(section.includes('`'), `${agent} missing backtick-quoted option`);
    }
  });

  it('TC-02-06: SUGGESTED PROMPTS appears after SELF-VALIDATION (when both present)', () => {
    for (const agent of PHASE_AGENTS) {
      const content = readAgent(agent);
      const selfValIdx = content.indexOf('# SELF-VALIDATION');
      const suggestedIdx = content.indexOf('# SUGGESTED PROMPTS');
      if (selfValIdx !== -1 && suggestedIdx !== -1) {
        assert.ok(selfValIdx < suggestedIdx, `${agent}: SELF-VALIDATION (${selfValIdx}) should come before SUGGESTED PROMPTS (${suggestedIdx})`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// TC-03: Sub-Agent Format (VR-003)
// ---------------------------------------------------------------------------

describe('TC-03: Sub-Agent Format', () => {
  it('TC-03-01: Sub-agents have STATUS: in prompt section', () => {
    for (const agent of SUB_AGENTS) {
      const section = extractSuggestedPromptsSection(readAgent(agent));
      assert.ok(section, `${agent} has no SUGGESTED PROMPTS section`);
      assert.ok(section.includes('STATUS:'), `${agent} missing STATUS:`);
    }
  });

  it('TC-03-02: Sub-agents do NOT have [1] items', () => {
    for (const agent of SUB_AGENTS) {
      const section = extractSuggestedPromptsSection(readAgent(agent));
      assert.ok(section, `${agent} has no SUGGESTED PROMPTS section`);
      // Check that no numbered item references appear in the output format
      // (they may appear in explanatory text about what NOT to do, so we check
      //  only in the Output Format subsection)
      const outputIdx = section.indexOf('## Output Format');
      if (outputIdx !== -1) {
        const outputSection = section.slice(outputIdx);
        assert.ok(!outputSection.includes('  [1]'), `${agent} should not have [1] in Output Format`);
        assert.ok(!outputSection.includes('  [2]'), `${agent} should not have [2] in Output Format`);
        assert.ok(!outputSection.includes('  [3]'), `${agent} should not have [3] in Output Format`);
      }
    }
  });

  it('TC-03-03: Sub-agents do NOT have SUGGESTED NEXT STEPS: in output', () => {
    for (const agent of SUB_AGENTS) {
      const section = extractSuggestedPromptsSection(readAgent(agent));
      assert.ok(section, `${agent} has no SUGGESTED PROMPTS section`);
      const outputIdx = section.indexOf('## Output Format');
      if (outputIdx !== -1) {
        const outputSection = section.slice(outputIdx);
        assert.ok(!outputSection.includes('SUGGESTED NEXT STEPS:'), `${agent} should not have SUGGESTED NEXT STEPS in output`);
      }
    }
  });

  it('TC-03-04: Sub-agents reference their parent orchestrator', () => {
    for (const agent of SUB_AGENTS) {
      const section = extractSuggestedPromptsSection(readAgent(agent));
      assert.ok(section, `${agent} has no SUGGESTED PROMPTS section`);
      assert.ok(section.includes('Returning results to'), `${agent} missing "Returning results to" in STATUS`);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-04: Sub-Orchestrator Format (VR-004)
// ---------------------------------------------------------------------------

describe('TC-04: Sub-Orchestrator Format', () => {
  it('TC-04-01: Sub-orchestrators have SUGGESTED PROMPTS content', () => {
    for (const agent of SUB_ORCHESTRATORS) {
      const section = extractSuggestedPromptsSection(readAgent(agent));
      assert.ok(section, `${agent} has no SUGGESTED PROMPTS section`);
      // Sub-orchestrators either have full SUGGESTED NEXT STEPS or CLAUDE.md reference
      assert.ok(
        section.includes('SUGGESTED NEXT STEPS:') || section.includes('CLAUDE.md'),
        `${agent} missing SUGGESTED NEXT STEPS or CLAUDE.md reference`
      );
    }
  });

  it('TC-04-02: Sub-orchestrators have prompt items or CLAUDE.md reference', () => {
    for (const agent of SUB_ORCHESTRATORS) {
      const section = extractSuggestedPromptsSection(readAgent(agent));
      assert.ok(section, `${agent} has no SUGGESTED PROMPTS section`);
      // Either direct [1],[2],[3] or CLAUDE.md delegation
      assert.ok(
        (section.includes('[1]') && section.includes('[2]')) || section.includes('CLAUDE.md'),
        `${agent} missing [1]/[2] items or CLAUDE.md reference`
      );
    }
  });

  it('TC-04-03: Sub-orchestrators do NOT use STATUS format as output', () => {
    for (const agent of SUB_ORCHESTRATORS) {
      const section = extractSuggestedPromptsSection(readAgent(agent));
      assert.ok(section, `${agent} has no SUGGESTED PROMPTS section`);
      const outputIdx = section.indexOf('## Output Format');
      if (outputIdx !== -1) {
        const outputSection = section.slice(outputIdx);
        // STATUS: should not appear as the output pattern
        assert.ok(!outputSection.includes('STATUS:'), `${agent} should not use STATUS format in Output Format`);
      }
    }
  });

  it('TC-04-04: Discover orchestrator uses static prompts (no Resolution Logic)', () => {
    const section = extractSuggestedPromptsSection(readAgent('discover-orchestrator.md'));
    assert.ok(section, 'discover-orchestrator has no SUGGESTED PROMPTS section');
    assert.ok(!section.includes('## Resolution Logic'), 'discover-orchestrator should NOT have Resolution Logic (static prompts)');
  });
});

// ---------------------------------------------------------------------------
// TC-05: Orchestrator Emission Points (VR-005)
// ---------------------------------------------------------------------------

describe('TC-05: Orchestrator Emission Points', () => {
  it('TC-05-01: Orchestrator has PROMPT EMISSION PROTOCOL section', () => {
    const content = readAgent(ORCHESTRATOR);
    assert.ok(content.includes('# PROMPT EMISSION PROTOCOL'));
  });

  it('TC-05-02: Orchestrator defines 5 emission points', () => {
    const section = extractEmissionProtocol(readAgent(ORCHESTRATOR));
    assert.ok(section, 'No PROMPT EMISSION PROTOCOL section found');
    // Compressed format uses numbered bold items: **Workflow Init**, **Gate Pass**, etc.
    // or ### N. subsections (original format)
    const subsections = section.match(/### \d+\./g);
    const boldItems = section.match(/\*\*\d+\.\s/g) || section.match(/\d+\.\s\*\*/g);
    assert.ok(subsections || boldItems, 'No numbered emission points found');
    const count = subsections ? subsections.length : boldItems ? boldItems.length : 0;
    assert.equal(count, 5, `Expected 5 emission points, found ${count}`);
  });

  it('TC-05-03: Emission protocol contains [1] items', () => {
    const section = extractEmissionProtocol(readAgent(ORCHESTRATOR));
    assert.ok(section, 'No PROMPT EMISSION PROTOCOL section found');
    // At least some [1] references across the emission points
    const matches = section.match(/\[1\]/g);
    assert.ok(matches && matches.length >= 3, `Expected at least 3 [1] references, found ${matches ? matches.length : 0}`);
  });

  it('TC-05-04: All 5 lifecycle moments present', () => {
    const section = extractEmissionProtocol(readAgent(ORCHESTRATOR));
    assert.ok(section, 'No PROMPT EMISSION PROTOCOL section found');
    // Compressed format uses shorter names
    const requiredKeywords = [
      ['Workflow Init', 'Workflow Initialization'],
      ['Gate Pass', 'Gate Passage'],
      ['Gate Fail', 'Gate Failure'],
      ['Blocker', 'Escalation'],
      ['Workflow Complete', 'Workflow Completion'],
    ];
    for (const variants of requiredKeywords) {
      const found = variants.some(kw => section.includes(kw));
      assert.ok(found, `Missing lifecycle keyword: "${variants.join('" or "')}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-06: ASCII Compliance (VR-006)
// ---------------------------------------------------------------------------

describe('TC-06: ASCII Compliance', () => {
  it('TC-06-01: No non-ASCII characters in SUGGESTED PROMPTS (except emdash in CLAUDE.md ref)', () => {
    const allAgentsWithPrompts = [...PHASE_AGENTS, ...SUB_ORCHESTRATORS, ...SUB_AGENTS];
    for (const agent of allAgentsWithPrompts) {
      const section = extractSuggestedPromptsSection(readAgent(agent));
      if (!section) continue;
      for (let i = 0; i < section.length; i++) {
        const code = section.charCodeAt(i);
        // Allow emdash (U+2014) in "SUGGESTED PROMPTS — Phase Agent Protocol" reference
        if (code === 0x2014) continue;
        assert.ok(code <= 0x7F, `${agent}: non-ASCII character at position ${i} (code: ${code}, char: "${section[i]}")`);
      }
    }
  });

  it('TC-06-02: No emoji in prompt sections', () => {
    // Common emoji ranges
    const emojiPattern = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}]/u;
    const allAgentsWithPrompts = [...PHASE_AGENTS, ...SUB_ORCHESTRATORS, ...SUB_AGENTS];
    for (const agent of allAgentsWithPrompts) {
      const section = extractSuggestedPromptsSection(readAgent(agent));
      if (!section) continue;
      assert.ok(!emojiPattern.test(section), `${agent}: emoji found in SUGGESTED PROMPTS section`);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-07: Dynamic Resolution (VR-007)
// ---------------------------------------------------------------------------

describe('TC-07: Dynamic Resolution', () => {
  it('TC-07-01: Phase agents use dynamic placeholder in [1], not hardcoded phase names', () => {
    for (const agent of PHASE_AGENTS) {
      const section = extractSuggestedPromptsSection(readAgent(agent));
      assert.ok(section, `${agent} missing SUGGESTED PROMPTS`);
      // The Output Format should reference a placeholder, not a literal "Phase NN - Name"
      const outputIdx = section.indexOf('## Output Format');
      if (outputIdx !== -1) {
        const outputSection = section.slice(outputIdx);
        // Should have {primary_prompt} or similar dynamic reference
        assert.ok(
          outputSection.includes('{primary_prompt}') || outputSection.includes('{display_name}'),
          `${agent}: Output Format [1] should use a dynamic placeholder, not hardcoded phase name`
        );
      }
    }
  });

  it('TC-07-02: Sub-orchestrators reference CLAUDE.md protocol for dynamic resolution', () => {
    // IA orchestrator and Tracing orchestrator now delegate to CLAUDE.md
    const dynamicSubOrchs = [
      join('impact-analysis', 'impact-analysis-orchestrator.md'),
      join('tracing', 'tracing-orchestrator.md'),
    ];
    for (const agent of dynamicSubOrchs) {
      const section = extractSuggestedPromptsSection(readAgent(agent));
      assert.ok(section, `${agent} missing SUGGESTED PROMPTS`);
      assert.ok(
        section.includes('CLAUDE.md') || section.includes('## Resolution Logic'),
        `${agent} should reference CLAUDE.md or have Resolution Logic`
      );
    }
  });

  it('TC-07-03: Discover orchestrator uses static prompts (exception)', () => {
    const section = extractSuggestedPromptsSection(readAgent('discover-orchestrator.md'));
    assert.ok(section, 'discover-orchestrator missing SUGGESTED PROMPTS');
    // Static prompts are allowed -- no dynamic resolution requirement
    assert.ok(!section.includes('## Resolution Logic'), 'discover-orchestrator should use static prompts');
    // Should contain actual static text
    assert.ok(section.includes('/sdlc feature') || section.includes('Start a new feature'), 'discover-orchestrator should have static prompt text');
  });
});

// ---------------------------------------------------------------------------
// TC-08: Prompt Tier Order (VR-008)
// ---------------------------------------------------------------------------

describe('TC-08: Prompt Tier Order', () => {
  it('TC-08-01: [1] is the primary action (advance or complete) in all canonical prompt blocks', () => {
    const canonicalAgents = [...PHASE_AGENTS, ...SUB_ORCHESTRATORS.filter(a => a !== 'discover-orchestrator.md')];
    for (const agent of canonicalAgents) {
      const section = extractSuggestedPromptsSection(readAgent(agent));
      assert.ok(section, `${agent} missing SUGGESTED PROMPTS`);
      // The [1] in the Output Format should reference primary_prompt or Continue
      const outputIdx = section.indexOf('## Output Format');
      if (outputIdx !== -1) {
        const outputSection = section.slice(outputIdx);
        const item1Match = outputSection.match(/\[1\]\s+(.+)/);
        assert.ok(item1Match, `${agent}: no [1] item found in Output Format`);
        const item1Text = item1Match[1];
        assert.ok(
          item1Text.includes('{primary_prompt}') || item1Text.includes('Continue') || item1Text.includes('Complete'),
          `${agent}: [1] should be primary action (advance/complete), got: "${item1Text}"`
        );
      }
    }
  });

  it('TC-08-02: Last [N] is the utility action (status)', () => {
    const canonicalAgents = [...PHASE_AGENTS, ...SUB_ORCHESTRATORS.filter(a => a !== 'discover-orchestrator.md')];
    for (const agent of canonicalAgents) {
      const section = extractSuggestedPromptsSection(readAgent(agent));
      assert.ok(section, `${agent} missing SUGGESTED PROMPTS`);
      const outputIdx = section.indexOf('## Output Format');
      if (outputIdx !== -1) {
        // Only examine the Output Format section up to Fallback (if present)
        const fallbackIdx = section.indexOf('## Fallback', outputIdx);
        const outputSection = fallbackIdx !== -1
          ? section.slice(outputIdx, fallbackIdx)
          : section.slice(outputIdx);
        // Find all [N] items in the main output block
        const items = outputSection.match(/\[(\d+)\]\s+(.+)/g);
        if (items && items.length > 0) {
          const lastItem = items[items.length - 1];
          assert.ok(
            lastItem.toLowerCase().includes('status'),
            `${agent}: last item should contain "status", got: "${lastItem}"`
          );
        }
      }
    }
  });

  it('TC-08-03: Items are sequential with no gaps', () => {
    const canonicalAgents = [...PHASE_AGENTS, ...SUB_ORCHESTRATORS];
    for (const agent of canonicalAgents) {
      const section = extractSuggestedPromptsSection(readAgent(agent));
      assert.ok(section, `${agent} missing SUGGESTED PROMPTS`);
      const outputIdx = section.indexOf('## Output Format');
      if (outputIdx !== -1) {
        const outputSection = section.slice(outputIdx);
        // Find first block of sequential [N] items
        const numbers = [];
        const matches = outputSection.matchAll(/\[(\d+)\]/g);
        for (const m of matches) {
          const n = parseInt(m[1], 10);
          if (numbers.length === 0 || n === numbers[numbers.length - 1] + 1) {
            numbers.push(n);
          } else if (n <= numbers[numbers.length - 1]) {
            // Might be in the fallback section, restart
            break;
          }
        }
        if (numbers.length > 0) {
          assert.equal(numbers[0], 1, `${agent}: items should start at [1]`);
          for (let i = 1; i < numbers.length; i++) {
            assert.equal(numbers[i], numbers[i - 1] + 1, `${agent}: gap in item numbering at [${numbers[i]}]`);
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// TC-09: Fallback Presence (VR-009)
// ---------------------------------------------------------------------------

describe('TC-09: Fallback Presence', () => {
  it('TC-09-01: Phase agents delegate Fallback to CLAUDE.md protocol', () => {
    const agentsWithFallback = [
      ...PHASE_AGENTS,
      join('impact-analysis', 'impact-analysis-orchestrator.md'),
      join('tracing', 'tracing-orchestrator.md'),
    ];
    for (const agent of agentsWithFallback) {
      const section = extractSuggestedPromptsSection(readAgent(agent));
      assert.ok(section, `${agent} missing SUGGESTED PROMPTS`);
      // Fallback is now in CLAUDE.md protocol, agents reference it
      assert.ok(
        section.includes('Fallback') || section.includes('CLAUDE.md'),
        `${agent} missing Fallback section or CLAUDE.md reference`
      );
    }
  });

  it('TC-09-02: CLAUDE.md contains Fallback with "Show project status"', () => {
    // Fallback is now centralized in CLAUDE.md
    const claudeMd = readFileSync(resolve(AGENTS_DIR, '..', '..', '..', 'CLAUDE.md'), 'utf-8');
    assert.ok(claudeMd.includes('Show project status'), 'CLAUDE.md Fallback missing "Show project status"');
  });

  it('TC-09-03: CLAUDE.md contains Fallback with "Start a new workflow"', () => {
    // Fallback is now centralized in CLAUDE.md
    const claudeMd = readFileSync(resolve(AGENTS_DIR, '..', '..', '..', 'CLAUDE.md'), 'utf-8');
    assert.ok(claudeMd.includes('Start a new workflow'), 'CLAUDE.md Fallback missing "Start a new workflow"');
  });
});

// ---------------------------------------------------------------------------
// TC-10: Agent 01 Interactive Exception (VR-010)
// ---------------------------------------------------------------------------

describe('TC-10: Agent 01 Interactive Exception', () => {
  it('TC-10-01: Agent 01 references CLAUDE.md protocol (interactive rules are centralized)', () => {
    const section = extractSuggestedPromptsSection(readAgent('01-requirements-analyst.md'));
    assert.ok(section, 'Agent 01 missing SUGGESTED PROMPTS section');
    // Interactive pause rules are now part of the CLAUDE.md protocol
    assert.ok(section.includes('CLAUDE.md'), 'Agent 01 missing CLAUDE.md reference');
  });

  it('TC-10-02: Agent 01 has SUGGESTED PROMPTS section with agent-specific option', () => {
    const section = extractSuggestedPromptsSection(readAgent('01-requirements-analyst.md'));
    assert.ok(section, 'Agent 01 missing SUGGESTED PROMPTS section');
    assert.ok(
      section.includes('Agent-specific [2] option') || section.includes('Review requirements'),
      'Agent 01 missing agent-specific option'
    );
  });
});

// ---------------------------------------------------------------------------
// TC-11: State Schema (VR-011)
// ---------------------------------------------------------------------------

describe('TC-11: State Schema', () => {
  it('TC-11-01: No agent file writes prompt data to state.json', () => {
    // Check that SUGGESTED PROMPTS sections don't contain state.json write instructions
    // for prompt data specifically
    const allAgentsWithPrompts = [...PHASE_AGENTS, ...SUB_ORCHESTRATORS, ...SUB_AGENTS];
    for (const agent of allAgentsWithPrompts) {
      const section = extractSuggestedPromptsSection(readAgent(agent));
      if (!section) continue;
      // Should not contain patterns suggesting writing prompt data to state
      assert.ok(
        !section.includes('write prompt') && !section.includes('save prompt') && !section.includes('"suggested_prompts"'),
        `${agent}: SUGGESTED PROMPTS section should not write prompt data to state.json`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// TC-12: No New Dependencies (VR-013)
// ---------------------------------------------------------------------------

describe('TC-12: No New Dependencies', () => {
  it('TC-12-01: package.json dependency count unchanged (4 deps, 0 devDeps)', () => {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const depCount = Object.keys(pkg.dependencies || {}).length;
    const devDepCount = Object.keys(pkg.devDependencies || {}).length;
    assert.equal(depCount, 4, `Expected 4 dependencies, found ${depCount}`);
    assert.equal(devDepCount, 0, `Expected 0 devDependencies, found ${devDepCount}`);
  });
});

// ---------------------------------------------------------------------------
// Party Mode Structural Checks (REQ-0006)
// ---------------------------------------------------------------------------

const EXPECTED_NEW_PARTY_AGENTS = [
  join('discover', 'domain-researcher.md'),
  join('discover', 'technical-scout.md'),
  join('discover', 'solution-architect-party.md'),
  join('discover', 'security-advisor.md'),
  join('discover', 'devops-pragmatist.md'),
  join('discover', 'data-model-designer.md'),
  join('discover', 'test-strategist.md'),
];

describe('Party Mode Structural Checks (REQ-0006)', () => {

  // TC-019: All 7 new agent files exist
  it('TC-019: all 7 new party mode agent files exist', () => {
    for (const agentPath of EXPECTED_NEW_PARTY_AGENTS) {
      const fullPath = join(AGENTS_DIR, agentPath);
      const content = readFileSync(fullPath, 'utf-8');
      assert.ok(content.length > 0, `Agent file empty or missing: ${agentPath}`);
    }
  });

  // TC-020: Each new agent has valid YAML frontmatter with required fields
  it('TC-020: each new agent has valid YAML frontmatter', () => {
    for (const agentPath of EXPECTED_NEW_PARTY_AGENTS) {
      const content = readAgent(agentPath);
      assert.ok(
        content.startsWith('---'),
        `${agentPath}: missing YAML frontmatter delimiter`
      );
      const endIndex = content.indexOf('---', 3);
      assert.ok(
        endIndex > 3,
        `${agentPath}: missing closing YAML frontmatter delimiter`
      );
      const frontmatter = content.slice(3, endIndex);
      assert.ok(
        frontmatter.includes('name:'),
        `${agentPath}: frontmatter missing 'name' field`
      );
      assert.ok(
        frontmatter.includes('description:'),
        `${agentPath}: frontmatter missing 'description' field`
      );
      assert.ok(
        frontmatter.includes('model:'),
        `${agentPath}: frontmatter missing 'model' field`
      );
    }
  });

  // TC-021: Frontmatter name matches party-personas.json agent_type
  it('TC-021: frontmatter name matches party-personas agent_type', () => {
    const personasPath = join(AGENTS_DIR, 'discover', 'party-personas.json');
    const personas = JSON.parse(readFileSync(personasPath, 'utf-8'));
    const agentTypes = Object.values(personas.personas).map(p => p.agent_type);

    for (const agentPath of EXPECTED_NEW_PARTY_AGENTS) {
      const content = readAgent(agentPath);
      const frontmatter = content.slice(3, content.indexOf('---', 3));
      const nameMatch = frontmatter.match(/name:\s*["']?([^\s"'\n]+)/);
      assert.ok(nameMatch, `${agentPath}: could not extract name from frontmatter`);
      const name = nameMatch[1];
      assert.ok(
        agentTypes.includes(name),
        `${agentPath}: name "${name}" not found in party-personas.json agent_types`
      );
    }
  });

  // TC-022: Each new agent has SUGGESTED PROMPTS section
  it('TC-022: each new agent has SUGGESTED PROMPTS section', () => {
    for (const agentPath of EXPECTED_NEW_PARTY_AGENTS) {
      const content = readAgent(agentPath);
      assert.ok(
        content.includes('# SUGGESTED PROMPTS'),
        `${agentPath}: missing SUGGESTED PROMPTS section`
      );
    }
  });

  // TC-023: Each new agent has Role section
  it('TC-023: each new agent has Role section', () => {
    for (const agentPath of EXPECTED_NEW_PARTY_AGENTS) {
      const content = readAgent(agentPath);
      assert.ok(
        content.includes('## Role'),
        `${agentPath}: missing Role section`
      );
    }
  });

  // TC-024: Each new agent has Process or Communication Protocol section
  it('TC-024: each new agent has Process or Communication Protocol section', () => {
    for (const agentPath of EXPECTED_NEW_PARTY_AGENTS) {
      const content = readAgent(agentPath);
      assert.ok(
        content.includes('## Process') || content.includes('## Communication Protocol'),
        `${agentPath}: missing Process or Communication Protocol section`
      );
    }
  });

  // TC-025: discover-orchestrator.md contains DEEP DISCOVERY FLOW section (REQ-0007)
  it('TC-025: discover-orchestrator.md contains DEEP DISCOVERY FLOW section', () => {
    const orchestratorPath = join(AGENTS_DIR, 'discover-orchestrator.md');
    const content = readFileSync(orchestratorPath, 'utf-8');
    assert.ok(
      content.includes('## DEEP DISCOVERY FLOW'),
      'discover-orchestrator.md missing DEEP DISCOVERY FLOW section'
    );
  });

  // TC-026: discover-orchestrator.md contains Depth Level Resolution step (REQ-0007)
  it('TC-026: discover-orchestrator.md contains Step 0 Depth Level Resolution', () => {
    const orchestratorPath = join(AGENTS_DIR, 'discover-orchestrator.md');
    const content = readFileSync(orchestratorPath, 'utf-8');
    assert.ok(
      content.includes('### Step 0: Depth Level Resolution'),
      'discover-orchestrator.md missing Step 0: Depth Level Resolution'
    );
  });

  // TC-027: discover.md has --deep and --verbose flags (REQ-0007)
  it('TC-027: discover.md has --deep and --verbose flag entries', () => {
    const discoverPath = join(AGENTS_DIR, '..', 'commands', 'discover.md');
    const content = readFileSync(discoverPath, 'utf-8');
    assert.ok(content.includes('--deep'), 'discover.md missing --deep flag');
    assert.ok(content.includes('--verbose'), 'discover.md missing --verbose flag');
  });

  // TC-028: discover.md has --deep usage examples (REQ-0007)
  it('TC-028: discover.md has --deep usage examples', () => {
    const discoverPath = join(AGENTS_DIR, '..', 'commands', 'discover.md');
    const content = readFileSync(discoverPath, 'utf-8');
    assert.ok(
      content.includes('/discover --deep full'),
      'discover.md missing --deep full example'
    );
    assert.ok(
      content.includes('/discover --deep standard'),
      'discover.md missing --deep standard example'
    );
  });
});

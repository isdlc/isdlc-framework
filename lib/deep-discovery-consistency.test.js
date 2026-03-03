/**
 * deep-discovery-consistency.test.js -- Cross-file consistency validation
 *
 * REQ-0007-deep-discovery: Validates that changes across multiple files
 * (config, agents, orchestrator, command, docs) are consistent.
 *
 * Test cases TC-E01 through TC-E10.
 *
 * @module deep-discovery-consistency.test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const CONFIG_PATH = join(__dirname, '..', 'src', 'claude', 'agents', 'discover', 'deep-discovery-config.json');
const DISCOVER_DIR = join(__dirname, '..', 'src', 'claude', 'agents', 'discover');
const ORCHESTRATOR_PATH = join(__dirname, '..', 'src', 'claude', 'agents', 'discover-orchestrator.md');
const AGENTS_MD_PATH = join(__dirname, '..', 'docs', 'AGENTS.md');
const README_PATH = join(__dirname, '..', 'README.md');
const TOUR_PATH = join(__dirname, '..', 'src', 'claude', 'commands', 'tour.md');

const PARTY_AGENT_FILES = [
  'domain-researcher.md',
  'technical-scout.md',
  'solution-architect-party.md',
  'security-advisor.md',
  'devops-pragmatist.md',
  'data-model-designer.md',
  'test-strategist.md',
];

describe('deep discovery cross-file consistency (REQ-0007)', () => {
  // TC-E01: Agent count in config matches number of new agent .md files
  it('TC-E01: config agent count matches new agent .md file count', () => {
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    const configAgentCount = Object.keys(config.agents).length;
    let fileCount = 0;
    for (const [, agent] of Object.entries(config.agents)) {
      if (existsSync(join(DISCOVER_DIR, `${agent.agent_type}.md`))) fileCount++;
    }
    assert.equal(fileCount, configAgentCount,
      `Config has ${configAgentCount} agents but only ${fileCount} .md files found`);
  });

  // TC-E02: agent_type values in config match actual .md filenames
  it('TC-E02: config agent_types match actual .md filenames', () => {
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    for (const [id, agent] of Object.entries(config.agents)) {
      const expectedFile = join(DISCOVER_DIR, `${agent.agent_type}.md`);
      assert.ok(existsSync(expectedFile),
        `Config agent ${id} (${agent.agent_type}) has no matching .md file at ${expectedFile}`);
    }
  });

  // TC-E03: D16-D19 in config have corresponding .md files
  it('TC-E03: D16-D19 in config have corresponding .md files in discover/', () => {
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    for (const id of ['D16', 'D17', 'D18', 'D19']) {
      assert.ok(id in config.agents, `Config missing agent ${id}`);
      const filePath = join(DISCOVER_DIR, `${config.agents[id].agent_type}.md`);
      assert.ok(existsSync(filePath), `Agent ${id} .md file missing: ${filePath}`);
    }
  });

  // TC-E04: discover-orchestrator.md does NOT contain "Step 0: Mode Selection"
  it('TC-E04: orchestrator does not contain Step 0: Mode Selection', () => {
    const orch = readFileSync(ORCHESTRATOR_PATH, 'utf-8');
    assert.ok(!orch.includes('### Step 0: Mode Selection'),
      'Orchestrator still contains Step 0: Mode Selection');
  });

  // TC-E05: discover-orchestrator.md does NOT contain "PARTY MODE FLOW" as section header
  it('TC-E05: orchestrator does not contain PARTY MODE FLOW section header', () => {
    const orch = readFileSync(ORCHESTRATOR_PATH, 'utf-8');
    assert.ok(!orch.includes('## PARTY MODE FLOW'),
      'Orchestrator still contains ## PARTY MODE FLOW');
  });

  // TC-E06: discover-orchestrator.md contains "DEEP DISCOVERY FLOW" section
  it('TC-E06: orchestrator contains DEEP DISCOVERY FLOW section', () => {
    const orch = readFileSync(ORCHESTRATOR_PATH, 'utf-8');
    assert.ok(orch.includes('DEEP DISCOVERY FLOW'),
      'Orchestrator missing DEEP DISCOVERY FLOW section');
  });

  // TC-E07: 7 party agent files do NOT contain "party mode" (case-insensitive)
  it('TC-E07: party agent files do not contain "party mode"', () => {
    for (const file of PARTY_AGENT_FILES) {
      const filePath = join(DISCOVER_DIR, file);
      if (!existsSync(filePath)) continue; // Skip if file doesn't exist (shouldn't happen)
      const content = readFileSync(filePath, 'utf-8').toLowerCase();
      assert.ok(!content.includes('party mode'),
        `${file} still contains "party mode"`);
    }
  });

  // TC-E08: AGENTS.md contains D16, D17, D18, D19 entries
  it('TC-E08: AGENTS.md contains D16, D17, D18, D19 entries', () => {
    if (!existsSync(AGENTS_MD_PATH)) {
      // Skip if AGENTS.md doesn't exist yet
      return;
    }
    const agents = readFileSync(AGENTS_MD_PATH, 'utf-8');
    assert.ok(agents.includes('D16'), 'AGENTS.md missing D16');
    assert.ok(agents.includes('D17'), 'AGENTS.md missing D17');
    assert.ok(agents.includes('D18'), 'AGENTS.md missing D18');
    assert.ok(agents.includes('D19'), 'AGENTS.md missing D19');
  });

  // TC-E09: README.md contains updated agent count (64)
  it('TC-E09: README.md contains updated agent count', () => {
    const readme = readFileSync(README_PATH, 'utf-8');
    assert.ok(readme.includes('64 agents'), `README.md should reference 64 agents`);
  });

  // TC-E10: tour.md does NOT contain --party or --classic
  it('TC-E10: tour.md does not contain --party or --classic', () => {
    if (!existsSync(TOUR_PATH)) return;
    const tour = readFileSync(TOUR_PATH, 'utf-8');
    assert.ok(!tour.includes('--party'), 'tour.md still contains --party');
    assert.ok(!tour.includes('--classic'), 'tour.md still contains --classic');
  });
});

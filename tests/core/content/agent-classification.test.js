/**
 * Unit tests for src/core/content/agent-classification.js — Agent Content Classification
 *
 * Tests lookup, list, standard template, special agents, portability summary.
 * Requirements: REQ-0099 FR-002 (AC-002-01..08), FR-003 (AC-003-01..03)
 *
 * Test ID prefix: AC- (Agent Classification)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  agentClassifications,
  getAgentClassification,
  listClassifiedAgents,
  getAgentPortabilitySummary
} from '../../../src/core/content/agent-classification.js';

// All 47 agent names from the task description
const EXPECTED_AGENT_COUNT = 47;

const STANDARD_SECTION_NAMES = [
  'frontmatter',
  'role_description',
  'phase_overview',
  'constitutional_principles',
  'tool_usage',
  'iteration_protocol',
  'suggested_prompts'
];

// A representative standard agent (most agents follow the standard template)
const STANDARD_AGENT = '05-software-developer';

// Special agents with custom classifications
const SPECIAL_AGENTS = ['roundtable-analyst', 'bug-gather-analyst'];

// ---------------------------------------------------------------------------
// FR-003: Classification Coverage
// ---------------------------------------------------------------------------

describe('Agent Classification: Coverage (FR-003)', () => {
  it('AC-01: listClassifiedAgents returns exactly 47 names (AC-003-03)', () => {
    const agents = listClassifiedAgents();
    assert.equal(agents.length, EXPECTED_AGENT_COUNT,
      `Expected ${EXPECTED_AGENT_COUNT} agents, got ${agents.length}: missing or extra entries`);
  });

  it('AC-02: getAgentClassification returns sections for known agent (AC-003-02)', () => {
    const sections = getAgentClassification(STANDARD_AGENT);
    assert.ok(Array.isArray(sections), 'Should return an array of sections');
    assert.ok(sections.length > 0, 'Should have at least one section');
  });

  it('AC-03: getAgentClassification throws for unknown agent (AC-003-02)', () => {
    assert.throws(
      () => getAgentClassification('nonexistent-agent'),
      { message: /unknown agent/i }
    );
  });
});

// ---------------------------------------------------------------------------
// FR-002: Standard Section Classifications
// ---------------------------------------------------------------------------

describe('Agent Classification: Standard Sections (FR-002)', () => {
  it('AC-04: standard agents have 7 canonical sections (AC-002-01..08)', () => {
    const sections = getAgentClassification(STANDARD_AGENT);
    const sectionNames = sections.map(s => s.name);
    assert.deepEqual(sectionNames, STANDARD_SECTION_NAMES);
  });

  it('AC-05: frontmatter classified as role_spec/full (AC-002-01)', () => {
    const sections = getAgentClassification(STANDARD_AGENT);
    const fm = sections.find(s => s.name === 'frontmatter');
    assert.equal(fm.type, 'role_spec');
    assert.equal(fm.portability, 'full');
  });

  it('AC-05b: role_description classified as role_spec/full (AC-002-02)', () => {
    const sections = getAgentClassification(STANDARD_AGENT);
    const rd = sections.find(s => s.name === 'role_description');
    assert.equal(rd.type, 'role_spec');
    assert.equal(rd.portability, 'full');
  });

  it('AC-05c: phase_overview classified as role_spec/full (AC-002-03)', () => {
    const sections = getAgentClassification(STANDARD_AGENT);
    const po = sections.find(s => s.name === 'phase_overview');
    assert.equal(po.type, 'role_spec');
    assert.equal(po.portability, 'full');
  });

  it('AC-05d: constitutional_principles classified as role_spec/full (AC-002-06)', () => {
    const sections = getAgentClassification(STANDARD_AGENT);
    const cp = sections.find(s => s.name === 'constitutional_principles');
    assert.equal(cp.type, 'role_spec');
    assert.equal(cp.portability, 'full');
  });

  it('AC-06: tool_usage classified as runtime_packaging/none (AC-002-04)', () => {
    const sections = getAgentClassification(STANDARD_AGENT);
    const tu = sections.find(s => s.name === 'tool_usage');
    assert.equal(tu.type, 'runtime_packaging');
    assert.equal(tu.portability, 'none');
  });

  it('AC-07: iteration_protocol classified as mixed/partial (AC-002-07)', () => {
    const sections = getAgentClassification(STANDARD_AGENT);
    const ip = sections.find(s => s.name === 'iteration_protocol');
    assert.equal(ip.type, 'mixed');
    assert.equal(ip.portability, 'partial');
  });

  it('AC-07b: suggested_prompts classified as runtime_packaging/none (AC-002-08)', () => {
    const sections = getAgentClassification(STANDARD_AGENT);
    const sp = sections.find(s => s.name === 'suggested_prompts');
    assert.equal(sp.type, 'runtime_packaging');
    assert.equal(sp.portability, 'none');
  });
});

// ---------------------------------------------------------------------------
// Special Agents
// ---------------------------------------------------------------------------

describe('Agent Classification: Special Agents', () => {
  it('AC-08: roundtable-analyst has custom sections', () => {
    const sections = getAgentClassification('roundtable-analyst');
    const sectionNames = sections.map(s => s.name);
    // roundtable-analyst has unique sections like roundtable_protocol
    assert.ok(sectionNames.includes('roundtable_protocol'),
      'roundtable-analyst should have roundtable_protocol section');
  });

  it('AC-08b: bug-gather-analyst has custom sections', () => {
    const sections = getAgentClassification('bug-gather-analyst');
    const sectionNames = sections.map(s => s.name);
    assert.ok(sectionNames.includes('gather_protocol'),
      'bug-gather-analyst should have gather_protocol section');
  });
});

// ---------------------------------------------------------------------------
// Portability Summary
// ---------------------------------------------------------------------------

describe('Agent Classification: Portability Summary', () => {
  it('AC-09: getAgentPortabilitySummary returns percentage breakdown', () => {
    const summary = getAgentPortabilitySummary();
    assert.equal(typeof summary.full, 'number');
    assert.equal(typeof summary.partial, 'number');
    assert.equal(typeof summary.none, 'number');
    // Percentages should roughly sum to 100 (allow rounding)
    const total = summary.full + summary.partial + summary.none;
    assert.ok(total >= 99 && total <= 101,
      `Percentages should sum to ~100, got ${total}`);
  });
});

// ---------------------------------------------------------------------------
// Frozen Data
// ---------------------------------------------------------------------------

describe('Agent Classification: Frozen Data', () => {
  it('AC-10: all classification entries are frozen', () => {
    const agents = listClassifiedAgents();
    for (const name of agents) {
      const sections = getAgentClassification(name);
      assert.ok(Object.isFrozen(sections), `${name} sections array should be frozen`);
      for (const section of sections) {
        assert.ok(Object.isFrozen(section), `${name}.${section.name} should be frozen`);
      }
    }
  });

  it('AC-10b: agentClassifications map is not directly mutable', () => {
    // The exported Map should not allow external set
    const originalSize = agentClassifications.size;
    assert.throws(
      () => { agentClassifications.set('hacked', []); },
      TypeError,
      'Should not allow modifying frozen map'
    );
  });
});

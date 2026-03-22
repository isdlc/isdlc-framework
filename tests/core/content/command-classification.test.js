/**
 * Unit tests for src/core/content/command-classification.js — Command Content Classification
 *
 * Tests isdlc.md detail, other commands, lookup.
 * Requirements: REQ-0101 FR-001 (AC-001-01..02), FR-002 (AC-002-01..06), FR-003 (AC-003-01..03)
 *
 * Test ID prefix: CMD- (Command Classification)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getCommandClassification,
  listClassifiedCommands
} from '../../../src/core/content/command-classification.js';

const EXPECTED_COMMANDS = ['isdlc', 'provider', 'discover', 'tour'];

// ---------------------------------------------------------------------------
// FR-001: Command Section Classification
// ---------------------------------------------------------------------------

describe('Command Classification: Coverage', () => {
  it('CMD-06: listClassifiedCommands returns exactly 4 (AC-001-01)', () => {
    const commands = listClassifiedCommands();
    assert.equal(commands.length, 4);
    assert.deepEqual(commands.sort(), [...EXPECTED_COMMANDS].sort());
  });

  it('CMD-01: getCommandClassification returns sections for isdlc (AC-001-01)', () => {
    const sections = getCommandClassification('isdlc');
    assert.ok(Array.isArray(sections));
    assert.ok(sections.length > 0);
  });

  it('CMD-07: getCommandClassification throws for unknown command', () => {
    assert.throws(
      () => getCommandClassification('nonexistent'),
      { message: /unknown command/i }
    );
  });
});

// ---------------------------------------------------------------------------
// FR-002: isdlc.md Classifications
// ---------------------------------------------------------------------------

describe('Command Classification: isdlc.md Sections (FR-002)', () => {
  it('CMD-02: isdlc.md has 8 classified sections (AC-002-01..06)', () => {
    const sections = getCommandClassification('isdlc');
    assert.equal(sections.length, 8);
  });

  it('CMD-03: action_definitions classified as role_spec/full (AC-002-01)', () => {
    const sections = getCommandClassification('isdlc');
    const ad = sections.find(s => s.name === 'action_definitions');
    assert.ok(ad, 'Should have action_definitions section');
    assert.equal(ad.type, 'role_spec');
    assert.equal(ad.portability, 'full');
  });

  it('CMD-03b: build_handler_workflow classified as role_spec/full (AC-002-02)', () => {
    const sections = getCommandClassification('isdlc');
    const bh = sections.find(s => s.name === 'build_handler_workflow');
    assert.ok(bh, 'Should have build_handler_workflow section');
    assert.equal(bh.type, 'role_spec');
    assert.equal(bh.portability, 'full');
  });

  it('CMD-03c: analyze_handler_roundtable classified as mixed/partial (AC-002-03)', () => {
    const sections = getCommandClassification('isdlc');
    const ah = sections.find(s => s.name === 'analyze_handler_roundtable');
    assert.ok(ah);
    assert.equal(ah.type, 'mixed');
    assert.equal(ah.portability, 'partial');
  });

  it('CMD-04: phase_loop_controller classified as runtime_packaging/none (AC-002-04)', () => {
    const sections = getCommandClassification('isdlc');
    const plc = sections.find(s => s.name === 'phase_loop_controller');
    assert.ok(plc);
    assert.equal(plc.type, 'runtime_packaging');
    assert.equal(plc.portability, 'none');
  });

  it('CMD-04b: skill_injection_steps classified as runtime_packaging/none (AC-002-04)', () => {
    const sections = getCommandClassification('isdlc');
    const si = sections.find(s => s.name === 'skill_injection_steps');
    assert.ok(si);
    assert.equal(si.type, 'runtime_packaging');
    assert.equal(si.portability, 'none');
  });

  it('CMD-04c: interactive_relay_protocol classified as runtime_packaging/none (AC-002-05)', () => {
    const sections = getCommandClassification('isdlc');
    const irp = sections.find(s => s.name === 'interactive_relay_protocol');
    assert.ok(irp);
    assert.equal(irp.type, 'runtime_packaging');
    assert.equal(irp.portability, 'none');
  });

  it('CMD-03d: add_handler classified as role_spec/full (AC-002-06)', () => {
    const sections = getCommandClassification('isdlc');
    const ah = sections.find(s => s.name === 'add_handler');
    assert.ok(ah);
    assert.equal(ah.type, 'role_spec');
    assert.equal(ah.portability, 'full');
  });

  it('CMD-03e: trivial_tier_execution classified as mixed/partial', () => {
    const sections = getCommandClassification('isdlc');
    const tte = sections.find(s => s.name === 'trivial_tier_execution');
    assert.ok(tte);
    assert.equal(tte.type, 'mixed');
    assert.equal(tte.portability, 'partial');
  });
});

// ---------------------------------------------------------------------------
// FR-003: Other Command Classifications
// ---------------------------------------------------------------------------

describe('Command Classification: Other Commands (FR-003)', () => {
  it('CMD-05a: provider.md has provider_semantics and claude_settings_ui (AC-003-01)', () => {
    const sections = getCommandClassification('provider');
    const ps = sections.find(s => s.name === 'provider_semantics');
    assert.ok(ps);
    assert.equal(ps.type, 'role_spec');
    assert.equal(ps.portability, 'full');
    const csu = sections.find(s => s.name === 'claude_settings_ui');
    assert.ok(csu);
    assert.equal(csu.type, 'runtime_packaging');
    assert.equal(csu.portability, 'none');
  });

  it('CMD-05b: discover.md has discovery_workflow and agent_delegation (AC-003-02)', () => {
    const sections = getCommandClassification('discover');
    const dw = sections.find(s => s.name === 'discovery_workflow');
    assert.ok(dw);
    assert.equal(dw.type, 'role_spec');
    assert.equal(dw.portability, 'full');
    const ad = sections.find(s => s.name === 'agent_delegation');
    assert.ok(ad);
    assert.equal(ad.type, 'runtime_packaging');
    assert.equal(ad.portability, 'none');
  });

  it('CMD-05c: tour.md has tour_content and interactive_presentation (AC-003-03)', () => {
    const sections = getCommandClassification('tour');
    const tc = sections.find(s => s.name === 'tour_content');
    assert.ok(tc);
    assert.equal(tc.type, 'role_spec');
    assert.equal(tc.portability, 'full');
    const ip = sections.find(s => s.name === 'interactive_presentation');
    assert.ok(ip);
    assert.equal(ip.type, 'runtime_packaging');
    assert.equal(ip.portability, 'none');
  });

  it('CMD-05d: all command entries are frozen', () => {
    for (const cmd of EXPECTED_COMMANDS) {
      const sections = getCommandClassification(cmd);
      assert.ok(Object.isFrozen(sections), `${cmd} sections should be frozen`);
      for (const section of sections) {
        assert.ok(Object.isFrozen(section), `${cmd}.${section.name} should be frozen`);
      }
    }
  });
});

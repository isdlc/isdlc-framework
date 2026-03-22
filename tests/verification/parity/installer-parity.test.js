/**
 * Parity Test: Installer Function Signatures — REQ-0118
 *
 * Verifies both Claude and Codex installers export the same set of
 * async functions with matching parameter arity.
 *
 * Strict: same function names, same parameter count.
 * Flexible: implementation details, internal behavior.
 *
 * Test ID prefix: PAR-INS-
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import * as claudeInstaller from '../../../src/providers/claude/installer.js';
import * as codexInstaller from '../../../src/providers/codex/installer.js';

describe('Installer parity (REQ-0118 FR-001/FR-002)', () => {
  // PAR-INS-01: Both export install function
  it('PAR-INS-01: both export an install function', () => {
    assert.equal(typeof claudeInstaller.installClaude, 'function', 'Claude must export installClaude');
    assert.equal(typeof codexInstaller.installCodex, 'function', 'Codex must export installCodex');
  });

  // PAR-INS-02: Both export update function
  it('PAR-INS-02: both export an update function', () => {
    assert.equal(typeof claudeInstaller.updateClaude, 'function', 'Claude must export updateClaude');
    assert.equal(typeof codexInstaller.updateCodex, 'function', 'Codex must export updateCodex');
  });

  // PAR-INS-03: Both export uninstall function
  it('PAR-INS-03: both export an uninstall function', () => {
    assert.equal(typeof claudeInstaller.uninstallClaude, 'function', 'Claude must export uninstallClaude');
    assert.equal(typeof codexInstaller.uninstallCodex, 'function', 'Codex must export uninstallCodex');
  });

  // PAR-INS-04: Both export doctor function
  it('PAR-INS-04: both export a doctor function', () => {
    assert.equal(typeof claudeInstaller.doctorClaude, 'function', 'Claude must export doctorClaude');
    assert.equal(typeof codexInstaller.doctorCodex, 'function', 'Codex must export doctorCodex');
  });

  // PAR-INS-05: Strict — same number of installer functions (4 each)
  it('PAR-INS-05: same number of exported installer functions', () => {
    const claudeFns = Object.values(claudeInstaller).filter(v => typeof v === 'function');
    const codexFns = Object.values(codexInstaller).filter(v => typeof v === 'function');
    assert.equal(claudeFns.length, codexFns.length,
      `Function count mismatch: Claude=${claudeFns.length}, Codex=${codexFns.length}`);
  });

  // PAR-INS-06: Strict — install functions have same arity (projectRoot, options)
  it('PAR-INS-06: install functions have same arity', () => {
    assert.equal(claudeInstaller.installClaude.length, codexInstaller.installCodex.length,
      'Install function arity must match');
  });

  // PAR-INS-07: Strict — update functions have same arity
  it('PAR-INS-07: update functions have same arity', () => {
    assert.equal(claudeInstaller.updateClaude.length, codexInstaller.updateCodex.length,
      'Update function arity must match');
  });

  // PAR-INS-08: Strict — uninstall functions have same arity
  it('PAR-INS-08: uninstall functions have same arity', () => {
    assert.equal(claudeInstaller.uninstallClaude.length, codexInstaller.uninstallCodex.length,
      'Uninstall function arity must match');
  });

  // PAR-INS-09: Strict — doctor functions have same arity
  it('PAR-INS-09: doctor functions have same arity', () => {
    assert.equal(claudeInstaller.doctorClaude.length, codexInstaller.doctorCodex.length,
      'Doctor function arity must match');
  });
});

/**
 * Cross-Provider Parity Tests (Refactored)
 * ==========================================
 * REQ-0141: Execution Contract System (ADR-001)
 * REQ-GH-213: Inline Contract Enforcement (FR-007)
 *
 * Verifies same check functions produce identical results regardless of
 * whether the data source is the Claude session cache or Codex loadContractEntry().
 * Since functions are pure and stateless, parity is verified by calling each
 * function with identically-structured data and confirming identical outcomes.
 *
 * Tests: PAR-CC-01 through PAR-CC-06
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ContractViolationError,
  checkDomainTransition,
  checkBatchWrite,
  checkPersonaFormat,
  checkPersonaContribution,
  checkDelegation,
  checkArtifacts
} from '../../../src/core/validators/contract-checks.js';

let tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  tempDirs = [];
});

function makeContractEntry() {
  return {
    execution_unit: '06-implementation',
    context: 'feature:standard',
    expectations: {
      agent: 'software-developer',
      presentation: {
        confirmation_sequence: ['requirements', 'architecture', 'design']
      },
      artifacts_produced: ['docs/requirements/{artifact_folder}/requirements-spec.md']
    }
  };
}

describe('Cross-Provider Parity (REQ-GH-213 FR-007)', () => {
  it('PAR-CC-01: checkDomainTransition produces same result for identical data from both providers', () => {
    const entry = makeContractEntry();

    // Both "Claude path" and "Codex path" use the same data structure
    const claudeData = structuredClone(entry);
    const codexData = structuredClone(entry);

    // Pass case
    checkDomainTransition(claudeData, 'requirements', 0);
    checkDomainTransition(codexData, 'requirements', 0);

    // Fail case — both should throw with same properties
    let claudeErr, codexErr;
    try { checkDomainTransition(claudeData, 'design', 0); } catch (e) { claudeErr = e; }
    try { checkDomainTransition(codexData, 'design', 0); } catch (e) { codexErr = e; }

    assert.ok(claudeErr instanceof ContractViolationError);
    assert.ok(codexErr instanceof ContractViolationError);
    assert.equal(claudeErr.decisionPoint, codexErr.decisionPoint);
    assert.equal(claudeErr.expected, codexErr.expected);
    assert.equal(claudeErr.actual, codexErr.actual);
  });

  it('PAR-CC-02: checkBatchWrite produces same result for identical data from both providers', () => {
    const entry = makeContractEntry();

    const claudeData = structuredClone(entry);
    const codexData = structuredClone(entry);

    // Pass case
    checkBatchWrite(claudeData, ['docs/requirements/REQ-X/requirements-spec.md'], 'REQ-X');
    checkBatchWrite(codexData, ['docs/requirements/REQ-X/requirements-spec.md'], 'REQ-X');

    // Fail case
    let claudeErr, codexErr;
    try { checkBatchWrite(claudeData, [], 'REQ-X'); } catch (e) { claudeErr = e; }
    try { checkBatchWrite(codexData, [], 'REQ-X'); } catch (e) { codexErr = e; }

    assert.ok(claudeErr instanceof ContractViolationError);
    assert.ok(codexErr instanceof ContractViolationError);
    assert.equal(claudeErr.decisionPoint, codexErr.decisionPoint);
  });

  it('PAR-CC-03: checkPersonaFormat produces same result for identical data from both providers', () => {
    const templateData = {
      domain: 'requirements',
      format: {
        format_type: 'bulleted',
        required_sections: ['functional_requirements']
      }
    };

    const claudeTemplate = structuredClone(templateData);
    const codexTemplate = structuredClone(templateData);

    const output = '## functional_requirements\n- Item one';

    // Pass case
    checkPersonaFormat(claudeTemplate, output);
    checkPersonaFormat(codexTemplate, output);

    // Fail case (numbered violates bulleted)
    const badOutput = '## functional_requirements\n1. Item one';
    let claudeErr, codexErr;
    try { checkPersonaFormat(claudeTemplate, badOutput); } catch (e) { claudeErr = e; }
    try { checkPersonaFormat(codexTemplate, badOutput); } catch (e) { codexErr = e; }

    assert.ok(claudeErr instanceof ContractViolationError);
    assert.ok(codexErr instanceof ContractViolationError);
    assert.equal(claudeErr.decisionPoint, codexErr.decisionPoint);
  });

  it('PAR-CC-04: checkPersonaContribution produces same result for identical data from both providers', () => {
    const configured = ['Maya', 'Alex', 'Jordan'];
    const contributed = ['Maya', 'Jordan'];

    let claudeErr, codexErr;
    try { checkPersonaContribution([...configured], [...contributed]); } catch (e) { claudeErr = e; }
    try { checkPersonaContribution([...configured], [...contributed]); } catch (e) { codexErr = e; }

    assert.ok(claudeErr instanceof ContractViolationError);
    assert.ok(codexErr instanceof ContractViolationError);
    assert.equal(claudeErr.actual, codexErr.actual);
  });

  it('PAR-CC-05: checkDelegation produces same result for identical data from both providers', () => {
    const entry = makeContractEntry();

    const claudeData = structuredClone(entry);
    const codexData = structuredClone(entry);

    // Pass case
    checkDelegation(claudeData, '06-implementation', 'software-developer');
    checkDelegation(codexData, '06-implementation', 'software-developer');

    // Fail case
    let claudeErr, codexErr;
    try { checkDelegation(claudeData, '06-implementation', 'wrong-agent'); } catch (e) { claudeErr = e; }
    try { checkDelegation(codexData, '06-implementation', 'wrong-agent'); } catch (e) { codexErr = e; }

    assert.ok(claudeErr instanceof ContractViolationError);
    assert.ok(codexErr instanceof ContractViolationError);
    assert.equal(claudeErr.expected, codexErr.expected);
    assert.equal(claudeErr.actual, codexErr.actual);
  });

  it('PAR-CC-06: checkArtifacts produces same result for identical data from both providers', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'par-art-'));
    tempDirs.push(tempDir);
    const docsDir = join(tempDir, 'docs', 'requirements', 'REQ-X');
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, 'requirements-spec.md'), 'content');

    const entry = makeContractEntry();
    const claudeData = structuredClone(entry);
    const codexData = structuredClone(entry);

    // Pass case — both providers check same temp directory
    checkArtifacts(claudeData, 'REQ-X', tempDir);
    checkArtifacts(codexData, 'REQ-X', tempDir);

    // Fail case — nonexistent folder
    let claudeErr, codexErr;
    try { checkArtifacts(claudeData, 'MISSING', tempDir); } catch (e) { claudeErr = e; }
    try { checkArtifacts(codexData, 'MISSING', tempDir); } catch (e) { codexErr = e; }

    assert.ok(claudeErr instanceof ContractViolationError);
    assert.ok(codexErr instanceof ContractViolationError);
    assert.equal(claudeErr.decisionPoint, codexErr.decisionPoint);
  });
});

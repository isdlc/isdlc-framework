/**
 * Contract Evaluator Integration Tests (Refactored)
 * ===================================================
 * REQ-0141: Execution Contract System
 * REQ-GH-213: Inline Contract Enforcement
 *
 * Updated per REQ-GH-213 FR-005: evaluateContract() is deprecated.
 * Integration tests now verify the contract loader + inline check function pipeline.
 *
 * Tests: EI-01 through EI-10 (updated)
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ContractViolationError,
  checkDelegation,
  checkArtifacts
} from '../../../src/core/validators/contract-checks.js';
import { loadContractEntry } from '../../../src/core/validators/contract-loader.js';

let tempDirs = [];

function createTestProject() {
  const dir = mkdtempSync(join(tmpdir(), 'eval-int-'));
  tempDirs.push(dir);

  // Create config structure
  const configDir = join(dir, '.claude', 'hooks', 'config');
  mkdirSync(configDir, { recursive: true });
  mkdirSync(join(configDir, 'contracts'), { recursive: true });
  mkdirSync(join(dir, '.isdlc', 'config', 'contracts'), { recursive: true });

  // Write artifact-paths.json
  writeFileSync(join(configDir, 'artifact-paths.json'), JSON.stringify({
    version: '1.0.0',
    phases: {
      '06-implementation': { paths: ['docs/requirements/{artifact_folder}/implementation-notes.md'] }
    }
  }));

  // Write skills-manifest.json
  writeFileSync(join(configDir, 'skills-manifest.json'), JSON.stringify({
    version: '1.0.0',
    ownership: {
      'software-developer': { skills: ['IMP-001', 'IMP-002'] }
    }
  }));

  return dir;
}

function writeContractFile(dir, filename, content) {
  writeFileSync(join(dir, filename), JSON.stringify(content, null, 2));
}

function makeEntry(overrides = {}) {
  return {
    execution_unit: '06-implementation',
    context: 'feature:standard',
    expectations: {
      agent: 'software-developer',
      skills_required: null,
      artifacts_produced: null,
      state_assertions: [],
      cleanup: [],
      presentation: null
    },
    violation_response: {
      agent_not_engaged: 'block',
      skills_missing: 'report',
      artifacts_missing: 'block',
      state_incomplete: 'report',
      cleanup_skipped: 'warn',
      presentation_violated: 'warn'
    },
    ...overrides
  };
}

afterEach(() => {
  for (const dir of tempDirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  tempDirs = [];
});

describe('Contract Loader + Inline Check Pipeline Integration', () => {
  it('EI-01: Loaded entry + checkDelegation with correct agent passes', () => {
    const projectRoot = createTestProject();
    const contractsDir = join(projectRoot, '.claude', 'hooks', 'config', 'contracts');
    writeContractFile(contractsDir, 'workflow-feature.contract.json', {
      version: '1.0.0',
      entries: [makeEntry()],
      _generation_metadata: { generated_at: '2026-03-26T00:00:00Z', generator_version: '1.0.0', input_files: [] }
    });

    const loaded = loadContractEntry('06-implementation', 'feature:standard', { projectRoot });
    assert.ok(loaded.entry, 'Contract entry should be loaded');
    // checkDelegation should pass with correct agent
    checkDelegation(loaded.entry, '06-implementation', 'software-developer');
  });

  it('EI-02: Loaded entry + checkDelegation with wrong agent throws', () => {
    const projectRoot = createTestProject();
    const contractsDir = join(projectRoot, '.claude', 'hooks', 'config', 'contracts');
    writeContractFile(contractsDir, 'workflow-feature.contract.json', {
      version: '1.0.0',
      entries: [makeEntry()],
      _generation_metadata: { generated_at: '2026-03-26T00:00:00Z', generator_version: '1.0.0', input_files: [] }
    });

    const loaded = loadContractEntry('06-implementation', 'feature:standard', { projectRoot });
    assert.throws(
      () => checkDelegation(loaded.entry, '06-implementation', 'wrong-agent'),
      (err) => {
        assert.ok(err instanceof ContractViolationError);
        assert.equal(err.expected, 'software-developer');
        return true;
      }
    );
  });

  it('EI-03: Stale contract detected via hash mismatch but loader still returns entry', () => {
    const projectRoot = createTestProject();
    const contractsDir = join(projectRoot, '.claude', 'hooks', 'config', 'contracts');
    const configFile = join(projectRoot, 'config.json');
    writeFileSync(configFile, '{"version": 2}');

    writeContractFile(contractsDir, 'workflow-feature.contract.json', {
      version: '1.0.0',
      entries: [makeEntry({ expectations: { ...makeEntry().expectations, agent: null } })],
      _generation_metadata: {
        generated_at: '2026-03-26T00:00:00Z',
        generator_version: '1.0.0',
        input_files: [{ path: 'config.json', hash: 'wrong-hash' }]
      }
    });

    const loaded = loadContractEntry('06-implementation', 'feature:standard', { projectRoot });
    assert.equal(loaded.stale, true, 'Should detect staleness');
    assert.ok(loaded.entry, 'Entry should still be loaded');
  });

  it('EI-04: Override contract loaded instead of shipped default', () => {
    const projectRoot = createTestProject();
    const shippedDir = join(projectRoot, '.claude', 'hooks', 'config', 'contracts');
    const overrideDir = join(projectRoot, '.isdlc', 'config', 'contracts');

    writeContractFile(shippedDir, 'workflow-feature.contract.json', {
      version: '1.0.0',
      entries: [makeEntry({ expectations: { ...makeEntry().expectations, agent: 'default-agent' } })],
      _generation_metadata: { generated_at: '2026-03-26T00:00:00Z', generator_version: '1.0.0', input_files: [] }
    });
    writeContractFile(overrideDir, 'workflow-feature.contract.json', {
      version: '1.0.0',
      entries: [makeEntry({ expectations: { ...makeEntry().expectations, agent: 'override-agent' } })],
      _generation_metadata: { generated_at: '2026-03-26T00:00:00Z', generator_version: '1.0.0', input_files: [] }
    });

    const loaded = loadContractEntry('06-implementation', 'feature:standard', { projectRoot });
    assert.equal(loaded.source, 'override');
    assert.equal(loaded.entry.expectations.agent, 'override-agent');
  });

  it('EI-05: checkArtifacts with existing artifacts passes', () => {
    const projectRoot = createTestProject();
    const artifactDir = join(projectRoot, 'docs', 'requirements', 'REQ-TEST');
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(join(artifactDir, 'implementation-notes.md'), 'notes');

    const entry = makeEntry({
      expectations: {
        ...makeEntry().expectations,
        artifacts_produced: ['docs/requirements/{artifact_folder}/implementation-notes.md']
      }
    });
    checkArtifacts(entry, 'REQ-TEST', projectRoot);
  });

  it('EI-06: checkArtifacts with missing artifacts throws', () => {
    const projectRoot = createTestProject();
    const entry = makeEntry({
      expectations: {
        ...makeEntry().expectations,
        artifacts_produced: ['docs/requirements/{artifact_folder}/implementation-notes.md']
      }
    });
    assert.throws(
      () => checkArtifacts(entry, 'MISSING-FOLDER', projectRoot),
      (err) => {
        assert.ok(err instanceof ContractViolationError);
        return true;
      }
    );
  });

  it('EI-07: Loaded entry for non-workflow context works with check functions', () => {
    const projectRoot = createTestProject();
    const contractsDir = join(projectRoot, '.claude', 'hooks', 'config', 'contracts');
    const entry = {
      execution_unit: 'roundtable',
      context: 'analyze',
      expectations: {
        agent: null,
        skills_required: null,
        artifacts_produced: null,
        state_assertions: [],
        cleanup: [],
        presentation: { confirmation_sequence: ['requirements', 'architecture', 'design'] }
      },
      violation_response: { agent_not_engaged: 'report', skills_missing: 'report', artifacts_missing: 'block', state_incomplete: 'report', cleanup_skipped: 'warn', presentation_violated: 'warn' }
    };
    writeContractFile(contractsDir, 'analyze.contract.json', {
      version: '1.0.0',
      entries: [entry],
      _generation_metadata: { generated_at: '2026-03-26T00:00:00Z', generator_version: '1.0.0', input_files: [] }
    });

    const loaded = loadContractEntry('roundtable', 'analyze', { projectRoot });
    if (loaded.entry) {
      // checkDelegation with null agent should be no-op
      checkDelegation(loaded.entry, 'roundtable', 'any-agent');
    }
  });

  it('EI-08: Full pipeline — load + check delegation + check artifacts', () => {
    const projectRoot = createTestProject();
    const contractsDir = join(projectRoot, '.claude', 'hooks', 'config', 'contracts');
    const artifactDir = join(projectRoot, 'docs', 'requirements', 'REQ-FULL');
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(join(artifactDir, 'implementation-notes.md'), 'notes');

    const entry = makeEntry({
      expectations: {
        agent: 'software-developer',
        skills_required: null,
        artifacts_produced: ['docs/requirements/{artifact_folder}/implementation-notes.md'],
        state_assertions: [],
        cleanup: [],
        presentation: null
      }
    });
    writeContractFile(contractsDir, 'workflow-feature.contract.json', {
      version: '1.0.0',
      entries: [entry],
      _generation_metadata: { generated_at: '2026-03-26T00:00:00Z', generator_version: '1.0.0', input_files: [] }
    });

    const loaded = loadContractEntry('06-implementation', 'feature:standard', { projectRoot });
    assert.ok(loaded.entry);

    // Both checks should pass
    checkDelegation(loaded.entry, '06-implementation', 'software-developer');
    checkArtifacts(loaded.entry, 'REQ-FULL', projectRoot);
  });
});

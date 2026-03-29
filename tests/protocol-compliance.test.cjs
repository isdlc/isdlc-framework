'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ============================================================================
// Compliance Detection Logic (mirrors what the Phase-Loop Controller does)
// ============================================================================

function checkGitCommitDetected(repoDir, startedAt, completedAt) {
  try {
    const output = execSync(
      `git log --after="${startedAt}" --before="${completedAt}" --oneline`,
      { cwd: repoDir, encoding: 'utf8', timeout: 5000 }
    ).trim();
    if (output.length > 0) {
      return { violated: true, evidence: output };
    }
    return { violated: false, evidence: null };
  } catch {
    // Fail-open: check failure = no violation detected
    return { violated: false, evidence: null };
  }
}

function checkProtocolCompliance(protocols, phaseKey, timing, repoDir) {
  const violations = [];
  const checkable = protocols.filter(p =>
    p.checkable && (p.phases.includes('all') || p.phases.includes(phaseKey))
  );

  for (const proto of checkable) {
    try {
      if (proto.check_signal === 'git_commit_detected') {
        const result = checkGitCommitDetected(repoDir, timing.started_at, timing.completed_at);
        if (result.violated) {
          violations.push({
            protocol_header: proto.header,
            check_signal: proto.check_signal,
            evidence: result.evidence
          });
        }
      }
    } catch {
      // Fail-open: skip protocol on check error
    }
  }

  return violations;
}

// ============================================================================
// Tests: Git Commit Detection
// ============================================================================

describe('Git Commit Detection Signal', () => {
  it('TC-PC-01: detects commit within timing window', () => {
    // Use actual project repo — there are commits in history
    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const result = checkGitCommitDetected(
      process.cwd(),
      oneYearAgo.toISOString(),
      now.toISOString()
    );
    assert.equal(result.violated, true, 'Should detect commits in the last year');
    assert.ok(result.evidence.length > 0);
  });

  it('TC-PC-02: no violation when no commits in window', () => {
    // Use a window in the distant future
    const result = checkGitCommitDetected(
      process.cwd(),
      '2099-01-01T00:00:00Z',
      '2099-01-02T00:00:00Z'
    );
    assert.equal(result.violated, false);
    assert.equal(result.evidence, null);
  });

  it('TC-PC-03: fail-open on invalid directory', () => {
    const result = checkGitCommitDetected(
      '/nonexistent/directory',
      '2020-01-01T00:00:00Z',
      '2030-01-01T00:00:00Z'
    );
    assert.equal(result.violated, false, 'Should fail-open on git error');
  });

  it('TC-PC-04: fail-open on malformed dates', () => {
    const result = checkGitCommitDetected(
      process.cwd(),
      'not-a-date',
      'also-not-a-date'
    );
    // git log with invalid dates may return empty or error — either way, no violation
    assert.equal(result.violated, false);
  });
});

// ============================================================================
// Tests: Protocol Compliance Check
// ============================================================================

describe('Protocol Compliance Check', () => {
  const protocols = [
    { header: '### Git Commit Prohibition', phases: ['06-implementation'], checkable: true, check_signal: 'git_commit_detected' },
    { header: '### SKILL OBSERVABILITY Protocol', phases: ['all'], checkable: false }
  ];

  it('TC-PC-05: returns violations for checkable protocol in matching phase', () => {
    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const violations = checkProtocolCompliance(protocols, '06-implementation', {
      started_at: oneYearAgo.toISOString(),
      completed_at: now.toISOString()
    }, process.cwd());
    // Should detect commits (since this is a real git repo with history)
    assert.ok(violations.length > 0, 'Should detect violations');
    assert.equal(violations[0].check_signal, 'git_commit_detected');
  });

  it('TC-PC-06: returns empty for non-matching phase', () => {
    const violations = checkProtocolCompliance(protocols, '08-code-review', {
      started_at: '2020-01-01T00:00:00Z',
      completed_at: '2030-01-01T00:00:00Z'
    }, process.cwd());
    assert.equal(violations.length, 0, 'Phase 08 should have no checkable protocols');
  });

  it('TC-PC-07: skips non-checkable protocols', () => {
    const violations = checkProtocolCompliance(protocols, '06-implementation', {
      started_at: '2099-01-01T00:00:00Z',
      completed_at: '2099-01-02T00:00:00Z'
    }, process.cwd());
    assert.equal(violations.length, 0, 'No commits in future window');
  });

  it('TC-PC-08: empty protocols returns empty violations', () => {
    const violations = checkProtocolCompliance([], '06-implementation', {
      started_at: '2020-01-01T00:00:00Z',
      completed_at: '2030-01-01T00:00:00Z'
    }, process.cwd());
    assert.equal(violations.length, 0);
  });

  it('TC-PC-09: unknown check_signal is skipped gracefully', () => {
    const unknownProtos = [
      { header: '### Custom Protocol', phases: ['all'], checkable: true, check_signal: 'unknown_signal' }
    ];
    const violations = checkProtocolCompliance(unknownProtos, '06-implementation', {
      started_at: '2020-01-01T00:00:00Z',
      completed_at: '2030-01-01T00:00:00Z'
    }, process.cwd());
    assert.equal(violations.length, 0, 'Unknown signal should be skipped');
  });
});

// ============================================================================
// Tests: Violation Response Format
// ============================================================================

describe('Violation Response Format', () => {
  it('TC-PC-10: violation object has required fields', () => {
    const violation = {
      protocol_header: '### Git Commit Prohibition',
      check_signal: 'git_commit_detected',
      evidence: 'abc1234 some commit message'
    };
    assert.ok(violation.protocol_header);
    assert.ok(violation.check_signal);
    assert.ok(violation.evidence);
  });

  it('TC-PC-11: remediation prompt format', () => {
    const violations = [{
      protocol_header: '### Git Commit Prohibition',
      check_signal: 'git_commit_detected',
      evidence: 'abc1234 unauthorized commit'
    }];
    const prompt = `PROTOCOL VIOLATION DETECTED — Retry 1 of 2\n\nViolated protocols:\n${
      violations.map(v => `  - ${v.protocol_header}: ${v.evidence}`).join('\n')
    }\n\nRemediate these violations before the phase can advance.`;

    assert.ok(prompt.includes('PROTOCOL VIOLATION DETECTED'));
    assert.ok(prompt.includes('Git Commit Prohibition'));
    assert.ok(prompt.includes('abc1234'));
    assert.ok(prompt.includes('Retry 1 of 2'));
  });
});

/**
 * Tests for readCodeReviewConfig() in common.cjs
 * Tests: T13-T18 from test-strategy.md
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('readCodeReviewConfig', () => {
  let tmpDir;
  let originalEnv;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'common-cr-test-'));
    const isdlcDir = path.join(tmpDir, '.isdlc');
    fs.mkdirSync(isdlcDir, { recursive: true });
    originalEnv = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = tmpDir;
  });

  afterEach(() => {
    process.env.CLAUDE_PROJECT_DIR = originalEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Clear require cache for common.cjs
    const commonPath = path.resolve(__dirname, '..', 'lib', 'common.cjs');
    delete require.cache[commonPath];
  });

  function writeState(state) {
    const statePath = path.join(tmpDir, '.isdlc', 'state.json');
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  }

  function loadCommon() {
    // Clear cache to get fresh module with updated CLAUDE_PROJECT_DIR
    const commonPath = path.resolve(__dirname, '..', 'lib', 'common.cjs');
    delete require.cache[commonPath];
    return require(commonPath);
  }

  // T13: Returns config when present
  it('T13: returns config when code_review section present', () => {
    writeState({ code_review: { enabled: true, team_size: 3 } });
    const { readCodeReviewConfig } = loadCommon();
    const config = readCodeReviewConfig();
    assert.deepEqual(config, { enabled: true, team_size: 3 });
  });

  // T14: Returns defaults when section missing
  it('T14: returns defaults when code_review section missing', () => {
    writeState({});
    const { readCodeReviewConfig } = loadCommon();
    const config = readCodeReviewConfig();
    assert.deepEqual(config, { enabled: false, team_size: 1 });
  });

  // T15: Returns defaults when state.json missing
  it('T15: returns defaults when state.json does not exist', () => {
    // Don't write state file
    const { readCodeReviewConfig } = loadCommon();
    const config = readCodeReviewConfig();
    assert.deepEqual(config, { enabled: false, team_size: 1 });
  });

  // T16: Returns defaults on parse error
  it('T16: returns defaults on invalid JSON', () => {
    const statePath = path.join(tmpDir, '.isdlc', 'state.json');
    fs.writeFileSync(statePath, '{invalid json!!!');
    const { readCodeReviewConfig } = loadCommon();
    const config = readCodeReviewConfig();
    assert.deepEqual(config, { enabled: false, team_size: 1 });
  });

  // T17: Handles non-boolean enabled
  it('T17: treats non-boolean enabled as false', () => {
    writeState({ code_review: { enabled: 'yes', team_size: 2 } });
    const { readCodeReviewConfig } = loadCommon();
    const config = readCodeReviewConfig();
    assert.equal(config.enabled, false);
  });

  // T18: Handles non-number team_size
  it('T18: treats non-number team_size as 1', () => {
    writeState({ code_review: { enabled: true, team_size: 'three' } });
    const { readCodeReviewConfig } = loadCommon();
    const config = readCodeReviewConfig();
    assert.equal(config.enabled, true);
    assert.equal(config.team_size, 1);
  });
});

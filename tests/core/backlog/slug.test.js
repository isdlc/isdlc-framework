/**
 * Tests for src/core/backlog/slug.js
 * REQ-0083: Extract BacklogService
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { generateSlug, composeDirName } from '../../../src/core/backlog/slug.js';

describe('composeDirName', () => {
  it('uses source_id for github sources', () => {
    assert.strictEqual(
      composeDirName('REQ', 'github', 'GH-208', 'generate-task-breakdown'),
      'REQ-GH-208-generate-task-breakdown'
    );
  });

  it('uses source_id for jira sources', () => {
    assert.strictEqual(
      composeDirName('BUG', 'jira', 'AUTH-456', 'login-crash'),
      'BUG-AUTH-456-login-crash'
    );
  });

  it('uses sequence number for manual sources', () => {
    assert.strictEqual(
      composeDirName('REQ', 'manual', null, 'add-payment', '0001'),
      'REQ-0001-add-payment'
    );
  });

  it('defaults to REQ when itemType is missing', () => {
    assert.strictEqual(
      composeDirName(null, 'github', 'GH-42', 'some-feature'),
      'REQ-GH-42-some-feature'
    );
  });

  it('falls back to sequence number when external source has no sourceId', () => {
    assert.strictEqual(
      composeDirName('REQ', 'github', null, 'orphan-slug', '0005'),
      'REQ-0005-orphan-slug'
    );
  });

  it('defaults sequence to 0001 for manual with no sequence', () => {
    assert.strictEqual(
      composeDirName('REQ', 'manual', null, 'quick-item'),
      'REQ-0001-quick-item'
    );
  });

  it('uppercases item type', () => {
    assert.strictEqual(
      composeDirName('bug', 'github', 'GH-10', 'crash'),
      'BUG-GH-10-crash'
    );
  });

  it('uses untitled-item when slug is empty', () => {
    assert.strictEqual(
      composeDirName('REQ', 'github', 'GH-1', ''),
      'REQ-GH-1-untitled-item'
    );
  });
});

describe('generateSlug', () => {
  it('converts description to lowercase kebab-case', () => {
    assert.strictEqual(generateSlug('Add User Authentication'), 'add-user-authentication');
  });

  it('removes special characters', () => {
    assert.strictEqual(generateSlug('Fix bug #42: crash on login'), 'fix-bug-42-crash-on-login');
  });

  it('collapses multiple hyphens', () => {
    assert.strictEqual(generateSlug('hello   world---test'), 'hello-world-test');
  });

  it('trims leading/trailing hyphens', () => {
    assert.strictEqual(generateSlug('-leading and trailing-'), 'leading-and-trailing');
  });

  it('truncates to 50 characters', () => {
    const long = 'a'.repeat(100);
    assert.ok(generateSlug(long).length <= 50);
  });

  it('returns untitled-item for empty input', () => {
    assert.strictEqual(generateSlug(''), 'untitled-item');
    assert.strictEqual(generateSlug(null), 'untitled-item');
    assert.strictEqual(generateSlug(undefined), 'untitled-item');
  });

  it('returns untitled-item for all-special-char input', () => {
    assert.strictEqual(generateSlug('!!!@@@###'), 'untitled-item');
  });
});

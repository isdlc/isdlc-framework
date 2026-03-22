/**
 * Unit tests for src/core/content/content-model.js — Shared Classification Schema
 *
 * Tests enum values, createSectionEntry helper, and frozen exports.
 * Requirements: REQ-0099 FR-001 (AC-001-02)
 *
 * Test ID prefix: CM- (Content Model)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CLASSIFICATION_TYPES,
  PORTABILITY,
  createSectionEntry
} from '../../../src/core/content/content-model.js';

// ---------------------------------------------------------------------------
// CM-01..02: Enum values
// ---------------------------------------------------------------------------

describe('Content Model: Enum Values', () => {
  it('CM-01: CLASSIFICATION_TYPES has exactly 3 values (AC-001-02)', () => {
    const values = Object.values(CLASSIFICATION_TYPES);
    assert.equal(values.length, 3);
    assert.ok(values.includes('role_spec'));
    assert.ok(values.includes('runtime_packaging'));
    assert.ok(values.includes('mixed'));
  });

  it('CM-02: PORTABILITY has exactly 3 values (AC-001-02)', () => {
    const values = Object.values(PORTABILITY);
    assert.equal(values.length, 3);
    assert.ok(values.includes('full'));
    assert.ok(values.includes('partial'));
    assert.ok(values.includes('none'));
  });
});

// ---------------------------------------------------------------------------
// CM-03..05: createSectionEntry helper
// ---------------------------------------------------------------------------

describe('Content Model: createSectionEntry', () => {
  it('CM-03: returns frozen object with name, type, portability (AC-001-02)', () => {
    const entry = createSectionEntry('frontmatter', 'role_spec', 'full');
    assert.equal(entry.name, 'frontmatter');
    assert.equal(entry.type, 'role_spec');
    assert.equal(entry.portability, 'full');
    assert.ok(Object.isFrozen(entry));
  });

  it('CM-04: rejects invalid type (AC-001-02)', () => {
    assert.throws(
      () => createSectionEntry('test', 'invalid_type', 'full'),
      { message: /invalid classification type/i }
    );
  });

  it('CM-05: rejects invalid portability (AC-001-02)', () => {
    assert.throws(
      () => createSectionEntry('test', 'role_spec', 'invalid_port'),
      { message: /invalid portability/i }
    );
  });

  it('CM-03b: createSectionEntry has exactly 3 keys', () => {
    const entry = createSectionEntry('test', 'mixed', 'partial');
    assert.equal(Object.keys(entry).length, 3);
  });
});

// ---------------------------------------------------------------------------
// CM-06: Frozen enums
// ---------------------------------------------------------------------------

describe('Content Model: Frozen Exports', () => {
  it('CM-06: CLASSIFICATION_TYPES is frozen', () => {
    assert.ok(Object.isFrozen(CLASSIFICATION_TYPES));
  });

  it('CM-06b: PORTABILITY is frozen', () => {
    assert.ok(Object.isFrozen(PORTABILITY));
  });

  it('CM-06c: mutating CLASSIFICATION_TYPES throws TypeError', () => {
    assert.throws(
      () => { CLASSIFICATION_TYPES.NEW = 'hacked'; },
      TypeError
    );
  });

  it('CM-06d: mutating PORTABILITY throws TypeError', () => {
    assert.throws(
      () => { PORTABILITY.NEW = 'hacked'; },
      TypeError
    );
  });
});

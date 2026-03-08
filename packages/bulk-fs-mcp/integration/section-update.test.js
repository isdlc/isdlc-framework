'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createFileOps } = require('../file-ops.js');

// REQ-0048 — Integration Tests: file-ops + section-parser

describe('integration: section updates', () => {
  let tmpDir;
  let fileOps;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulk-fs-sec-'));
    fileOps = createFileOps();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // INT-09: Full appendSection flow — read, find, splice, write atomically (AC-003-01, AC-003-05)
  it('INT-09: full appendSection flow on 3-section document', async () => {
    const filePath = path.join(tmpDir, 'doc.md');
    fs.writeFileSync(filePath,
      '# Title\n\n## Section One\n\nContent one.\n\n## Section Two\n\nContent two.\n\n## Section Three\n\nContent three.\n'
    );

    const result = await fileOps.appendSection(filePath, '## Section Two', 'Updated content two.\n');
    assert.equal(result.success, true);

    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('Updated content two.'));
    assert.ok(!content.includes('Content two.'));
    assert.ok(content.includes('Content one.'));
    assert.ok(content.includes('Content three.'));
  });

  // INT-10: Heading match updates correct section in multi-section document (AC-003-02, AC-003-04)
  it('INT-10: heading match updates correct section in 5-section doc', async () => {
    const filePath = path.join(tmpDir, 'multi.md');
    const sections = [];
    for (let i = 1; i <= 5; i++) {
      sections.push(`## Section ${i}\n\nContent ${i}.\n`);
    }
    fs.writeFileSync(filePath, sections.join('\n'));

    const result = await fileOps.appendSection(filePath, '## Section 3', 'New content 3.\n');
    assert.equal(result.success, true);

    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('New content 3.'));
    assert.ok(!content.includes('Content 3.'));

    // Other sections unchanged
    for (const i of [1, 2, 4, 5]) {
      assert.ok(content.includes(`Content ${i}.`));
    }
  });

  // INT-11: Marker match flow updates correct section (AC-003-03)
  it('INT-11: marker match updates correct section', async () => {
    const filePath = path.join(tmpDir, 'marker.md');
    fs.writeFileSync(filePath,
      '<!-- section: intro -->\n## Intro\n\nOld intro.\n\n<!-- section: body -->\n## Body\n\nOld body.\n'
    );

    const result = await fileOps.appendSection(filePath, 'body', 'New body content.\n', { matchBy: 'marker' });
    assert.equal(result.success, true);

    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('New body content.'));
    assert.ok(!content.includes('Old body.'));
    assert.ok(content.includes('Old intro.'));
  });

  // INT-12: Other sections preserved after update (AC-003-04)
  it('INT-12: other sections preserved after update', async () => {
    const filePath = path.join(tmpDir, 'preserve.md');
    const original = '## Alpha\n\nAlpha content.\n\n## Beta\n\nBeta content.\n\n## Gamma\n\nGamma content.\n\n## Delta\n\nDelta content.\n\n## Epsilon\n\nEpsilon content.\n';
    fs.writeFileSync(filePath, original);

    await fileOps.appendSection(filePath, '## Beta', 'Updated Beta.\n');

    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('Alpha content.'));
    assert.ok(content.includes('Updated Beta.'));
    assert.ok(!content.includes('Beta content.'));
    assert.ok(content.includes('Gamma content.'));
    assert.ok(content.includes('Delta content.'));
    assert.ok(content.includes('Epsilon content.'));
  });

  // INT-13: appendSection on non-existent file returns FILE_NOT_FOUND (AC-003-07)
  it('INT-13: non-existent file returns FILE_NOT_FOUND', async () => {
    const filePath = path.join(tmpDir, 'nonexistent-' + Date.now() + '.md');
    const result = await fileOps.appendSection(filePath, '## A', 'content');
    assert.equal(result.success, false);
    assert.ok(result.error.includes('FILE_NOT_FOUND'));
  });

  // INT-14: appendSection on file with no matching section returns SECTION_NOT_FOUND (AC-003-06)
  it('INT-14: no matching section returns SECTION_NOT_FOUND', async () => {
    const filePath = path.join(tmpDir, 'nomatch.md');
    fs.writeFileSync(filePath, '## Existing\n\nContent.\n');

    const result = await fileOps.appendSection(filePath, '## Nonexistent', 'content');
    assert.equal(result.success, false);
    assert.ok(result.error.includes('SECTION_NOT_FOUND'));
  });
});

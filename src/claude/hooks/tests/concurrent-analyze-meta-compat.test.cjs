/**
 * Meta.json Compatibility Tests for Concurrent Roundtable Analysis
 *
 * Verifies backward compatibility of the progressive phases_completed
 * population model used by the concurrent analysis lead orchestrator.
 * These functions in three-verb-utils.cjs are NOT modified -- these tests
 * confirm they handle the new usage patterns correctly.
 *
 * Traces: FR-003, FR-009, FR-014, Risk R8
 * Test IDs: MC-01 through MC-06
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Import functions under test from three-verb-utils.cjs
const {
  deriveAnalysisStatus,
  readMetaJson,
  writeMetaJson,
  computeRecommendedTier
} = require('../lib/three-verb-utils.cjs');

// Helper: create a temp directory for test isolation
function createTempSlugDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'isdlc-meta-compat-'));
  return tmpDir;
}

// Helper: write a meta.json to a temp directory
function writeMeta(slugDir, meta) {
  fs.writeFileSync(
    path.join(slugDir, 'meta.json'),
    JSON.stringify(meta, null, 2),
    'utf8'
  );
}

describe('Concurrent Analyze: meta.json Compatibility', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempSlugDir();
  });

  afterEach(() => {
    // Clean up temp directory
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // MC-01: Progressive phases_completed accumulation
  // Traces: FR-014, FR-003
  describe('MC-01: Progressive phases_completed accumulation', () => {
    it('returns partial status for single phase completed', () => {
      const result = deriveAnalysisStatus(['00-quick-scan']);
      assert.notEqual(result, 'analyzed',
        'Single phase should not produce "analyzed" status');
      assert.equal(result, 'partial',
        'Single phase should produce "partial" status');
    });

    it('returns partial status for two phases completed', () => {
      const result = deriveAnalysisStatus(['00-quick-scan', '01-requirements']);
      assert.equal(result, 'partial',
        'Two phases should produce "partial" status');
    });

    it('returns partial status for three phases completed', () => {
      const result = deriveAnalysisStatus([
        '00-quick-scan', '01-requirements', '02-impact-analysis'
      ]);
      assert.equal(result, 'partial',
        'Three phases should produce "partial" status');
    });

    it('returns partial status for four phases completed', () => {
      const result = deriveAnalysisStatus([
        '00-quick-scan', '01-requirements', '02-impact-analysis', '03-architecture'
      ]);
      assert.equal(result, 'partial',
        'Four phases should produce "partial" status');
    });

    it('returns raw for empty phases_completed', () => {
      const result = deriveAnalysisStatus([]);
      assert.equal(result, 'raw',
        'Empty phases should produce "raw" status');
    });
  });

  // MC-02: Out-of-order phase completion
  // Traces: FR-003 (progressive writes)
  describe('MC-02: Out-of-order phase completion', () => {
    it('handles non-sequential phase order without error', () => {
      // In the concurrent model, phases may complete in any order
      const result = deriveAnalysisStatus([
        '00-quick-scan', '03-architecture'
      ]);
      assert.ok(['partial', 'raw'].includes(result),
        `Expected partial or raw for out-of-order phases, got: ${result}`);
    });

    it('handles reversed order without error', () => {
      const result = deriveAnalysisStatus([
        '04-design', '00-quick-scan', '01-requirements'
      ]);
      assert.ok(['partial', 'raw'].includes(result),
        `Expected partial or raw for reversed order, got: ${result}`);
    });

    it('counts valid phases regardless of order', () => {
      // 2 valid phases should be partial regardless of order
      const result1 = deriveAnalysisStatus(['00-quick-scan', '03-architecture']);
      const result2 = deriveAnalysisStatus(['03-architecture', '00-quick-scan']);
      assert.equal(result1, result2,
        'Phase order should not affect status derivation');
    });
  });

  // MC-03: Full phases_completed produces "analyzed"
  // Traces: FR-014, backward compatibility
  describe('MC-03: Full phases_completed produces "analyzed"', () => {
    it('returns analyzed when all 5 phases are present', () => {
      const result = deriveAnalysisStatus([
        '00-quick-scan',
        '01-requirements',
        '02-impact-analysis',
        '03-architecture',
        '04-design'
      ]);
      assert.equal(result, 'analyzed',
        'All 5 phases should produce "analyzed" status');
    });

    it('returns analyzed regardless of phase order', () => {
      const result = deriveAnalysisStatus([
        '04-design',
        '02-impact-analysis',
        '00-quick-scan',
        '03-architecture',
        '01-requirements'
      ]);
      assert.equal(result, 'analyzed',
        'All 5 phases in any order should produce "analyzed" status');
    });
  });

  // MC-04: meta.json with topics_covered field
  // Traces: FR-009, Design D7
  describe('MC-04: meta.json with topics_covered field', () => {
    it('readMetaJson handles topics_covered without error', () => {
      const meta = {
        source: 'github',
        source_id: 'GH-63',
        slug: 'test-item',
        created_at: '2026-02-21T00:00:00.000Z',
        analysis_status: 'partial',
        phases_completed: ['00-quick-scan'],
        steps_completed: [],
        topics_covered: ['problem-discovery', 'technical-analysis'],
        codebase_hash: 'abc1234',
        depth_overrides: {}
      };
      writeMeta(tmpDir, meta);

      const result = readMetaJson(tmpDir);
      assert.ok(result, 'readMetaJson returned null');
      assert.ok(Array.isArray(result.topics_covered),
        'topics_covered should be preserved as an array');
      assert.equal(result.topics_covered.length, 2,
        'topics_covered should have 2 entries');
      assert.ok(result.topics_covered.includes('problem-discovery'),
        'topics_covered should include problem-discovery');
    });

    it('writeMetaJson preserves topics_covered through read/write cycle', () => {
      const meta = {
        source: 'github',
        source_id: 'GH-63',
        slug: 'test-item',
        created_at: '2026-02-21T00:00:00.000Z',
        analysis_status: 'partial',
        phases_completed: ['00-quick-scan'],
        steps_completed: [],
        topics_covered: ['problem-discovery', 'technical-analysis'],
        codebase_hash: 'abc1234',
        depth_overrides: {}
      };

      writeMetaJson(tmpDir, meta);
      const result = readMetaJson(tmpDir);
      assert.ok(result, 'readMetaJson returned null after writeMetaJson');
      assert.ok(Array.isArray(result.topics_covered),
        'topics_covered should survive read/write cycle');
      assert.deepEqual(result.topics_covered, ['problem-discovery', 'technical-analysis'],
        'topics_covered values should be preserved exactly');
    });
  });

  // MC-05: meta.json without steps_completed
  // Traces: FR-009, backward compatibility
  describe('MC-05: meta.json without steps_completed', () => {
    it('readMetaJson handles missing steps_completed gracefully', () => {
      const meta = {
        source: 'github',
        source_id: 'GH-63',
        slug: 'test-item',
        created_at: '2026-02-21T00:00:00.000Z',
        analysis_status: 'partial',
        phases_completed: ['00-quick-scan', '01-requirements']
        // Deliberately omitting steps_completed
      };
      writeMeta(tmpDir, meta);

      const result = readMetaJson(tmpDir);
      assert.ok(result, 'readMetaJson should not return null for missing steps_completed');
      // steps_completed should default or be absent -- either is acceptable
      // The important thing is no crash
    });

    it('readMetaJson handles missing steps_completed and topics_covered', () => {
      const meta = {
        source: 'github',
        source_id: 'GH-63',
        slug: 'test-item',
        created_at: '2026-02-21T00:00:00.000Z',
        analysis_status: 'raw',
        phases_completed: []
        // No steps_completed, no topics_covered
      };
      writeMeta(tmpDir, meta);

      const result = readMetaJson(tmpDir);
      assert.ok(result, 'readMetaJson should not return null');
      // Should not throw -- this is the key assertion
    });
  });

  // MC-06: Sizing trigger with concurrent meta.json
  // Traces: FR-014, Risk R8
  describe('MC-06: Sizing with concurrent meta.json', () => {
    it('computeRecommendedTier works with typical file counts', () => {
      // This function is pure -- it takes file count and risk level
      // The concurrent model doesn't change its inputs or behavior
      const result = computeRecommendedTier(15, 'medium');
      assert.ok(['trivial', 'light', 'standard', 'epic'].includes(result),
        `computeRecommendedTier returned unexpected tier: ${result}`);
    });

    it('computeRecommendedTier handles null inputs', () => {
      const result = computeRecommendedTier(null, null);
      assert.ok(['trivial', 'light', 'standard', 'epic'].includes(result),
        `computeRecommendedTier should handle null inputs gracefully: ${result}`);
    });

    it('deriveAnalysisStatus works with full concurrent model meta.json', () => {
      // Simulate meta.json as written by the concurrent model
      const meta = {
        source: 'github',
        source_id: 'GH-63',
        slug: 'test-item',
        created_at: '2026-02-21T00:00:00.000Z',
        analysis_status: 'analyzed',
        phases_completed: [
          '00-quick-scan', '01-requirements', '02-impact-analysis',
          '03-architecture', '04-design'
        ],
        steps_completed: ['00-01', '01-01', '01-02', '02-01', '03-01', '04-01'],
        topics_covered: [
          'problem-discovery', 'requirements-definition',
          'technical-analysis', 'architecture', 'specification', 'security'
        ],
        codebase_hash: 'abc1234'
      };
      writeMeta(tmpDir, meta);

      const result = readMetaJson(tmpDir);
      assert.ok(result, 'readMetaJson should handle concurrent model meta.json');

      const status = deriveAnalysisStatus(result.phases_completed);
      assert.equal(status, 'analyzed',
        'Full concurrent meta.json should derive as "analyzed"');
    });
  });
});

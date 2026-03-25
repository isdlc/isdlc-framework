/**
 * Tests for src/claude/hooks/config/phase-topology.json
 * REQ-0068: Phase topology config validation
 * Test ID prefix: PT-
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOPOLOGY_PATH = resolve(__dirname, '../../../src/claude/hooks/config/phase-topology.json');

let topology;

// ---------------------------------------------------------------------------
// PT-01: Valid JSON
// ---------------------------------------------------------------------------

describe('phase-topology.json', () => {
  it('PT-01: is valid JSON and parseable', () => {
    const content = readFileSync(TOPOLOGY_PATH, 'utf8');
    topology = JSON.parse(content);
    assert.ok(topology);
    assert.ok(topology.phases);
  });

  it('PT-06: version field is present and follows semver format', () => {
    if (!topology) topology = JSON.parse(readFileSync(TOPOLOGY_PATH, 'utf8'));
    assert.ok(topology.version);
    assert.match(topology.version, /^\d+\.\d+\.\d+$/);
  });
});

// ---------------------------------------------------------------------------
// PT-02, PT-03: Multi-agent phases
// ---------------------------------------------------------------------------

describe('multi-agent phases', () => {
  it('PT-02: phases with sub-agents have nodes array with id, agent, label', () => {
    if (!topology) topology = JSON.parse(readFileSync(TOPOLOGY_PATH, 'utf8'));
    const impact = topology.phases['02-impact-analysis'];
    assert.ok(impact);
    assert.ok(Array.isArray(impact.nodes));
    assert.ok(impact.nodes.length > 1);
    for (const node of impact.nodes) {
      assert.ok(node.id, 'node must have id');
      assert.ok(node.agent, 'node must have agent');
      assert.ok(node.label, 'node must have label');
    }
  });

  it('PT-03: phases with sub-agents have edges array with from, to', () => {
    if (!topology) topology = JSON.parse(readFileSync(TOPOLOGY_PATH, 'utf8'));
    const impact = topology.phases['02-impact-analysis'];
    assert.ok(Array.isArray(impact.edges));
    assert.ok(impact.edges.length > 0);
    for (const edge of impact.edges) {
      assert.ok(edge.from, 'edge must have from');
      assert.ok(edge.to, 'edge must have to');
    }
  });
});

// ---------------------------------------------------------------------------
// PT-04: Single-agent phases
// ---------------------------------------------------------------------------

describe('single-agent phases', () => {
  it('PT-04: single-agent phases have exactly one node and no edges', () => {
    if (!topology) topology = JSON.parse(readFileSync(TOPOLOGY_PATH, 'utf8'));
    const reqs = topology.phases['01-requirements'];
    assert.ok(reqs);
    assert.equal(reqs.nodes.length, 1);
    assert.equal(reqs.edges.length, 0);
  });
});

// ---------------------------------------------------------------------------
// PT-05: Graceful fallback for missing phase
// ---------------------------------------------------------------------------

describe('graceful fallback', () => {
  it('PT-05: missing phase key returns undefined', () => {
    if (!topology) topology = JSON.parse(readFileSync(TOPOLOGY_PATH, 'utf8'));
    const result = topology.phases['custom-nonexistent-phase'];
    assert.equal(result, undefined);
  });
});

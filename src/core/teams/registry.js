/**
 * Team Spec Registry — lookup and enumeration for all team types
 *
 * Loads all 4 spec objects at module load and provides:
 * - getTeamSpec(teamType): O(1) Map lookup, throws ERR-TEAM-001 on unknown
 * - listTeamTypes(): returns all registered type strings
 *
 * Requirements: FR-002 (AC-002-01..03), FR-005 (AC-005-02)
 * @module src/core/teams/registry
 */

import { implementationReviewLoopSpec } from './specs/implementation-review-loop.js';
import { fanOutSpec } from './specs/fan-out.js';
import { dualTrackSpec } from './specs/dual-track.js';
import { debateSpec } from './specs/debate.js';

/** @type {Map<string, Object>} */
const registry = new Map([
  ['implementation_review_loop', implementationReviewLoopSpec],
  ['fan_out', fanOutSpec],
  ['dual_track', dualTrackSpec],
  ['debate', debateSpec]
]);

/**
 * Get the team spec for a given team type.
 *
 * @param {string} teamType - One of the registered team types
 * @returns {Object} Frozen team spec object
 * @throws {Error} ERR-TEAM-001 if teamType is not registered
 */
export function getTeamSpec(teamType) {
  const spec = registry.get(teamType);
  if (!spec) {
    const available = [...registry.keys()].join(', ');
    throw new Error(
      `Unknown team type: "${teamType}". Available types: ${available}`
    );
  }
  return spec;
}

/**
 * List all registered team type strings.
 *
 * @returns {string[]} Array of team type identifiers
 */
export function listTeamTypes() {
  return [...registry.keys()];
}

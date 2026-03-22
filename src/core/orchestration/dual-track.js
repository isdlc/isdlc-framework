/**
 * Provider-Neutral Dual-Track Orchestrator
 *
 * Executes Track A and Track B in parallel with atomic retry semantics.
 * When test counts exceed a threshold, Track A is split via fan-out
 * sub-orchestration.
 *
 * Requirements: REQ-0131 FR-001..FR-004
 * Dependencies: provider-runtime (interface), fan-out (sub-orchestration)
 *
 * @module src/core/orchestration/dual-track
 */

import { runFanOut } from './fan-out.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default maximum iterations before giving up. */
const DEFAULT_MAX_ITERATIONS = 10;

/** Default chunk size for fan-out splitting. */
const DEFAULT_CHUNK_SIZE = 25;

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Determine whether fan-out should be activated.
 *
 * @param {Object} context - Execution context with test_count
 * @param {Object} fanOutPolicy - Policy with trigger_threshold
 * @returns {boolean}
 */
function shouldFanOut(context, fanOutPolicy) {
  if (!fanOutPolicy || typeof fanOutPolicy.trigger_threshold !== 'number') {
    return false;
  }
  return (context.test_count || 0) >= fanOutPolicy.trigger_threshold;
}

/**
 * Check if a result indicates success.
 *
 * @param {Object} result - TaskResult
 * @returns {boolean}
 */
function isSuccess(result) {
  return result && (result.status === 'completed' || result.status === 'passed');
}

/**
 * Find a result in the parallel results array by task ID.
 *
 * @param {Array<Object>} results - Results from executeParallel
 * @param {string} id - Task ID to find
 * @returns {Object|null}
 */
function findResult(results, id) {
  return results.find(r => r.memberId === id) || null;
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

/**
 * Run the dual-track orchestrator.
 *
 * Spawns Track A and Track B in parallel. If either fails, both are retried
 * atomically up to max_iterations. When test_count exceeds the fan-out
 * trigger threshold, Track A is split into chunks via runFanOut.
 *
 * @param {Object} runtime - ProviderRuntime instance
 * @param {Object} instanceConfig - Dual-track config with trackA, trackB, policies
 * @param {Object} context - Execution context including test_count
 * @returns {Promise<Object>} Dual-track result
 */
export async function runDualTrack(runtime, instanceConfig, context) {
  const retryPolicy = instanceConfig.policies?.retry || {};
  const fanOutPolicy = instanceConfig.policies?.fan_out || {};
  const maxIterations = retryPolicy.max_iterations ?? DEFAULT_MAX_ITERATIONS;

  const useFanOut = shouldFanOut(context, fanOutPolicy);

  let trackAResult = null;
  let trackBResult = null;
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;

    const iterationContext = {
      ...context,
      iteration,
      previous_failure: iteration > 1
        ? { trackA: trackAResult, trackB: trackBResult }
        : null
    };

    if (useFanOut) {
      // FR-003: Fan-out sub-orchestration for Track A
      // Run fan-out for Track A and single executeTask for Track B in parallel
      const [fanOutResult, bResults] = await Promise.all([
        runFanOut(runtime, {
          members: buildFanOutChunks(instanceConfig.trackA, context),
          merge_policy: 'consolidate'
        }, iterationContext),
        runtime.executeParallel([
          { id: 'trackB', ...instanceConfig.trackB, context: iterationContext }
        ])
      ]);

      trackAResult = {
        status: fanOutResult.error ? 'failed' : 'completed',
        output: fanOutResult.merged_output,
        duration_ms: fanOutResult.duration_ms,
        memberId: 'trackA',
        error: fanOutResult.error || undefined
      };

      trackBResult = bResults[0];
      if (!trackBResult.memberId) trackBResult.memberId = 'trackB';
    } else {
      // Standard parallel execution of both tracks
      const tasks = [
        { id: 'trackA', ...instanceConfig.trackA, context: iterationContext },
        { id: 'trackB', ...instanceConfig.trackB, context: iterationContext }
      ];

      const results = await runtime.executeParallel(tasks);

      // Assign memberIds if not present
      for (let i = 0; i < results.length; i++) {
        if (!results[i].memberId) {
          results[i].memberId = tasks[i].id;
        }
      }

      trackAResult = findResult(results, 'trackA') || results[0];
      trackBResult = findResult(results, 'trackB') || results[1];
    }

    // FR-001: Both must pass
    if (isSuccess(trackAResult) && isSuccess(trackBResult)) {
      return {
        trackA: trackAResult,
        trackB: trackBResult,
        iterations_used: iteration,
        fan_out_used: useFanOut
      };
    }

    // Continue retry loop
  }

  // FR-002: Max iterations reached — return last results with failure state
  return {
    trackA: trackAResult || { status: 'failed', output: null, duration_ms: 0, memberId: 'trackA' },
    trackB: trackBResult || { status: 'failed', output: null, duration_ms: 0, memberId: 'trackB' },
    iterations_used: iteration,
    fan_out_used: useFanOut
  };
}

/**
 * Build fan-out chunk members from Track A configuration.
 *
 * @param {Object} trackAConfig - Track A configuration
 * @param {Object} context - Context with test_count for sizing
 * @returns {Array<Object>} Member objects for fan-out
 */
function buildFanOutChunks(trackAConfig, context) {
  const testCount = context.test_count || 0;
  const chunkSize = DEFAULT_CHUNK_SIZE;
  const numChunks = Math.max(1, Math.ceil(testCount / chunkSize));

  const chunks = [];
  for (let i = 0; i < numChunks; i++) {
    chunks.push({
      id: `trackA-chunk-${i}`,
      prompt: trackAConfig.prompt || 'Execute chunk',
      required: true,
      chunkIndex: i,
      chunkTotal: numChunks
    });
  }

  return chunks;
}

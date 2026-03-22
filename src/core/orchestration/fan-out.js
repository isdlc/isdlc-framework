/**
 * Provider-Neutral Fan-Out Orchestrator
 *
 * Dispatches multiple member tasks in parallel via the runtime adapter,
 * merges results according to configurable policies, and handles fail-open
 * for optional members.
 *
 * Requirements: REQ-0130 FR-001..FR-004
 * Dependencies: provider-runtime (interface)
 *
 * @module src/core/orchestration/fan-out
 */

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Build task objects from instance members and shared context.
 *
 * @param {Array<Object>} members - Member configs with id, prompt, required
 * @param {Object} context - Shared context passed to all tasks
 * @returns {Array<Object>} Task objects for executeParallel
 */
function buildTasks(members, context) {
  return members.map(member => ({
    id: member.id,
    memberId: member.id,
    prompt: member.prompt,
    memberConfig: member,
    context: { ...context }
  }));
}

/**
 * Partition raw results into successes and failures.
 *
 * @param {Array<Object>} rawResults - Results from executeParallel
 * @param {Array<Object>} members - Member configs (for required check)
 * @returns {{ successes: Array, failures: Array, fatalFailures: Array }}
 */
function partitionResults(rawResults, members) {
  const memberMap = new Map(members.map(m => [m.id, m]));
  const successes = [];
  const failures = [];
  const fatalFailures = [];

  for (const result of rawResults) {
    const memberId = result.memberId;
    const member = memberMap.get(memberId);
    const isSuccess = result.status === 'completed' || result.status === 'passed';

    if (isSuccess) {
      successes.push(result);
    } else {
      // Default required to true if not specified
      const isRequired = member ? (member.required !== false) : true;
      if (isRequired) {
        fatalFailures.push(result);
      } else {
        failures.push(result);
      }
    }
  }

  return { successes, failures, fatalFailures };
}

/**
 * Apply merge policy to successful results.
 *
 * @param {Array<Object>} successes - Successful result objects
 * @param {string} policy - 'consolidate' or 'last_wins'
 * @returns {*} Merged output
 */
function applyMergePolicy(successes, policy) {
  if (successes.length === 0) {
    return policy === 'consolidate' ? [] : null;
  }

  if (policy === 'last_wins') {
    return successes[successes.length - 1];
  }

  // Default: consolidate — combine all with attribution
  return successes.map(r => ({
    memberId: r.memberId,
    output: r.output,
    duration_ms: r.duration_ms
  }));
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

/**
 * Run the fan-out orchestrator.
 *
 * Dispatches all member tasks in parallel, partitions results, applies
 * the merge policy, and handles fail-open for optional members.
 *
 * @param {Object} runtime - ProviderRuntime instance
 * @param {Object} instanceConfig - Team instance config { members, merge_policy }
 * @param {Object} context - Shared context for all member tasks
 * @returns {Promise<Object>} Fan-out result
 */
export async function runFanOut(runtime, instanceConfig, context) {
  const startTime = Date.now();
  const members = instanceConfig.members || [];
  const mergePolicy = instanceConfig.merge_policy || 'consolidate';

  // FR-001: Build tasks and dispatch in parallel
  const tasks = buildTasks(members, context);
  const rawResults = await runtime.executeParallel(tasks);

  // Assign memberIds from tasks if not present in results
  for (let i = 0; i < rawResults.length; i++) {
    if (!rawResults[i].memberId && tasks[i]) {
      rawResults[i].memberId = tasks[i].id;
    }
  }

  // FR-003: Partition into successes, optional failures, fatal failures
  const { successes, failures, fatalFailures } = partitionResults(rawResults, members);

  // Build results Map
  const results = new Map();
  for (const result of rawResults) {
    results.set(result.memberId, result);
  }

  // Failed member IDs (non-required only)
  const failed_members = failures.map(f => f.memberId);

  // FR-002: Apply merge policy
  const merged_output = applyMergePolicy(successes, mergePolicy);

  const duration_ms = Date.now() - startTime;

  // FR-003: If any required member failed, signal overall failure
  if (fatalFailures.length > 0) {
    return {
      results,
      merged_output,
      failed_members,
      duration_ms,
      error: `Required members failed: ${fatalFailures.map(f => f.memberId).join(', ')}`
    };
  }

  return {
    results,
    merged_output,
    failed_members,
    duration_ms
  };
}

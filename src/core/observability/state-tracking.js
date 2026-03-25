/**
 * State Tracking Extensions for Execution Observability
 *
 * REQ-0068: Capture sub-agent execution, hook events, artifact creation,
 * and provider attribution during workflows.
 *
 * Append-only arrays in active_workflow:
 *   - sub_agent_log[]
 *   - hook_events[]
 *   - artifacts_produced[]
 *
 * All writes go through the caller's stateWriter — this module never
 * touches the file system directly (ADR-003, AC-006-05).
 *
 * @module src/core/observability/state-tracking
 */

/**
 * Append a sub-agent log entry to active_workflow.sub_agent_log[].
 *
 * @param {object} state - Mutable state object (state.json content)
 * @param {object} entry
 * @param {string} entry.parent_agent
 * @param {string} entry.agent
 * @param {string|null} [entry.agent_id]
 * @param {string} entry.phase
 * @param {string} entry.started_at - ISO-8601
 * @param {string|null} [entry.completed_at]
 * @param {string} entry.status - "running" | "completed" | "failed"
 * @param {number|null} [entry.duration_ms]
 * @param {number|null} [entry.tokens_used] - May be null for Codex (AC-006-06)
 * @param {string} entry.provider - "claude" | "codex" | "antigravity" | "unknown"
 * @returns {object} The appended entry
 */
export function appendSubAgentLog(state, entry) {
  if (!state.active_workflow) return entry;
  if (!Array.isArray(state.active_workflow.sub_agent_log)) {
    state.active_workflow.sub_agent_log = [];
  }
  const record = {
    parent_agent: entry.parent_agent || null,
    agent: entry.agent || null,
    agent_id: entry.agent_id ?? null,
    phase: entry.phase || null,
    started_at: entry.started_at || new Date().toISOString(),
    completed_at: entry.completed_at ?? null,
    status: entry.status || 'running',
    duration_ms: entry.duration_ms ?? null,
    tokens_used: entry.tokens_used ?? null,
    provider: entry.provider || 'unknown'
  };
  state.active_workflow.sub_agent_log.push(record);
  return record;
}

/**
 * Append a hook event entry to active_workflow.hook_events[].
 *
 * @param {object} state - Mutable state object
 * @param {object} entry
 * @param {string} entry.timestamp - ISO-8601
 * @param {string} entry.hook - Hook name or governance check name
 * @param {string} entry.phase
 * @param {string} entry.action - "blocked" | "warned" | "allowed"
 * @param {string} entry.reason
 * @param {string|null} [entry.resolution]
 * @param {string} [entry.provider] - Which provider's enforcement surface
 * @returns {object} The appended entry
 */
export function appendHookEvent(state, entry) {
  if (!state.active_workflow) return entry;
  if (!Array.isArray(state.active_workflow.hook_events)) {
    state.active_workflow.hook_events = [];
  }
  const record = {
    timestamp: entry.timestamp || new Date().toISOString(),
    hook: entry.hook || null,
    phase: entry.phase || null,
    action: entry.action || null,
    reason: entry.reason || null,
    resolution: entry.resolution ?? null,
    provider: entry.provider || 'unknown'
  };
  state.active_workflow.hook_events.push(record);
  return record;
}

/**
 * Append an artifact-produced entry to active_workflow.artifacts_produced[].
 *
 * @param {object} state - Mutable state object
 * @param {object} entry
 * @param {string} entry.timestamp - ISO-8601
 * @param {string} entry.phase
 * @param {string} entry.file_path - Relative to project root
 * @param {string} entry.action - "created" | "modified"
 * @returns {object} The appended entry
 */
export function appendArtifactProduced(state, entry) {
  if (!state.active_workflow) return entry;
  if (!Array.isArray(state.active_workflow.artifacts_produced)) {
    state.active_workflow.artifacts_produced = [];
  }
  const record = {
    timestamp: entry.timestamp || new Date().toISOString(),
    phase: entry.phase || null,
    file_path: entry.file_path || null,
    action: entry.action || 'created'
  };
  state.active_workflow.artifacts_produced.push(record);
  return record;
}

/**
 * Get the sub_agent_log array, returning [] if missing.
 * @param {object} state
 * @returns {Array}
 */
export function getSubAgentLog(state) {
  return state?.active_workflow?.sub_agent_log ?? [];
}

/**
 * Get the hook_events array, returning [] if missing.
 * @param {object} state
 * @returns {Array}
 */
export function getHookEvents(state) {
  return state?.active_workflow?.hook_events ?? [];
}

/**
 * Get the artifacts_produced array, returning [] if missing.
 * @param {object} state
 * @returns {Array}
 */
export function getArtifactsProduced(state) {
  return state?.active_workflow?.artifacts_produced ?? [];
}

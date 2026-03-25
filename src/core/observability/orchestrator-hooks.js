/**
 * Orchestrator Observability Callbacks
 *
 * REQ-0068: Wires observability data collection into provider-neutral
 * orchestrators (phase-loop.js, fan-out.js, dual-track.js).
 *
 * Provides callback implementations for onPhaseStart, onPhaseComplete,
 * and onError that write observability data to state.json via the
 * state-tracking module.
 *
 * @module src/core/observability/orchestrator-hooks
 */

import {
  appendSubAgentLog,
  appendHookEvent,
  appendArtifactProduced
} from './state-tracking.js';

/**
 * Create observability callbacks compatible with phase-loop.js options.
 *
 * @param {object} stateWriter - { readState(), writeState(state) }
 * @param {string} providerName - Provider name from routing ("claude", "codex", etc.)
 * @returns {{ onPhaseStart: Function, onPhaseComplete: Function, onError: Function }}
 */
export function createObservabilityCallbacks(stateWriter, providerName) {
  const provider = providerName || 'unknown';

  return {
    /**
     * Called before each phase executes.
     * Appends a sub_agent_log entry with status "running".
     *
     * @param {string} phase - Phase key (e.g., "06-implementation")
     */
    onPhaseStart(phase) {
      try {
        const state = stateWriter.readState();
        appendSubAgentLog(state, {
          parent_agent: 'phase-loop',
          agent: phase,
          agent_id: null,
          phase,
          started_at: new Date().toISOString(),
          status: 'running',
          provider
        });
        stateWriter.writeState(state);
      } catch (_err) {
        // Fail-open: observability must not block workflow (ADR-003)
      }
    },

    /**
     * Called after each phase completes successfully.
     * Updates sub_agent_log entry and writes provider to phase state.
     *
     * @param {string} phase - Phase key
     * @param {object} result - { status, output, duration_ms, error, files? }
     */
    onPhaseComplete(phase, result) {
      try {
        const state = stateWriter.readState();
        const now = new Date().toISOString();

        // Append completion entry to sub_agent_log
        appendSubAgentLog(state, {
          parent_agent: 'phase-loop',
          agent: phase,
          agent_id: null,
          phase,
          started_at: now,
          completed_at: now,
          status: 'completed',
          duration_ms: result?.duration_ms ?? null,
          tokens_used: result?.tokens_used ?? null,
          provider
        });

        // Write provider to phase state (AC-007-01)
        if (state.phases && state.phases[phase]) {
          state.phases[phase].provider = provider;
        }

        // Append artifacts if result contains file paths
        if (result?.files && Array.isArray(result.files)) {
          for (const filePath of result.files) {
            appendArtifactProduced(state, {
              timestamp: now,
              phase,
              file_path: filePath,
              action: 'created'
            });
          }
        }

        stateWriter.writeState(state);
      } catch (_err) {
        // Fail-open
      }
    },

    /**
     * Called when a phase fails.
     * Appends hook_events entry and marks sub_agent_log as failed.
     *
     * @param {string} phase - Phase key
     * @param {string|Error} error - Error message or Error object
     */
    onError(phase, error) {
      try {
        const state = stateWriter.readState();
        const now = new Date().toISOString();
        const reason = typeof error === 'string' ? error : (error?.message || 'Unknown error');

        // Append hook event
        appendHookEvent(state, {
          timestamp: now,
          hook: 'phase-execution',
          phase,
          action: 'blocked',
          reason,
          resolution: null,
          provider
        });

        // Append failed sub_agent_log entry
        appendSubAgentLog(state, {
          parent_agent: 'phase-loop',
          agent: phase,
          agent_id: null,
          phase,
          started_at: now,
          completed_at: now,
          status: 'failed',
          duration_ms: null,
          tokens_used: null,
          provider
        });

        stateWriter.writeState(state);
      } catch (_err) {
        // Fail-open
      }
    }
  };
}

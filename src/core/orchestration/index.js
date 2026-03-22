/**
 * Orchestration Module — barrel re-export of all orchestrators
 *
 * Aggregates the 5 provider-neutral orchestrators and the runtime interface
 * for convenient single-import access.
 *
 * Requirements: REQ-0129 through REQ-0133
 * @module src/core/orchestration/index
 */

// Provider Runtime Interface
export {
  PROVIDER_RUNTIME_INTERFACE,
  TASK_RESULT_FIELDS,
  KNOWN_PROVIDERS,
  createProviderRuntime,
  validateProviderRuntime,
  getKnownProviders
} from './provider-runtime.js';

// Phase-Loop Orchestrator (REQ-0129)
export { runPhaseLoop, getAgentForPhase } from './phase-loop.js';

// Fan-Out Orchestrator (REQ-0130)
export { runFanOut } from './fan-out.js';

// Dual-Track Orchestrator (REQ-0131)
export { runDualTrack } from './dual-track.js';

// Discover Orchestrator (REQ-0132)
export { runDiscover } from './discover.js';

// Analyze Orchestrator (REQ-0133)
export { runAnalyze } from './analyze.js';

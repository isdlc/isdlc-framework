/**
 * Finalize step: push delta-refresh of changed files to embedding server.
 *
 * Called at workflow finalize. Reads the list of changed files from
 * the workflow state and POSTs them to the server's /refresh endpoint.
 *
 * Fail-open: if server is unreachable, logs warning and continues.
 *
 * REQ-GH-224 FR-005, FR-015
 * @module src/core/finalize/refresh-embeddings
 */

import { getServerConfig, isServerReachable } from '../../../lib/embedding/server/port-discovery.js';
import { pushRefresh } from '../../../lib/embedding/server/refresh-client.js';

/**
 * Extract changed files from workflow state.
 *
 * @param {object} state - .isdlc/state.json content
 * @returns {Array<{path: string, operation: string}>}
 */
function extractChangedFiles(state) {
  // Look in active_workflow for changed_files tracking
  const activeWorkflow = state.active_workflow || {};

  // Prefer explicit changed_files list if maintained
  if (Array.isArray(activeWorkflow.changed_files)) {
    return activeWorkflow.changed_files.map(f => ({
      path: typeof f === 'string' ? f : f.path,
      operation: typeof f === 'object' ? (f.operation || 'modify') : 'modify',
    }));
  }

  // Fallback: gather from phase artifacts
  const files = [];
  const phases = state.phases || {};
  for (const phase of Object.values(phases)) {
    if (Array.isArray(phase.artifacts)) {
      for (const artifact of phase.artifacts) {
        files.push({ path: artifact, operation: 'modify' });
      }
    }
  }
  return files;
}

/**
 * Run the refresh-embeddings finalize step.
 *
 * @param {object} context
 * @param {string} context.projectRoot
 * @param {object} context.state - Parsed .isdlc/state.json
 * @returns {Promise<{success: boolean, refreshed?: number, error?: string, skipped?: boolean}>}
 */
export async function refreshEmbeddings(context) {
  const { projectRoot, state } = context;
  const config = getServerConfig(projectRoot);

  // Check server reachable (fail-open)
  const reachable = await isServerReachable(config.host, config.port, 2000);
  if (!reachable) {
    return {
      success: true, // Fail-open
      skipped: true,
      reason: `server not reachable at ${config.host}:${config.port}`,
    };
  }

  const changedFiles = extractChangedFiles(state);
  if (changedFiles.length === 0) {
    return { success: true, refreshed: 0, skipped: true, reason: 'no changed files' };
  }

  const result = await pushRefresh(config.host, config.port, changedFiles);
  if (!result.ok) {
    return { success: true, skipped: true, error: result.error }; // Fail-open
  }

  return {
    success: true,
    refreshed: result.refreshed || 0,
    deleted: result.deleted || 0,
    errors: result.errors || [],
  };
}

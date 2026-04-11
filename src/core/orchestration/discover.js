/**
 * Provider-Neutral Discover Orchestrator
 *
 * Executes the project discovery flow: menu presentation, agent group
 * execution (parallel or sequential), state tracking, and resume support.
 *
 * Requirements: REQ-0132 FR-001..FR-005
 * Dependencies: provider-runtime (interface), discover/index (modes, groups, state)
 *
 * @module src/core/orchestration/discover
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getDiscoverMode, getAgentGroup } from '../discover/index.js';
import {
  createInitialDiscoverState,
  computeResumePoint,
  markStepComplete
} from '../discover/discover-state-schema.js';
import { getMenu, getWalkthrough } from '../discover/ux-flows.js';

// ---------------------------------------------------------------------------
// Menu-to-Mode Mapping
// ---------------------------------------------------------------------------

/**
 * Maps menu option IDs to discover mode IDs.
 * @type {Readonly<Object<string, string|null>>}
 */
const MENU_OPTION_TO_MODE = Object.freeze({
  'new_project':       'discover_new',
  'existing_analysis': 'discover_existing',
  'rerun':             'discover_existing',
  'incremental':       'discover_incremental',
  'deep':              'discover_deep',
  'chat_explore':      null
});

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Build a task object for a group member.
 *
 * @param {string} memberId - Agent ID
 * @param {Object} context - Accumulated context
 * @returns {Object} Task object
 */
function buildTask(memberId, context) {
  return {
    id: memberId,
    memberId,
    prompt: `Execute discover agent: ${memberId}`,
    context: { ...context }
  };
}

/**
 * Merge a group's results into accumulated context.
 *
 * @param {Object} context - Current accumulated context
 * @param {string} groupId - Group that produced results
 * @param {*} results - Results from the group
 * @returns {Object} Updated context
 */
function mergeGroupResults(context, groupId, results) {
  return {
    ...context,
    priorResults: {
      ...(context.priorResults || {}),
      [groupId]: results
    }
  };
}

/**
 * Get walkthrough steps for a mode, with fallback for incremental.
 *
 * @param {string} modeId - Discover mode ID
 * @returns {Array<Object>} Walkthrough steps
 */
function getStepsForMode(modeId) {
  if (modeId === 'discover_incremental') {
    // Incremental has a single implicit step
    return [{ id: 'step_core_analyzers', agent_group: 'core_analyzers', optional: false }];
  }

  try {
    const wt = getWalkthrough(modeId);
    return wt.steps;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

/**
 * Run the discover orchestrator.
 *
 * Presents a menu to select discovery mode (unless provided), executes
 * agent groups for the mode, tracks state, and supports resume.
 *
 * @param {Object} runtime - ProviderRuntime instance
 * @param {Object} options - Discover options
 * @param {string} [options.mode] - Mode override (skips menu)
 * @param {string} [options.projectRoot] - Project root path
 * @param {Object} [options.existingState] - Prior discover state (for returning users)
 * @param {Object} [options.resumeState] - Partial state to resume from
 * @returns {Promise<Object>} Final discover state
 */
export async function runDiscover(runtime, options = {}) {
  const { projectRoot, existingState, resumeState } = options;
  let { mode } = options;

  // ---------------------------------------------------------------------------
  // Step 1: Resume check
  // ---------------------------------------------------------------------------

  if (resumeState) {
    return await resumeDiscover(runtime, resumeState, projectRoot);
  }

  // ---------------------------------------------------------------------------
  // Step 2: Present menu (if mode not provided)
  // ---------------------------------------------------------------------------

  if (!mode) {
    const menuId = existingState ? 'returning' : 'first_time';
    const menuPrompt = { type: 'discover_menu', menuId };
    const userChoice = await runtime.presentInteractive(menuPrompt);
    mode = MENU_OPTION_TO_MODE[userChoice] || null;

    if (mode === null || mode === undefined) {
      // Chat/explore — return minimal state
      return {
        status: 'completed',
        flow_type: null,
        completed_steps: [],
        current_step: null,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        last_resumed_at: null,
        depth_level: null,
        discovery_context: null
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Step 3: Validate mode
  // ---------------------------------------------------------------------------

  // This will throw if mode is unknown
  getDiscoverMode(mode);

  // ---------------------------------------------------------------------------
  // Step 4: Create initial state and execute groups
  // ---------------------------------------------------------------------------

  const state = createInitialDiscoverState(mode);
  state.status = 'in_progress';

  return await executeGroupsForMode(runtime, mode, state, projectRoot);
}

/**
 * Resume a partial discover from the first incomplete step.
 *
 * @param {Object} runtime - ProviderRuntime instance
 * @param {Object} resumeState - Partial state to resume from
 * @param {string} projectRoot - Project root path
 * @returns {Promise<Object>} Updated state
 */
async function resumeDiscover(runtime, resumeState, projectRoot) {
  const state = { ...resumeState };
  state.last_resumed_at = new Date().toISOString();
  state.status = 'in_progress';

  return await executeGroupsForMode(runtime, state.flow_type, state, projectRoot);
}

/**
 * Execute all agent groups for a given mode, skipping already-completed steps.
 *
 * @param {Object} runtime - ProviderRuntime instance
 * @param {string} modeId - Discover mode ID
 * @param {Object} state - Mutable discover state
 * @param {string} projectRoot - Project root path
 * @returns {Promise<Object>} Updated state
 */
async function executeGroupsForMode(runtime, modeId, state, projectRoot) {
  const steps = getStepsForMode(modeId);
  const completedSet = new Set(state.completed_steps || []);
  let accumulatedContext = { projectRoot, priorResults: {} };

  for (const step of steps) {
    // FR-005: Skip already-completed steps
    if (completedSet.has(step.id)) {
      continue;
    }

    state.current_step = step.id;

    // Get agent group config
    let groupConfig;
    try {
      groupConfig = getAgentGroup(step.agent_group);
    } catch {
      // Unknown group — skip gracefully
      markStepComplete(state, step.id);
      continue;
    }

    // FR-003: Execute group based on parallelism setting
    let groupResults;
    if (groupConfig.parallelism === 'parallel') {
      const tasks = groupConfig.members.map(m => buildTask(m, accumulatedContext));
      groupResults = await runtime.executeParallel(tasks);
    } else {
      // Sequential execution
      groupResults = [];
      for (const member of groupConfig.members) {
        const task = buildTask(member, accumulatedContext);
        const result = await runtime.executeTask(step.id, member, accumulatedContext);
        groupResults.push(result);
        // Update context with each sequential result
        accumulatedContext = mergeGroupResults(accumulatedContext, member, result);
      }
    }

    // Update accumulated context with group results
    accumulatedContext = mergeGroupResults(accumulatedContext, step.agent_group, groupResults);

    // FR-004: Mark step complete
    markStepComplete(state, step.id);
  }

  // Check completion
  const resumePoint = computeResumePoint(state);
  if (!resumePoint) {
    // Run embedding generation as post-discover step
    if (projectRoot) {
      await runPostDiscoverEmbeddings(projectRoot);
    }
    state.status = 'completed';
    state.completed_at = new Date().toISOString();
  }

  return state;
}

// ---------------------------------------------------------------------------
// Post-Discover Embedding Generation
// ---------------------------------------------------------------------------

/**
 * Generate embeddings after discover completes, then load into running server.
 * Reads config from .isdlc/config.json. Skips silently if embedding engine
 * is unavailable or config disables auto generation.
 *
 * @param {string} projectRoot - Absolute path to project root
 */
async function runPostDiscoverEmbeddings(projectRoot) {
  // Read config
  const configPath = join(projectRoot, '.isdlc', 'config.json');
  let embConfig = {};
  try {
    if (existsSync(configPath)) {
      const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
      embConfig = cfg?.embeddings || {};
    }
  } catch {
    return; // Can't read config — skip silently
  }

  const provider = embConfig.provider || 'jina-code';

  // Import embedding modules (fail silently if unavailable)
  let createAdapter, chunkFile, detectLanguage, embed, buildPackage;
  try {
    ({ createAdapter } = await import('../../../lib/embedding/vcs/index.js'));
    ({ chunkFile, detectLanguage } = await import('../../../lib/embedding/chunker/index.js'));
    ({ embed } = await import('../../../lib/embedding/engine/index.js'));
    ({ buildPackage } = await import('../../../lib/embedding/package/builder.js'));
  } catch {
    return; // Embedding dependencies not available — skip
  }

  try {
    // 1. Get file list via VCS
    const vcs = await createAdapter(projectRoot);
    const files = await vcs.getFileList();
    const supportedFiles = files.filter(f => detectLanguage(f) !== null);
    if (supportedFiles.length === 0) return;

    // 2. Chunk files
    const allChunks = [];
    for (const file of supportedFiles) {
      const lang = detectLanguage(file);
      try {
        const chunks = await chunkFile(resolve(projectRoot, file), lang);
        allChunks.push(...chunks);
      } catch {
        // Skip files that fail to chunk
      }
    }
    if (allChunks.length === 0) return;

    // 3. Generate embeddings with hardware acceleration config
    const texts = allChunks.map(c => c.content);
    const result = await embed(texts, {
      provider,
      parallelism: embConfig.parallelism,
      device: embConfig.device,
      batch_size: embConfig.batch_size,
      dtype: embConfig.dtype,
      session_options: embConfig.session_options,
      max_memory_gb: embConfig.max_memory_gb,
    });

    // 4. Build .emb package
    const outputDir = join(projectRoot, 'docs', '.embeddings');
    const projectName = (projectRoot.split('/').pop() || 'project').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const packagePath = await buildPackage({
      vectors: result.vectors,
      chunks: allChunks,
      meta: {
        moduleId: `${projectName}-code`,
        version: '0.1.0',
        model: result.model,
        dimensions: result.dimensions,
      },
      outputDir,
      tier: 'full',
    });

    // 5. Reload running server
    await reloadRunningServer(projectRoot, packagePath);
  } catch {
    // Embedding generation failed — don't block discover completion
  }
}

/**
 * POST /reload to a running embedding server to pick up new packages.
 *
 * @param {string} projectRoot
 * @param {string} packagePath - Path to the new .emb package
 */
async function reloadRunningServer(projectRoot, packagePath) {
  try {
    const { getServerConfig, isServerReachable } = await import('../../../lib/embedding/server/port-discovery.js');
    const srvCfg = getServerConfig(projectRoot);
    const reachable = await isServerReachable(srvCfg.host, srvCfg.port, 2000);
    if (!reachable) return; // Server not running — nothing to reload

    const http = await import('node:http');
    const body = JSON.stringify({ paths: [packagePath] });
    await new Promise((resolve, reject) => {
      const req = http.request({ hostname: srvCfg.host, port: srvCfg.port, path: '/reload', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.setTimeout(10000, () => req.destroy());
      req.write(body);
      req.end();
    });
  } catch {
    // Server reload failed — non-fatal
  }
}

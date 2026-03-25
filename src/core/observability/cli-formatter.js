/**
 * CLI Formatter for Execution Observability
 *
 * REQ-0068: Format phase completion output and workflow trace reports
 * as structured text based on display_level.
 *
 * Provider-neutral: callable by any provider's output surface.
 * ESM module with CJS bridge at src/core/bridge/observability.cjs.
 *
 * @module src/core/observability/cli-formatter
 */

// ---------------------------------------------------------------------------
// Display level constants
// ---------------------------------------------------------------------------

const DISPLAY_LEVELS = new Set(['minimal', 'standard', 'detailed']);
const DEFAULT_DISPLAY_LEVEL = 'standard';
const DEFAULT_LIVE_DASHBOARD = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Format a single phase completion for CLI output.
 *
 * @param {object} phaseState - Phase state from state.json
 * @param {object} [options]
 * @param {string} [options.display_level='standard']
 * @param {boolean} [options.include_provider=false]
 * @returns {string} Formatted output (empty string for minimal)
 */
export function formatPhaseCompletion(phaseState, options = {}) {
  const level = normalizeDisplayLevel(options.display_level);

  if (level === 'minimal') return '';

  const phase = phaseState?.phase || phaseState?.phase_key || 'unknown';
  const timing = phaseState?.timing || {};
  const duration = formatDuration(timing.wall_clock_minutes);
  const iterations = timing.retries != null ? timing.retries + 1 : 1;
  const coverage = phaseState?.coverage_percent;
  const provider = phaseState?.provider || 'unknown';

  // Standard level: phase name, duration, iterations
  let output = `  ${phase}  ${duration}  ${iterations} iter`;
  if (coverage != null) {
    output += `  ${coverage}% cov`;
  }

  if (level === 'detailed') {
    // Add provider badge
    output += `  [${provider}]`;

    // Sub-agent breakdown
    const subAgents = phaseState?.sub_agents || [];
    if (subAgents.length > 0) {
      output += '\n    Sub-agents:';
      for (const sa of subAgents) {
        const saDur = formatDuration(sa.duration_ms != null ? Math.round(sa.duration_ms / 60000) : null);
        output += `\n      ${sa.agent}  ${saDur}  ${sa.status || 'unknown'}`;
        if (sa.provider) output += `  [${sa.provider}]`;
      }
    }

    // Hook events
    const hookEvents = phaseState?.hook_events || [];
    if (hookEvents.length > 0) {
      output += `\n    Hook events: ${hookEvents.length}`;
      for (const he of hookEvents) {
        output += `\n      ${he.hook} ${he.action} ${he.phase}: ${he.reason || ''}`;
        if (he.resolution) output += ` -> ${he.resolution}`;
      }
    }

    // Artifacts
    const artifacts = phaseState?.artifacts || [];
    if (artifacts.length > 0) {
      output += `\n    Artifacts: ${artifacts.length}`;
      for (const a of artifacts) {
        output += `\n      ${a.file_path} (${a.action})`;
      }
    }
  }

  return output;
}

/**
 * Format a full workflow trace report (for /isdlc status -inline).
 *
 * @param {object} workflowEntry - Workflow history entry
 * @param {object} [options]
 * @param {string} [options.display_level='standard']
 * @returns {string} Formatted inline report
 */
export function formatWorkflowTrace(workflowEntry, options = {}) {
  const level = normalizeDisplayLevel(options.display_level);
  const w = workflowEntry || {};

  const type = w.type || w.workflow_type || 'unknown';
  const slug = w.slug || w.id || w.artifact_folder || 'unknown';
  const status = w.status || 'unknown';
  const totalMinutes = computeTotalMinutes(w.phase_snapshots);
  const coverage = extractCoverage(w.phase_snapshots);
  const branch = w.git_branch?.name || w.branch || null;
  const providerMode = w.provider_mode || null;

  const lines = [];

  // Header
  lines.push(`WORKFLOW TRACE: ${slug} (${type})`);
  lines.push(`Status: ${status} | Duration: ${totalMinutes}m${coverage != null ? ` | Coverage: ${coverage}%` : ''}`);
  if (branch) lines.push(`Branch: ${branch}`);
  if (providerMode) lines.push(`Provider: ${providerMode}`);
  lines.push('');

  // Phase timeline
  lines.push('Phase Timeline:');
  const snapshots = w.phase_snapshots || [];
  for (const snap of snapshots) {
    const statusTag = snap.status === 'complete' || snap.status === 'completed' ? 'done' : snap.status;
    const dur = snap.wall_clock_minutes != null ? `${snap.wall_clock_minutes}m` : '--';
    const iter = snap.iterations_used != null ? `${snap.iterations_used} iter` : '--';
    const cov = snap.coverage_percent != null ? `${snap.coverage_percent}% cov` : '';
    const summaryPart = snap.summary || cov;
    const providerPart = snap.provider ? `[${snap.provider}]` : `[${providerFallback(snap)}]`;

    lines.push(`  [${statusTag}] ${snap.phase || 'unknown'}  ${dur}  ${iter}  ${summaryPart}  ${providerPart}`);
  }

  // Sub-agent activity (if available)
  const subAgentLog = w.sub_agent_log || [];
  if (subAgentLog.length > 0) {
    lines.push('');
    lines.push('Sub-Agent Activity:');
    const byPhase = groupBy(subAgentLog, 'phase');
    for (const [phase, agents] of Object.entries(byPhase)) {
      lines.push(`  ${phase}:`);
      for (const sa of agents) {
        const dur = sa.duration_ms != null ? `${Math.round(sa.duration_ms / 60000)}m` : '--';
        const provTag = sa.provider ? `[${sa.provider}]` : '';
        lines.push(`    ${sa.agent}  ${dur}  ${sa.status || 'unknown'}  ${provTag}`);
      }
    }
  }

  // Hook events (if available)
  const hookEvents = w.hook_events || [];
  if (hookEvents.length > 0 && level !== 'minimal') {
    lines.push('');
    lines.push(`Hook Events: ${hookEvents.length}`);
    for (const he of hookEvents) {
      let line = `  ${he.hook} ${he.action} ${he.phase}: ${he.reason || ''}`;
      if (he.resolution) line += ` -> ${he.resolution}`;
      lines.push(line);
    }
  }

  // Artifacts (if available)
  const artifacts = w.artifacts_produced || [];
  if (artifacts.length > 0 && level !== 'minimal') {
    lines.push('');
    lines.push(`Artifacts Produced: ${artifacts.length} files`);
    for (const a of artifacts) {
      lines.push(`  ${a.file_path} (${a.action})`);
    }
  }

  return lines.join('\n');
}

/**
 * Format a summary table of multiple workflows (for /isdlc status with no args).
 *
 * @param {Array} workflowEntries - Array of workflow history entries
 * @param {object} [options]
 * @param {number} [options.max_entries=5]
 * @returns {string} Formatted summary table
 */
export function formatWorkflowSummary(workflowEntries, options = {}) {
  const maxEntries = options.max_entries || 5;
  const entries = (workflowEntries || []).slice(-maxEntries);

  if (entries.length === 0) {
    return 'No workflow history found.';
  }

  const lines = [];
  lines.push('Recent Workflows:');
  lines.push('  Slug                                        Type      Status     Duration  Coverage');
  lines.push('  ' + '-'.repeat(90));

  for (const w of entries) {
    const slug = (w.slug || w.artifact_folder || 'unknown').slice(0, 44).padEnd(44);
    const type = (w.type || 'unknown').padEnd(10);
    const status = (w.status || 'unknown').padEnd(11);
    const dur = computeTotalMinutes(w.phase_snapshots);
    const duration = `${dur}m`.padEnd(10);
    const cov = extractCoverage(w.phase_snapshots);
    const coverage = cov != null ? `${cov}%` : '--';

    lines.push(`  ${slug}${type}${status}${duration}${coverage}`);
  }

  return lines.join('\n');
}

/**
 * Parse the ## Observability section from CLAUDE.md content.
 *
 * @param {string} claudeMdContent - Full CLAUDE.md file content
 * @returns {{ display_level: string, live_dashboard: boolean }}
 */
export function parseObservabilityConfig(claudeMdContent) {
  const defaults = {
    display_level: DEFAULT_DISPLAY_LEVEL,
    live_dashboard: DEFAULT_LIVE_DASHBOARD
  };

  if (!claudeMdContent || typeof claudeMdContent !== 'string') {
    return defaults;
  }

  // Find ## Observability section
  const sectionMatch = claudeMdContent.match(/##\s+Observability\s*\n([\s\S]*?)(?=\n##\s|\n---|\z|$)/i);
  if (!sectionMatch) {
    return defaults;
  }

  const section = sectionMatch[1];
  const result = { ...defaults };

  // Parse display_level
  const displayMatch = section.match(/display_level\s*:\s*(\S+)/i);
  if (displayMatch) {
    const val = displayMatch[1].toLowerCase();
    if (DISPLAY_LEVELS.has(val)) {
      result.display_level = val;
    }
  }

  // Parse live_dashboard
  const dashboardMatch = section.match(/live_dashboard\s*:\s*(\S+)/i);
  if (dashboardMatch) {
    const val = dashboardMatch[1].toLowerCase();
    result.live_dashboard = val === 'true';
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeDisplayLevel(level) {
  if (level && DISPLAY_LEVELS.has(level)) return level;
  return DEFAULT_DISPLAY_LEVEL;
}

function formatDuration(minutes) {
  if (minutes == null) return '--';
  if (minutes < 1) return '<1m';
  return `${minutes}m`;
}

function computeTotalMinutes(snapshots) {
  if (!Array.isArray(snapshots)) return 0;
  return snapshots.reduce((sum, s) => sum + (s.wall_clock_minutes || 0), 0);
}

function extractCoverage(snapshots) {
  if (!Array.isArray(snapshots)) return null;
  // Return last non-null coverage value
  for (let i = snapshots.length - 1; i >= 0; i--) {
    if (snapshots[i].coverage_percent != null) return snapshots[i].coverage_percent;
  }
  return null;
}

function providerFallback(snapshot) {
  return snapshot?.provider || 'unknown';
}

function groupBy(arr, key) {
  const result = {};
  for (const item of arr) {
    const k = item[key] || 'unknown';
    if (!result[k]) result[k] = [];
    result[k].push(item);
  }
  return result;
}

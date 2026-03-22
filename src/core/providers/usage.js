/**
 * Provider Usage Tracking — Core module
 * =======================================
 * Usage logging and statistics retrieval.
 *
 * Extracted from src/claude/hooks/lib/provider-utils.cjs (REQ-0127).
 * Per ADR-CODEX-006: Core in ESM, CJS bridge for hooks.
 *
 * @module src/core/providers/usage
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * Log provider usage to usage-log.jsonl.
 * @param {object} config - Full config object
 * @param {object} state - Project state
 * @param {object} selection - Provider selection
 * @param {string} projectRoot - Project root directory
 */
export function trackUsage(config, state, selection, projectRoot) {
  if (!config.constraints?.track_usage) {
    return;
  }

  const logPath = join(
    projectRoot,
    config.constraints.usage_log_path || '.isdlc/usage-log.jsonl'
  );

  const entry = {
    timestamp: new Date().toISOString(),
    provider: selection.provider,
    model: selection.model,
    phase: state?.current_phase,
    source: selection.source,
    rationale: selection.rationale,
    fallback_used: selection.originalProvider ? true : false,
    original_provider: selection.originalProvider || null
  };

  try {
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, JSON.stringify(entry) + '\n');
  } catch {
    // Silent fail — usage tracking is non-critical
  }
}

/**
 * Read usage statistics from log file.
 * @param {string} projectRoot - Project root directory
 * @param {string} [logRelPath] - Relative path to log file
 * @param {number} [days=7] - Number of days to include
 * @returns {object} Usage statistics
 */
export function getUsageStats(projectRoot, logRelPath, days = 7) {
  const logPath = join(projectRoot, logRelPath || '.isdlc/usage-log.jsonl');

  if (!existsSync(logPath)) {
    return { total_calls: 0, by_provider: {}, by_phase: {}, by_source: {}, fallback_count: 0 };
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const stats = {
    total_calls: 0,
    by_provider: {},
    by_phase: {},
    by_source: {},
    fallback_count: 0
  };

  try {
    const content = readFileSync(logPath, 'utf8');
    const lines = content.trim().split('\n').filter(l => l);

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const entryDate = new Date(entry.timestamp);

        if (entryDate < cutoffDate) continue;

        stats.total_calls++;
        stats.by_provider[entry.provider] = (stats.by_provider[entry.provider] || 0) + 1;
        stats.by_phase[entry.phase] = (stats.by_phase[entry.phase] || 0) + 1;
        stats.by_source[entry.source] = (stats.by_source[entry.source] || 0) + 1;

        if (entry.fallback_used) {
          stats.fallback_count++;
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // Silent fail
  }

  return stats;
}

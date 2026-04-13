/**
 * Claude Code status line script — embedding server health display.
 *
 * Entry point called by Claude Code's statusLine config. Two-tier refresh:
 * - Display-refresh: read cached health file (<5ms)
 * - Data-refresh: full probe + VCS check (on configurable interval)
 *
 * Format map:
 *   healthy → "emb: {N} chunks ✓"
 *   stale   → "emb: stale ({N} commits behind[, {M} files modified])"
 *   offline → "emb: offline"
 *   loading → "emb: loading..."
 *   missing → "emb: not configured"
 *
 * On any error: no output, exit 0 (fail-open, Article X).
 *
 * REQ-GH-244 FR-001, AC-001-01 through AC-001-09
 * @module src/providers/claude/embedding-statusline
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HEALTH_FILE = 'embedding-health.json';
const DEFAULT_INTERVAL = 5; // minutes

/**
 * Read config from .isdlc/config.json.
 * @param {string} projectRoot
 * @returns {{ enabled: boolean, interval: number }}
 */
function readConfig(projectRoot) {
  try {
    const configPath = path.join(projectRoot, '.isdlc', 'config.json');
    if (!fs.existsSync(configPath)) return { enabled: true, interval: DEFAULT_INTERVAL };
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return {
      enabled: cfg?.embeddings?.statusline?.enabled !== false,
      interval: cfg?.embeddings?.health_check_interval_minutes || DEFAULT_INTERVAL,
    };
  } catch {
    return { enabled: true, interval: DEFAULT_INTERVAL };
  }
}

/**
 * Format health data into a status line string.
 * @param {Object} health
 * @returns {string}
 */
function formatStatus(health) {
  if (!health || !health.status) return '';

  switch (health.status) {
    case 'healthy':
      return `emb: ${health.chunks || 0} chunks \u2713`;

    case 'stale': {
      const parts = [];
      if (health.commits_behind > 0) {
        parts.push(`${health.commits_behind} commits behind`);
      }
      if (health.files_changed > 0) {
        parts.push(`${health.files_changed} files modified`);
      }
      return parts.length > 0 ? `emb: stale (${parts.join(', ')})` : 'emb: stale';
    }

    case 'offline':
      return 'emb: offline';

    case 'loading':
      return 'emb: loading...';

    case 'missing':
      return 'emb: not configured';

    default:
      return '';
  }
}

/**
 * Main entry point — runs the status line logic.
 * @param {string} [projectRoot]
 * @returns {Promise<string>} formatted status string (empty on error)
 */
async function run(projectRoot) {
  if (!projectRoot) {
    projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  }

  const config = readConfig(projectRoot);
  if (!config.enabled) return '';

  const healthFilePath = path.join(projectRoot, '.isdlc', HEALTH_FILE);

  // Lazy-load health-monitor to keep display-refresh path fast
  const { shouldRefresh, refreshHealth } = require('../../core/embedding/health-monitor.cjs');

  let health;
  if (shouldRefresh(healthFilePath, config.interval)) {
    // Data-refresh: full probe + VCS
    health = await refreshHealth(projectRoot);
  } else {
    // Display-refresh: read cached file
    try {
      health = JSON.parse(fs.readFileSync(healthFilePath, 'utf8'));
    } catch {
      health = await refreshHealth(projectRoot);
    }
  }

  return formatStatus(health);
}

// When executed as main script
if (require.main === module) {
  run().then(output => {
    if (output) process.stdout.write(output);
    process.exit(0);
  }).catch(() => {
    // Fail-open: exit 0 with no output
    process.exit(0);
  });
}

module.exports = { run, formatStatus, readConfig };

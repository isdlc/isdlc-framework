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
      return health.chunks != null ? `emb: ${health.chunks} chunks \u2713` : 'emb: ready \u2713';

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

/**
 * Read session data from stdin (piped by Claude Code).
 * @returns {Promise<Object|null>}
 */
function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(data)); } catch { resolve(null); }
    });
    process.stdin.on('error', () => resolve(null));
    setTimeout(() => resolve(null), 1000);
  });
}

/**
 * Format Claude Code session info from stdin JSON data.
 * Fields based on Claude Code statusLine API.
 * @param {Object|null} session
 * @returns {string}
 */
function formatSessionInfo(session) {
  if (!session) return '';
  const parts = [];

  // Model name
  if (session.model) {
    const name = typeof session.model === 'string' ? session.model
      : session.model.display_name || session.model.name || session.model.id || null;
    if (name) parts.push(name);
  }

  // Context usage
  if (session.context_window?.used_percentage != null) {
    parts.push(`ctx: ${Math.round(session.context_window.used_percentage)}%`);
  }

  // Cost
  if (session.cost?.total_cost_usd != null && session.cost.total_cost_usd > 0) {
    parts.push(`$${session.cost.total_cost_usd.toFixed(2)}`);
  }

  return parts.join(' | ');
}

// When executed as main script
if (require.main === module) {
  // DEBUG: dump stdin JSON to file so we can see the exact schema
  Promise.all([run(), readStdin()]).then(([embStatus, session]) => {
    try {
      const debugPath = path.join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), '.isdlc', 'statusline-debug.json');
      fs.writeFileSync(debugPath, JSON.stringify(session, null, 2));
    } catch { /* ignore */ }
    const sessionInfo = formatSessionInfo(session);
    const parts = [embStatus, sessionInfo].filter(Boolean);
    if (parts.length > 0) process.stdout.write(parts.join(' | '));
    process.exit(0);
  }).catch(() => {
    process.exit(0);
  });
}

module.exports = { run, formatStatus, readConfig };

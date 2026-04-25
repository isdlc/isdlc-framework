#!/usr/bin/env node
'use strict';

/**
 * Claude Code statusLine script — iSDLC framework status + embedding health.
 *
 * Reads JSON context from stdin (Claude Code statusLine protocol).
 * Outputs a single colored line combining Claude session info with
 * embedding server status, replacing the default multi-line display.
 *
 * Sections (left to right):
 *   directory | branch | model | context bar (tokens) | last call | cost | rate | emb status | version
 *
 * Embedding states:
 *   emb: {N} chunks ✓             — server running, index fresh
 *   emb: {N} chunks ({staleness})  — server running, index drifted
 *   emb: stale {N} chunks (...)    — server running, significant drift (>10 files or >5 commits)
 *   emb: offline                   — server not reachable
 *   emb: no index                  — no .emb packages found
 *
 * Staleness: dual-metric — commits behind remote + local files modified since generation.
 * Server liveness: HTTP probe to /health endpoint (reliable with stale PID files).
 *
 * Delivered as part of iSDLC framework. Configured by the installer in settings.json.
 * End users can disable via .isdlc/config.json → embeddings.statusline.enabled: false
 *
 * REQ-GH-244 FR-001
 * @module src/providers/claude/embedding-statusline
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const STALE_THRESHOLD = 10;
const KNOWLEDGE_CACHE_TTL_MS = 60000; // 60 seconds

// Knowledge service status cache
let _knowledgeCache = { data: null, fetchedAt: 0 };

// ANSI colors
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const WHITE = '\x1b[37m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// ---------------------------------------------------------------------------
// Stdin / project root
// ---------------------------------------------------------------------------

function readStdin() {
  try {
    const raw = fs.readFileSync('/dev/stdin', 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function getProjectRoot(ctx) {
  return process.env.CLAUDE_PROJECT_DIR
    || (ctx && ctx.workspace && ctx.workspace.project_dir)
    || (ctx && ctx.cwd)
    || process.cwd();
}

// ---------------------------------------------------------------------------
// Opt-out check
// ---------------------------------------------------------------------------

function isEnabled(projectRoot) {
  try {
    const configPath = path.join(projectRoot, '.isdlc', 'config.json');
    if (!fs.existsSync(configPath)) return true;
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return cfg?.embeddings?.statusline?.enabled !== false;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Embedding helpers
// ---------------------------------------------------------------------------

/** Find newest .emb package across known embedding dirs. */
function findNewestEmb(projectRoot) {
  const dirs = [
    path.join(projectRoot, '.isdlc', 'embeddings'),
    path.join(projectRoot, 'docs', '.embeddings'),
  ];
  let newest = null;
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.emb'));
      for (const f of files) {
        const mtime = fs.statSync(path.join(dir, f)).mtimeMs;
        if (!newest || mtime > newest.mtime) newest = { mtime };
      }
    } catch { /* skip */ }
  }
  return newest;
}

/** Probe embedding server via HTTP — returns { running, chunks }. */
function probeServer(projectRoot) {
  try {
    const configPath = path.join(projectRoot, '.isdlc', 'config.json');
    let port = 7777;
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      port = cfg?.embeddings?.server?.port || 7777;
    }
    const raw = execSync(`curl -s --max-time 1 http://localhost:${port}/health`, {
      encoding: 'utf8', timeout: 2000, stdio: ['pipe', 'pipe', 'pipe']
    });
    const health = JSON.parse(raw);
    const chunks = health?.modules?.list?.[0]?.chunkCount ?? null;
    return { running: true, chunks };
  } catch {
    return { running: false, chunks: null };
  }
}

/** Get commits behind remote + local files changed (dual-metric staleness). */
function getStaleness(projectRoot) {
  let files = 0, commits = 0;
  const metaPaths = [
    path.join(projectRoot, '.isdlc', 'embeddings', '.generation-meta.json'),
    path.join(projectRoot, 'docs', '.embeddings', '.generation-meta.json'),
  ];
  for (const p of metaPaths) {
    try {
      if (!fs.existsSync(p)) continue;
      const meta = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (meta.generatedAtCommit) {
        const out = execSync(
          `git --no-optional-locks -C "${projectRoot}" diff --name-only ${meta.generatedAtCommit} 2>/dev/null || true`,
          { encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }
        );
        files = out.trim().split('\n').filter(Boolean).length;
        try {
          const cOut = execSync(
            `git --no-optional-locks -C "${projectRoot}" rev-list --count ${meta.generatedAtCommit}..@{upstream} 2>/dev/null || echo 0`,
            { encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }
          );
          commits = parseInt(cOut.trim(), 10) || 0;
        } catch { /* no upstream */ }
        break;
      }
    } catch { /* continue */ }
  }
  return { files, commits };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtTokens(n) {
  if (n == null) return null;
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function ctxBar(pct) {
  if (pct == null) return null;
  const filled = Math.round(pct / 10);
  const empty = 10 - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty) + ' ' + pct + '%';
}

function gitBranch(projectRoot) {
  try {
    return execSync(`git --no-optional-locks -C "${projectRoot}" branch --show-current 2>/dev/null`,
      { encoding: 'utf8', timeout: 2000, stdio: ['pipe', 'pipe', 'pipe'] }).trim() || null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Embedding status (colored)
// ---------------------------------------------------------------------------

function getEmbStatus(root) {
  const server = probeServer(root);
  const newest = findNewestEmb(root);

  if (!server.running && !newest) return `${RED}emb: no index${RESET}`;
  if (!server.running) return `${RED}emb: offline${RESET}`;

  const chunkStr = server.chunks ? `${server.chunks} chunks` : '';
  if (!newest) return `${GREEN}emb: running (no pkg)${RESET}`;

  const { files, commits } = getStaleness(root);

  if (files === 0 && commits === 0) {
    return `${GREEN}emb: ${chunkStr} \u2713${RESET}`;
  }

  const staleParts = [];
  if (commits > 0) staleParts.push(`${commits} commit${commits === 1 ? '' : 's'} behind`);
  if (files > 0) staleParts.push(`${files} file${files === 1 ? '' : 's'} modified`);
  const staleStr = staleParts.join(', ');

  if (files >= STALE_THRESHOLD || commits >= 5) {
    return `${YELLOW}emb: stale ${chunkStr} (${staleStr})${RESET}`;
  }
  return `${GREEN}emb: ${chunkStr}${RESET} ${CYAN}(${staleStr})${RESET}`;
}

// ---------------------------------------------------------------------------
// Knowledge service helpers (REQ-GH-264 FR-006)
// ---------------------------------------------------------------------------

/** Read knowledge config from .isdlc/config.json. */
function getKnowledgeUrl(projectRoot) {
  try {
    const configPath = path.join(projectRoot, '.isdlc', 'config.json');
    if (!fs.existsSync(configPath)) return null;
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const url = cfg?.knowledge?.url;
    return (typeof url === 'string' && url.length > 0) ? url : null;
  } catch {
    return null;
  }
}

/** Probe knowledge service /metrics endpoint with caching. Returns status object. */
function getKnowledgeStatus(projectRoot) {
  const url = getKnowledgeUrl(projectRoot);
  if (!url) return null;

  const now = Date.now();
  if (_knowledgeCache.data && (now - _knowledgeCache.fetchedAt) < KNOWLEDGE_CACHE_TTL_MS) {
    return _knowledgeCache.data;
  }

  let status = { connected: false, url, projects: 0, staleness: null };
  try {
    const metricsUrl = url.replace(/\/+$/, '') + '/metrics';
    const raw = execSync(`curl -s --max-time 2 "${metricsUrl}"`, {
      encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe']
    });
    // Parse Prometheus text format for project count and staleness
    const projectMatch = raw.match(/knowledge_projects_total\s+(\d+)/);
    const stalenessMatch = raw.match(/project_staleness_seconds\s+(\d+)/);
    status.connected = true;
    status.projects = projectMatch ? parseInt(projectMatch[1], 10) : 0;
    status.staleness = stalenessMatch ? parseInt(stalenessMatch[1], 10) : null;
  } catch {
    status.connected = false;
  }

  _knowledgeCache = { data: status, fetchedAt: now };
  return status;
}

/** Format knowledge service status for status line. */
function getKnowledgeStatusStr(root) {
  const status = getKnowledgeStatus(root);
  if (!status) return null; // No knowledge service configured

  if (!status.connected) {
    return `${RED}ks: disconnected${RESET}`;
  }

  const parts = [`ks: connected`];
  if (status.projects > 0) parts.push(`${status.projects} proj`);
  if (status.staleness != null) {
    const hours = Math.floor(status.staleness / 3600);
    if (hours > 24) {
      return `${YELLOW}ks: ${parts.join(', ')} (stale ${hours}h)${RESET}`;
    }
  }
  return `${GREEN}${parts.join(', ')}${RESET}`;
}

// Exported for testing
if (typeof module !== 'undefined') {
  module.exports = { getKnowledgeUrl, getKnowledgeStatus, getKnowledgeStatusStr, _resetKnowledgeCache: () => { _knowledgeCache = { data: null, fetchedAt: 0 }; } };
}

// ---------------------------------------------------------------------------
// Main — compose full status line
// ---------------------------------------------------------------------------

function main() {
  const ctx = readStdin();
  const root = getProjectRoot(ctx);

  if (!isEnabled(root)) {
    process.exit(0);
  }

  const parts = [];

  // Current directory
  const cwd = ctx.cwd || ctx.workspace?.current_dir || root;
  const home = process.env.HOME || '';
  const displayPath = home && cwd.startsWith(home) ? '~' + cwd.slice(home.length) : cwd;
  parts.push(`${BLUE}${displayPath}${RESET}`);

  // Git branch
  const branch = gitBranch(root);
  if (branch) parts.push(`${MAGENTA}${branch}${RESET}`);

  // Model
  if (ctx.model?.display_name) parts.push(`${BOLD}${WHITE}${ctx.model.display_name}${RESET}`);

  // Context bar (green <60%, yellow 60-80%, red >80%)
  const pct = ctx.context_window?.used_percentage;
  const bar = ctxBar(pct);
  if (bar) {
    const barColor = pct > 80 ? RED : pct > 60 ? YELLOW : GREEN;
    const inTok = fmtTokens(ctx.context_window?.total_input_tokens);
    const outTok = fmtTokens(ctx.context_window?.total_output_tokens);
    const winSize = fmtTokens(ctx.context_window?.context_window_size);
    let ctxStr = barColor + bar + RESET;
    if (inTok && outTok) ctxStr += ` ${CYAN}(in:${inTok} out:${outTok}/${winSize || '?'})${RESET}`;
    parts.push(ctxStr);
  }

  // Last call cache stats
  const cur = ctx.context_window?.current_usage;
  if (cur) {
    const lastParts = [];
    if (cur.input_tokens != null) lastParts.push(`in:${cur.input_tokens}`);
    if (cur.output_tokens != null) lastParts.push(`out:${cur.output_tokens}`);
    if (cur.cache_read_input_tokens) lastParts.push(`cache_r:${fmtTokens(cur.cache_read_input_tokens)}`);
    if (cur.cache_creation_input_tokens) lastParts.push(`cache_w:${fmtTokens(cur.cache_creation_input_tokens)}`);
    if (lastParts.length > 0) parts.push(`${WHITE}last: ${lastParts.join(' ')}${RESET}`);
  }

  // Cost
  if (ctx.cost?.total_cost_usd != null && ctx.cost.total_cost_usd > 0) {
    parts.push(`${GREEN}$${ctx.cost.total_cost_usd.toFixed(2)}${RESET}`);
  }

  // Rate limits
  const rateUsed = ctx.rate_limits?.five_hour?.used_percentage;
  if (rateUsed != null) {
    const rateColor = rateUsed > 80 ? RED : rateUsed > 60 ? YELLOW : GREEN;
    parts.push(`${rateColor}rate: ${rateUsed}%/5h${RESET}`);
  }

  // Knowledge service status (REQ-GH-264 FR-006)
  const ksStatus = getKnowledgeStatusStr(root);
  if (ksStatus) {
    parts.push(ksStatus);
  } else {
    // Only show local embedding status when no knowledge service is configured
    parts.push(getEmbStatus(root));
  }

  // Version
  if (ctx.version) parts.push(`${CYAN}v${ctx.version}${RESET}`);

  process.stdout.write(parts.join(' | ') + '\n');
}

main();

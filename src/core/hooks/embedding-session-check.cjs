#!/usr/bin/env node
'use strict';

/**
 * SessionStart hook: check embedding server connectivity.
 *
 * Runs when an iSDLC session starts. Pings the embedding server;
 * if unreachable, prints a warning with instructions to start it.
 * Fail-open: never blocks the session.
 *
 * REQ-GH-224 FR-004, FR-015
 * @module src/core/hooks/embedding-session-check
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SERVER = {
  host: 'localhost',
  port: 7777,
  auto_start: true,
};

function getConfig(projectRoot) {
  try {
    const configPath = path.join(projectRoot, '.isdlc', 'config.json');
    if (!fs.existsSync(configPath)) return DEFAULT_SERVER;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const serverConfig = config?.embeddings?.server || {};
    return {
      host: serverConfig.host || DEFAULT_SERVER.host,
      port: serverConfig.port || DEFAULT_SERVER.port,
      auto_start: serverConfig.auto_start ?? DEFAULT_SERVER.auto_start,
    };
  } catch {
    return DEFAULT_SERVER;
  }
}

async function pingServer(host, port, timeoutMs = 2000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://${host}:${port}/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * SessionStart hook main entry.
 * Never throws. Writes warning to stderr if server unreachable.
 *
 * @param {object} [context] - Hook context (projectRoot, etc.)
 */
async function sessionStartCheck(context = {}) {
  const projectRoot = context.projectRoot || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const config = getConfig(projectRoot);

  try {
    const reachable = await pingServer(config.host, config.port);
    if (reachable) {
      // Server is up — silent success
      return { reachable: true };
    }

    // Server not running — print warning (fail-open)
    process.stderr.write(
      `[isdlc-embedding] Embedding server not reachable at ${config.host}:${config.port}.\n`
    );
    process.stderr.write(
      `[isdlc-embedding] To enable semantic search, run: isdlc embedding server start\n`
    );
    return { reachable: false, warned: true };
  } catch (err) {
    // Fail-open: never block session
    return { reachable: false, error: err.message };
  }
}

// Run when invoked directly as hook
if (require.main === module) {
  sessionStartCheck()
    .then((result) => {
      // Always exit 0 (fail-open)
      process.exit(0);
    })
    .catch(() => {
      process.exit(0);
    });
}

module.exports = { sessionStartCheck, getConfig, pingServer };

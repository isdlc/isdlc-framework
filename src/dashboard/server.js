/**
 * Dashboard Server for Execution Observability
 *
 * REQ-0068: Serve the browser visualization and provide state API.
 * Zero dependencies -- uses Node.js built-in http, fs, path modules.
 *
 * Routes:
 *   GET /           -> index.html (SPA)
 *   GET /api/state  -> current state + topology merged
 *   GET /api/history -> workflow_history array
 *   GET /api/history/:id -> single workflow by slug or source_id
 *
 * @module src/dashboard/server
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_PORT = 3456;
const MAX_PORT_ATTEMPTS = 5;
const AUTO_STOP_GRACE_MS = 30000;

/**
 * Start the dashboard HTTP server.
 *
 * @param {object} options
 * @param {string} options.stateJsonPath - Absolute path to state.json
 * @param {string} [options.topologyPath] - Absolute path to phase-topology.json
 * @param {number} [options.port=3456] - Preferred port
 * @param {boolean} [options.autoStop=false] - Auto-stop when workflow completes
 * @returns {Promise<{ port: number, url: string, close: Function }>}
 */
export async function startDashboardServer(options) {
  const {
    stateJsonPath,
    topologyPath,
    port: preferredPort = DEFAULT_PORT,
    autoStop = false
  } = options;

  // Load topology once at startup
  let topology = {};
  if (topologyPath && existsSync(topologyPath)) {
    try {
      topology = JSON.parse(readFileSync(topologyPath, 'utf8'));
    } catch (_err) {
      // Fallback: empty topology
    }
  }

  // Resolve index.html path
  const indexPath = join(__dirname, 'index.html');

  // Cache for last-good state response
  let lastGoodState = null;

  // Auto-stop timer
  let autoStopTimer = null;

  function readState() {
    try {
      const content = readFileSync(stateJsonPath, 'utf8');
      const state = JSON.parse(content);
      lastGoodState = state;
      return state;
    } catch (_err) {
      return lastGoodState; // Return cached on error
    }
  }

  function buildStateResponse(state) {
    return {
      active_workflow: state?.active_workflow || null,
      phases: state?.phases || {},
      topology: topology?.phases || {},
      workflow_type: state?.active_workflow?.type || null,
      timestamp: new Date().toISOString(),
      stale: state === lastGoodState && state !== null
    };
  }

  function handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // CORS headers for local development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    if (pathname === '/' || pathname === '/index.html') {
      // Serve SPA
      try {
        const html = readFileSync(indexPath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch (_err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Dashboard UI not found');
      }
      return;
    }

    if (pathname === '/api/state') {
      const state = readState();
      const response = buildStateResponse(state);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));

      // Check for auto-stop condition
      if (autoStop && state && !state.active_workflow) {
        if (!autoStopTimer) {
          autoStopTimer = setTimeout(() => {
            server.close();
          }, AUTO_STOP_GRACE_MS);
        }
      } else if (autoStopTimer) {
        clearTimeout(autoStopTimer);
        autoStopTimer = null;
      }
      return;
    }

    if (pathname === '/api/history') {
      const state = readState();
      const history = state?.workflow_history || [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(history));
      return;
    }

    // Match /api/history/:id
    const historyMatch = pathname.match(/^\/api\/history\/(.+)$/);
    if (historyMatch) {
      const id = decodeURIComponent(historyMatch[1]);
      const state = readState();
      const history = state?.workflow_history || [];
      const entry = history.find(w =>
        w.slug === id || w.source_id === id || w.id === id || w.artifact_folder === id
      );

      if (entry) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(entry));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Workflow not found', id }));
      }
      return;
    }

    // 404 for unknown routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  // Create server and attempt port binding
  const server = createServer(handleRequest);

  const actualPort = await tryListen(server, preferredPort);
  const url = `http://127.0.0.1:${actualPort}`;

  return {
    port: actualPort,
    url,
    close() {
      if (autoStopTimer) clearTimeout(autoStopTimer);
      return new Promise((resolve) => {
        server.close(() => resolve());
      });
    }
  };
}

/**
 * Try to listen on a port, falling back to subsequent ports.
 *
 * @param {import('node:http').Server} server
 * @param {number} startPort
 * @returns {Promise<number>} The actual port bound
 */
// CLI entry point: node src/dashboard/server.js [--port N]
if (process.argv[1] && resolve(process.argv[1]) === resolve(__dirname, 'server.js')) {
  const portArg = process.argv.indexOf('--port');
  const port = portArg !== -1 ? parseInt(process.argv[portArg + 1], 10) : DEFAULT_PORT;
  const projectRoot = resolve(__dirname, '..', '..');
  startDashboardServer({
    stateJsonPath: join(projectRoot, '.isdlc', 'state.json'),
    topologyPath: join(projectRoot, 'src', 'claude', 'hooks', 'config', 'phase-topology.json'),
    port
  }).then(info => {
    console.log(`Dashboard running at ${info.url}`);
  }).catch(err => {
    console.error('Failed to start dashboard:', err.message);
    process.exit(1);
  });
}

function tryListen(server, startPort) {
  return new Promise((resolvePort, reject) => {
    let attempts = 0;
    let port = startPort;

    function attempt() {
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && attempts < MAX_PORT_ATTEMPTS) {
          attempts++;
          port++;
          attempt();
        } else {
          reject(err);
        }
      });

      server.listen(port, '127.0.0.1', () => {
        // Use server.address().port to get the actual OS-assigned port
        // (handles port: 0 case where OS picks an ephemeral port)
        const actualPort = server.address().port;
        resolvePort(actualPort);
      });
    }

    attempt();
  });
}

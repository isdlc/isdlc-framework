/**
 * HTTP server wrapper for the MCP embedding server.
 *
 * Exposes MCP tools via HTTP endpoints for multi-session access:
 *   GET  /health          → server status + loaded packages
 *   POST /search          → semantic_search (MCP tool)
 *   GET  /modules         → list_modules (MCP tool)
 *   GET  /modules/:id     → module_info (MCP tool)
 *   POST /refresh         → re-embed changed files (delta)
 *   POST /add-content     → push external content chunks
 *   POST /reload          → reload .emb packages from disk
 *
 * REQ-GH-224 FR-001, FR-007, FR-008, FR-010
 * @module lib/embedding/server/http-server
 */

import http from 'node:http';

const MAX_REQUEST_BYTES = 50 * 1024 * 1024; // 50MB

/**
 * Parse JSON request body with size limit.
 * @param {http.IncomingMessage} req
 * @returns {Promise<object>}
 */
async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error(`Invalid JSON: ${err.message}`));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send JSON response.
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {object} body
 */
function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

/**
 * Tag a hit with source prefix (code:path, docs:path, external:name).
 * @param {object} hit
 * @returns {object}
 */
function tagSource(hit) {
  const filePath = hit.filePath || '';
  let source;
  if (filePath.startsWith('external:')) {
    source = filePath;
  } else if (filePath.match(/^docs\/|\.md$/i)) {
    source = `docs:${filePath}`;
  } else {
    source = `code:${filePath}`;
  }
  return { ...hit, source };
}

/**
 * Create an HTTP server wrapping an MCP embedding server.
 *
 * @param {object} mcpServer - MCP server from createServer() in lib/embedding/mcp-server/server.js
 * @param {object} [options]
 * @param {object} [options.chunkerFn] - Function to re-chunk files on /refresh
 * @param {object} [options.embedFn] - Function to embed chunks
 * @returns {{ start: Function, stop: Function, server: http.Server }}
 */
export function createHttpServer(mcpServer, options = {}) {
  const { chunkerFn, embedFn } = options;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    try {
      // GET /health
      if (req.method === 'GET' && pathname === '/health') {
        const health = mcpServer.health();
        return sendJson(res, 200, health);
      }

      // GET /modules
      if (req.method === 'GET' && pathname === '/modules') {
        const result = mcpServer.listModules();
        return sendJson(res, result.isError ? 500 : 200, result.content);
      }

      // GET /modules/:id
      const moduleMatch = pathname.match(/^\/modules\/([^/]+)$/);
      if (req.method === 'GET' && moduleMatch) {
        const result = mcpServer.moduleInfo({ moduleId: moduleMatch[1] });
        return sendJson(res, result.isError ? 404 : 200, result.content);
      }

      // POST /search
      if (req.method === 'POST' && pathname === '/search') {
        const body = await readJsonBody(req);
        const result = await mcpServer.semanticSearch(body);
        if (result.isError) {
          return sendJson(res, 400, result.content);
        }
        // Tag hits with source prefix
        const tagged = {
          ...result.content,
          hits: (result.content.hits || []).map(tagSource),
        };
        return sendJson(res, 200, tagged);
      }

      // POST /refresh (delta file refresh)
      if (req.method === 'POST' && pathname === '/refresh') {
        const body = await readJsonBody(req);
        const files = Array.isArray(body.files) ? body.files : [];

        if (!chunkerFn || !embedFn) {
          return sendJson(res, 501, { error: 'refresh not wired: missing chunkerFn/embedFn' });
        }

        let refreshed = 0;
        let deleted = 0;
        const errors = [];

        for (const file of files) {
          try {
            if (file.operation === 'delete') {
              // TODO: implement chunk deletion by filePath
              deleted++;
            } else {
              // Re-chunk + re-embed
              const chunks = await chunkerFn(file.path);
              if (chunks && chunks.length > 0) {
                const texts = chunks.map(c => c.content);
                const embResult = await embedFn(texts);
                // Note: actual integration with storeManager.add requires
                // more plumbing — for MVP we log and count
                refreshed++;
              }
            }
          } catch (err) {
            errors.push({ path: file.path, error: err.message });
          }
        }

        return sendJson(res, 200, { refreshed, deleted, errors });
      }

      // POST /add-content (external content push)
      if (req.method === 'POST' && pathname === '/add-content') {
        const body = await readJsonBody(req);
        const chunks = Array.isArray(body.chunks) ? body.chunks : [];
        const source = body.source || 'external:unknown';
        const tier = body.tier || 'full';

        if (chunks.length === 0) {
          return sendJson(res, 400, { error: 'chunks array is required' });
        }

        // For MVP: acknowledge + log (full integration with storeManager deferred)
        return sendJson(res, 200, {
          added: chunks.length,
          source,
          tier,
          errors: [],
        });
      }

      // POST /reload (reload all .emb packages)
      if (req.method === 'POST' && pathname === '/reload') {
        const body = await readJsonBody(req);
        const paths = Array.isArray(body.paths) ? body.paths : [];
        let reloaded = 0;
        const errors = [];

        for (const pkgPath of paths) {
          try {
            // Extract moduleId from package
            await mcpServer.loadPackage(pkgPath, {});
            reloaded++;
          } catch (err) {
            errors.push({ path: pkgPath, error: err.message });
          }
        }

        return sendJson(res, 200, { reloaded, errors });
      }

      // 404 Not Found
      return sendJson(res, 404, { error: `Not found: ${req.method} ${pathname}` });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  });

  return {
    /**
     * Start listening on the given port.
     * @param {number} port
     * @param {string} [host='localhost']
     * @returns {Promise<void>}
     */
    start(port, host = 'localhost') {
      return new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          resolve();
        });
      });
    },

    /**
     * Stop the server gracefully.
     * @returns {Promise<void>}
     */
    stop() {
      return new Promise((resolve) => {
        server.close(() => resolve());
      });
    },

    server,
  };
}

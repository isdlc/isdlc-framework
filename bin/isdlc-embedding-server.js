#!/usr/bin/env node

/**
 * iSDLC Embedding Server Runner
 *
 * Starts the HTTP embedding server as a long-running process.
 * Reads configuration from .isdlc/config.json.
 * Loads .emb packages from docs/.embeddings/.
 *
 * Usage:
 *   node bin/isdlc-embedding-server.js [--port=7777] [--host=localhost]
 *
 * REQ-GH-224 FR-001, FR-011
 * @module bin/isdlc-embedding-server
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

async function main() {
  const projectRoot = process.cwd();
  const configPath = join(projectRoot, '.isdlc', 'config.json');

  // Parse CLI overrides
  let portOverride = null;
  let hostOverride = null;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--port=')) portOverride = parseInt(arg.split('=')[1], 10);
    if (arg.startsWith('--host=')) hostOverride = arg.split('=')[1];
  }

  // Read config
  let config = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch (err) {
      console.error(`[server] failed to parse config.json: ${err.message}`);
    }
  }

  const embConfig = config.embeddings || {};
  const serverConfig = embConfig.server || {};
  const port = portOverride || serverConfig.port || 7777;
  const host = hostOverride || serverConfig.host || 'localhost';
  const provider = embConfig.provider || 'jina-code';

  console.log(`[server] starting embedding server`);
  console.log(`[server] config: ${configPath}`);
  console.log(`[server] provider: ${provider}`);
  console.log(`[server] host:port: ${host}:${port}`);
  console.log(`[server] to change, edit .isdlc/config.json and restart`);

  // Load embedding engine
  let embedFn = null;
  try {
    const { embed } = await import('../lib/embedding/engine/index.js');
    // Contract: the MCP orchestrator calls embedFn(singleText) and expects
    // a single Float32Array back. Normalize input so callers can pass either
    // a single string (for queries) or an array (for bulk refresh).
    embedFn = async (textOrArray) => {
      const isArray = Array.isArray(textOrArray);
      const texts = isArray ? textOrArray : [textOrArray];
      const result = await embed(texts, {
        provider,
        parallelism: embConfig.parallelism,
        device: embConfig.device,
        batch_size: embConfig.batch_size,
        dtype: embConfig.dtype,
        session_options: embConfig.session_options,
        max_memory_gb: embConfig.max_memory_gb,
      });
      return isArray ? result.vectors : result.vectors[0];
    };
  } catch (err) {
    console.error(`[server] failed to load embedding engine: ${err.message}`);
    console.error(`[server] continuing without embedding (search will use loaded .emb only)`);
  }

  // Find .emb packages
  const embeddingsDir = join(projectRoot, 'docs', '.embeddings');
  const packagePaths = [];
  if (existsSync(embeddingsDir)) {
    try {
      const files = readdirSync(embeddingsDir);
      for (const f of files) {
        if (f.endsWith('.emb')) {
          packagePaths.push(join(embeddingsDir, f));
        }
      }
    } catch (err) {
      console.error(`[server] failed to scan ${embeddingsDir}: ${err.message}`);
    }
  }
  console.log(`[server] loading ${packagePaths.length} .emb packages from ${embeddingsDir}`);

  // Create MCP server
  const { createServer } = await import('../lib/embedding/mcp-server/server.js');
  const mcpServer = createServer({ packagePaths, embedFn });

  // Initialize (load packages)
  const initResult = await mcpServer.initialize();
  console.log(`[server] loaded ${initResult.loaded} packages, ${initResult.errors.length} errors`);
  if (initResult.errors.length > 0) {
    for (const err of initResult.errors) {
      console.error(`[server] load error: ${err}`);
    }
  }

  // Wrap in HTTP server
  const { createHttpServer } = await import('../lib/embedding/server/http-server.js');
  const httpServer = createHttpServer(mcpServer, { embedFn });

  // Start listening
  try {
    await httpServer.start(port, host);
    console.log(`[server] listening on http://${host}:${port}`);
    console.log(`[server] endpoints: /health /search /modules /refresh /add-content /reload`);
  } catch (err) {
    console.error(`[server] failed to start on ${host}:${port}: ${err.message}`);
    if (err.code === 'EADDRINUSE') {
      console.error(`[server] port ${port} is already in use. Edit config.json or stop the conflicting process.`);
    }
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`[server] ${signal} received, shutting down`);
    try {
      await httpServer.stop();
    } catch {}
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error(`[server] fatal: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});

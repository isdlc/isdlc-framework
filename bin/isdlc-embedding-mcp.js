#!/usr/bin/env node

/**
 * Stdio MCP bridge for iSDLC Embedding Server.
 *
 * Exposes our HTTP embedding server as an MCP server over stdio,
 * so Claude Code / Codex / Antigravity can invoke embedding tools
 * through their MCP ecosystem.
 *
 * MCP tools exposed:
 *   - isdlc_embedding_semantic_search
 *   - isdlc_embedding_list_modules
 *   - isdlc_embedding_add_content
 *
 * Delegates all calls to HTTP server at configured host:port.
 *
 * REQ-GH-224 FR-008, FR-009
 * @module bin/isdlc-embedding-mcp
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import readline from 'node:readline';

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

const PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const DEFAULTS = { host: 'localhost', port: 7777 };

function loadServerConfig() {
  try {
    const configPath = join(PROJECT_ROOT, '.isdlc', 'config.json');
    if (!existsSync(configPath)) return DEFAULTS;
    const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
    const srv = cfg?.embeddings?.server || {};
    return {
      host: srv.host || DEFAULTS.host,
      port: srv.port || DEFAULTS.port,
    };
  } catch {
    return DEFAULTS;
  }
}

const serverConfig = loadServerConfig();

// ---------------------------------------------------------------------------
// MCP protocol handlers (JSON-RPC 2.0 over stdio)
// ---------------------------------------------------------------------------

/**
 * Tool definitions exposed by this MCP bridge.
 */
const TOOLS = [
  {
    name: 'isdlc_embedding_semantic_search',
    description: 'Search code embeddings using natural language. Returns ranked hits tagged with source (code:/docs:/external:).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language search query' },
        maxResults: { type: 'number', description: 'Maximum results to return', default: 20 },
        modules: { type: 'array', items: { type: 'string' }, description: 'Filter to specific module IDs' },
      },
      required: ['query'],
    },
  },
  {
    name: 'isdlc_embedding_list_modules',
    description: 'List all loaded embedding modules (packages) and their metadata.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'isdlc_embedding_add_content',
    description: 'Push external content chunks to the embedding server. Use this to add Confluence pages, API docs, or other content fetched from your MCPs.',
    inputSchema: {
      type: 'object',
      properties: {
        chunks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'Chunk text content' },
              filePath: { type: 'string', description: 'Virtual path identifier' },
            },
            required: ['content'],
          },
          description: 'Array of content chunks to embed',
        },
        source: { type: 'string', description: 'Source tag (e.g., "external:confluence-wiki")' },
        tier: { type: 'string', enum: ['full', 'guided', 'interface'], default: 'full' },
      },
      required: ['chunks', 'source'],
    },
  },
];

/**
 * Forward a tool call to the HTTP embedding server.
 */
async function callServer(endpoint, method, body) {
  const url = `http://${serverConfig.host}:${serverConfig.port}${endpoint}`;
  const options = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) options.body = JSON.stringify(body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      return { isError: true, error: data.error || `HTTP ${res.status}` };
    }
    return { isError: false, data };
  } catch (err) {
    return { isError: true, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Handle a tool invocation from Claude / Codex / Antigravity.
 */
async function handleToolCall(name, args) {
  if (name === 'isdlc_embedding_semantic_search') {
    const result = await callServer('/search', 'POST', {
      query: args.query,
      maxResults: args.maxResults,
      modules: args.modules,
    });
    if (result.isError) return { content: [{ type: 'text', text: `Error: ${result.error}` }], isError: true };
    return {
      content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
    };
  }

  if (name === 'isdlc_embedding_list_modules') {
    const result = await callServer('/modules', 'GET', null);
    if (result.isError) return { content: [{ type: 'text', text: `Error: ${result.error}` }], isError: true };
    return {
      content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
    };
  }

  if (name === 'isdlc_embedding_add_content') {
    const result = await callServer('/add-content', 'POST', {
      chunks: args.chunks,
      source: args.source,
      tier: args.tier || 'full',
    });
    if (result.isError) return { content: [{ type: 'text', text: `Error: ${result.error}` }], isError: true };
    return {
      content: [{ type: 'text', text: `Added ${result.data.added} chunks from ${args.source}` }],
    };
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
}

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 stdio loop
// ---------------------------------------------------------------------------

function sendResponse(id, result, error) {
  const response = { jsonrpc: '2.0', id };
  if (error) response.error = error;
  else response.result = result;
  process.stdout.write(JSON.stringify(response) + '\n');
}

async function handleRequest(req) {
  const { id, method, params = {} } = req;

  try {
    if (method === 'initialize') {
      sendResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'isdlc-embedding-mcp', version: '0.1.0' },
      });
    } else if (method === 'tools/list') {
      sendResponse(id, { tools: TOOLS });
    } else if (method === 'tools/call') {
      const result = await handleToolCall(params.name, params.arguments || {});
      sendResponse(id, result);
    } else if (method === 'notifications/initialized') {
      // No response for notifications
    } else {
      sendResponse(id, null, { code: -32601, message: `Method not found: ${method}` });
    }
  } catch (err) {
    sendResponse(id, null, { code: -32603, message: `Internal error: ${err.message}` });
  }
}

// Read JSON-RPC messages from stdin, line by line
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    const req = JSON.parse(line);
    handleRequest(req);
  } catch (err) {
    process.stderr.write(`[mcp-bridge] parse error: ${err.message}\n`);
  }
});

rl.on('close', () => {
  process.exit(0);
});

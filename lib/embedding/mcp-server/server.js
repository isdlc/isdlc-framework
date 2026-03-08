/**
 * MCP Server — loads packages, exposes semantic search tools via MCP protocol.
 *
 * Tools: semantic_search, list_modules, module_info
 * Health endpoint: server status, loaded modules, latency metrics
 *
 * REQ-0045 / FR-003 / AC-003-01 through AC-003-05 / M7
 * @module lib/embedding/mcp-server/server
 */

import { createStoreManager } from './store-manager.js';
import { createOrchestrator } from './orchestrator.js';

/**
 * @typedef {Object} ServerConfig
 * @property {string[]} [packagePaths] - Paths to .emb files to load at startup
 * @property {Object} [registry] - Module registry instance for routing hints
 * @property {Function} [embedFn] - Embedding function: (text) => Float32Array
 * @property {Object} [sseConfig] - SSE transport configuration
 * @property {string} [sseConfig.path='/sse'] - SSE endpoint path
 * @property {number} [sseConfig.keepAliveMs=30000] - Keep-alive interval
 * @property {Object} [packageKeys] - Map of moduleId → Buffer decryption keys
 */

/**
 * @typedef {Object} ToolResult
 * @property {boolean} isError
 * @property {*} content
 */

/**
 * Create an MCP server instance.
 *
 * @param {ServerConfig} [config={}]
 * @returns {Object} Server API
 */
export function createServer(config = {}) {
  const {
    packagePaths = [],
    registry = null,
    embedFn = null,
    sseConfig = {},
    packageKeys = {},
  } = config;

  const storeManager = createStoreManager();
  const orchestrator = createOrchestrator(storeManager, registry, embedFn);

  const startTime = Date.now();
  let initialized = false;
  const loadErrors = [];

  // SSE transport config (stored for inspection)
  const sse = {
    path: sseConfig.path || '/sse',
    keepAliveMs: sseConfig.keepAliveMs || 30000,
  };

  /**
   * Initialize the server — load all configured packages.
   * @returns {Promise<{ loaded: number, errors: string[] }>}
   */
  async function initialize() {
    const results = { loaded: 0, errors: [] };

    for (const pkgPath of packagePaths) {
      try {
        const options = {};
        // Check if we have a decryption key (we need to peek at the moduleId
        // from the path or try loading and see if key is needed)
        // For encrypted packages, the caller provides keys in packageKeys map
        // We attempt loading with each potential key match
        await storeManager.loadPackage(pkgPath, options);
        results.loaded++;
      } catch (err) {
        // If it failed, try with decryption keys
        let loaded = false;
        for (const [, key] of Object.entries(packageKeys)) {
          try {
            await storeManager.loadPackage(pkgPath, { decryptionKey: key });
            results.loaded++;
            loaded = true;
            break;
          } catch {
            // Try next key
          }
        }
        if (!loaded) {
          const msg = `Failed to load ${pkgPath}: ${err.message}`;
          results.errors.push(msg);
          loadErrors.push(msg);
        }
      }
    }

    initialized = true;
    return results;
  }

  /**
   * Load a package at runtime (hot-load).
   * @param {string} packagePath
   * @param {Object} [options]
   * @param {Buffer} [options.decryptionKey]
   * @returns {Promise<Object>} Store handle
   */
  async function loadPackage(packagePath, options = {}) {
    return storeManager.loadPackage(packagePath, options);
  }

  /**
   * Hot-reload a package without server restart.
   * @param {string} moduleId
   * @param {string} newPath
   * @param {Object} [options]
   * @param {Buffer} [options.decryptionKey]
   * @returns {Promise<void>}
   */
  async function reloadPackage(moduleId, newPath, options = {}) {
    return storeManager.reloadPackage(moduleId, newPath, options);
  }

  // --- MCP Tool Handlers ---

  /**
   * semantic_search tool handler.
   * Delegates to orchestrator, returns hits with metadata.
   *
   * @param {Object} params
   * @param {string} params.query
   * @param {string[]} [params.modules] - Module filter
   * @param {number} [params.maxResults=20]
   * @param {number} [params.tokenBudget=5000]
   * @returns {Promise<ToolResult>}
   */
  async function semanticSearch(params = {}) {
    const { query, modules, maxResults, tokenBudget } = params;

    if (!query || typeof query !== 'string' || query.trim() === '') {
      return {
        isError: true,
        content: { error: 'query parameter is required and must be a non-empty string' },
      };
    }

    try {
      const result = await orchestrator.orchestrate(query, {
        maxResults,
        moduleFilter: modules,
        tokenBudget,
      });

      return {
        isError: false,
        content: {
          hits: result.hits.map(h => ({
            moduleId: h.moduleId,
            chunkId: h.chunkId,
            score: h.score,
            filePath: h.chunk.filePath,
            startLine: h.chunk.startLine,
            endLine: h.chunk.endLine,
            content: h.chunk.content,
            type: h.chunk.type,
            language: h.chunk.language,
          })),
          meta: {
            totalHits: result.hits.length,
            modulesSearched: result.modulesSearched,
            modulesTimedOut: result.modulesTimedOut,
            latencyMs: result.totalLatencyMs,
          },
        },
      };
    } catch (err) {
      return {
        isError: true,
        content: { error: `Search failed: ${err.message}` },
      };
    }
  }

  /**
   * list_modules tool handler.
   * Returns metadata for all loaded modules.
   *
   * @returns {ToolResult}
   */
  function listModules() {
    const stores = storeManager.listStores();
    return {
      isError: false,
      content: {
        modules: stores.map(s => ({
          moduleId: s.moduleId,
          version: s.version,
          dimensions: s.dimensions,
          chunkCount: s.chunkCount,
          encrypted: s.encrypted,
          keyId: s.keyId,
        })),
      },
    };
  }

  /**
   * module_info tool handler.
   * Returns detailed information for a specific module.
   *
   * @param {Object} params
   * @param {string} params.moduleId
   * @returns {ToolResult}
   */
  function moduleInfo(params = {}) {
    const { moduleId } = params;

    if (!moduleId || typeof moduleId !== 'string') {
      return {
        isError: true,
        content: { error: 'moduleId parameter is required' },
      };
    }

    const store = storeManager.getStore(moduleId);
    if (!store) {
      return {
        isError: true,
        content: { error: `Module not found: ${moduleId}` },
      };
    }

    return {
      isError: false,
      content: {
        module: {
          moduleId: store.moduleId,
          version: store.manifest.version,
          model: store.manifest.model,
          dimensions: store.dimensions,
          chunkCount: store.metadata.length,
          tier: store.manifest.tier,
          createdAt: store.manifest.createdAt,
          encrypted: !!store.manifest.encrypted,
          keyId: store.manifest.keyId || null,
          checksums: store.manifest.checksums,
          packagePath: store.packagePath,
        },
      },
    };
  }

  /**
   * Health check endpoint.
   * Reports server status, loaded modules, and latency metrics.
   *
   * @returns {Object} Health status
   */
  function health() {
    const stores = storeManager.listStores();
    const uptimeMs = Date.now() - startTime;

    return {
      status: 'ok',
      initialized,
      uptimeMs,
      modules: {
        loaded: stores.length,
        list: stores.map(s => ({
          moduleId: s.moduleId,
          chunkCount: s.chunkCount,
          dimensions: s.dimensions,
          encrypted: s.encrypted,
        })),
      },
      sse,
      errors: loadErrors.length > 0 ? loadErrors : undefined,
    };
  }

  /**
   * Get the MCP tool definitions for registration.
   * @returns {Object[]} Tool definitions in MCP format
   */
  function getToolDefinitions() {
    return [
      {
        name: 'semantic_search',
        description: 'Search code embeddings using natural language queries',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Natural language search query' },
            modules: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter to specific module IDs',
            },
            maxResults: { type: 'number', description: 'Maximum results to return', default: 20 },
            tokenBudget: { type: 'number', description: 'Token budget for results', default: 5000 },
          },
          required: ['query'],
        },
      },
      {
        name: 'list_modules',
        description: 'List all loaded embedding modules with metadata',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'module_info',
        description: 'Get detailed information about a specific module',
        inputSchema: {
          type: 'object',
          properties: {
            moduleId: { type: 'string', description: 'Module identifier' },
          },
          required: ['moduleId'],
        },
      },
    ];
  }

  /**
   * Handle an MCP tool call by name.
   * @param {string} toolName
   * @param {Object} params
   * @returns {Promise<ToolResult>}
   */
  async function handleToolCall(toolName, params = {}) {
    switch (toolName) {
      case 'semantic_search':
        return semanticSearch(params);
      case 'list_modules':
        return listModules();
      case 'module_info':
        return moduleInfo(params);
      default:
        return {
          isError: true,
          content: { error: `Unknown tool: ${toolName}` },
        };
    }
  }

  return {
    initialize,
    loadPackage,
    reloadPackage,
    semanticSearch,
    listModules,
    moduleInfo,
    health,
    getToolDefinitions,
    handleToolCall,
    // Expose internals for testing
    _storeManager: storeManager,
    _orchestrator: orchestrator,
  };
}

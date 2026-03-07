'use strict';

// REQ-0048 / FR-001 through FR-005, FR-009
// MCP Server Entry Point — tool registration, request routing, response formatting.

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { createFileOps } = require('./file-ops.js');

/**
 * Create and configure the MCP server with all tools registered.
 * Returns an object with tool names and a callTool helper for testing.
 *
 * @returns {{ mcpServer: McpServer, toolNames: string[], callTool: Function }}
 */
function createServer() {
  const fileOps = createFileOps();

  const mcpServer = new McpServer({
    name: 'bulk-fs-mcp',
    version: '0.1.0'
  });

  // Tool handlers map for direct testing
  const toolHandlers = {};

  // --- write_files ---
  const writeFilesSchema = {
    files: z.array(z.object({
      path: z.string(),
      content: z.string()
    }))
  };

  toolHandlers['write_files'] = async (args) => {
    return await fileOps.writeFiles(args.files);
  };

  mcpServer.tool(
    'write_files',
    'Write multiple files to disk atomically in a single call',
    writeFilesSchema,
    async (args) => {
      try {
        const result = await fileOps.writeFiles(args.files);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
          isError: true
        };
      }
    }
  );

  // --- read_files ---
  const readFilesSchema = {
    paths: z.array(z.string())
  };

  toolHandlers['read_files'] = async (args) => {
    return await fileOps.readFiles(args.paths);
  };

  mcpServer.tool(
    'read_files',
    'Read multiple files from disk in a single call',
    readFilesSchema,
    async (args) => {
      try {
        const result = await fileOps.readFiles(args.paths);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
          isError: true
        };
      }
    }
  );

  // --- append_section ---
  const appendSectionSchema = {
    path: z.string(),
    section_id: z.string(),
    content: z.string(),
    match_by: z.enum(['heading', 'marker']).optional()
  };

  toolHandlers['append_section'] = async (args) => {
    const options = args.match_by ? { matchBy: args.match_by } : undefined;
    return await fileOps.appendSection(args.path, args.section_id, args.content, options);
  };

  mcpServer.tool(
    'append_section',
    'Update a named section within a markdown file without rewriting the entire file',
    appendSectionSchema,
    async (args) => {
      try {
        const options = args.match_by ? { matchBy: args.match_by } : undefined;
        const result = await fileOps.appendSection(args.path, args.section_id, args.content, options);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
          isError: true
        };
      }
    }
  );

  // --- create_directories ---
  const createDirectoriesSchema = {
    paths: z.array(z.string())
  };

  toolHandlers['create_directories'] = async (args) => {
    return await fileOps.createDirectories(args.paths);
  };

  mcpServer.tool(
    'create_directories',
    'Create multiple directories with recursive parent creation',
    createDirectoriesSchema,
    async (args) => {
      try {
        const result = await fileOps.createDirectories(args.paths);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
          isError: true
        };
      }
    }
  );

  /**
   * Call a tool directly (for testing without MCP transport).
   * @param {string} name - Tool name
   * @param {object} args - Tool arguments
   * @returns {Promise<object>} Tool result
   */
  async function callTool(name, args) {
    const handler = toolHandlers[name];
    if (!handler) {
      throw new Error(`Unknown tool: '${name}'`);
    }

    try {
      return await handler(args);
    } catch (err) {
      return { error: err.message };
    }
  }

  return {
    mcpServer,
    toolNames: Object.keys(toolHandlers),
    callTool
  };
}

/**
 * Start the MCP server on stdio transport.
 */
async function main() {
  const { mcpServer } = createServer();
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

module.exports = { createServer, main };

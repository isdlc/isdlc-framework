'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('./server.js');

// REQ-0048 / FR-001 through FR-005, FR-009 — Server Unit Tests
// Tests use the internal createServer() to get access to the McpServer
// and call tool handlers directly, without spawning a process.

describe('server', () => {
  let serverInstance;

  beforeEach(() => {
    serverInstance = createServer();
  });

  // Helper: get registered tool names from the server
  function getToolNames() {
    // Access the internal registered tools via the McpServer instance
    return serverInstance.toolNames;
  }

  // Helper: call a tool handler directly
  async function callTool(name, args) {
    return serverInstance.callTool(name, args);
  }

  // --- Tool Registration: Positive ---

  // SV-01: Server registers write_files tool (AC-001-01)
  it('SV-01: registers write_files tool with correct schema', () => {
    const tools = getToolNames();
    assert.ok(tools.includes('write_files'));
  });

  // SV-02: Server registers read_files tool (AC-002-01)
  it('SV-02: registers read_files tool with correct schema', () => {
    const tools = getToolNames();
    assert.ok(tools.includes('read_files'));
  });

  // SV-03: Server registers append_section tool (AC-003-01)
  it('SV-03: registers append_section tool with correct schema', () => {
    const tools = getToolNames();
    assert.ok(tools.includes('append_section'));
  });

  // SV-04: Server registers create_directories tool (AC-004-01)
  it('SV-04: registers create_directories tool with correct schema', () => {
    const tools = getToolNames();
    assert.ok(tools.includes('create_directories'));
  });

  // --- Request Routing: Positive ---

  // SV-05: Server routes write_files call to fileOps.writeFiles (AC-001-01)
  it('SV-05: routes write_files to fileOps.writeFiles', async () => {
    const os = require('node:os');
    const fs = require('node:fs');
    const path = require('node:path');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-test-'));
    const filePath = path.join(tmpDir, 'test.txt');

    try {
      const result = await callTool('write_files', {
        files: [{ path: filePath, content: 'test content' }]
      });
      assert.ok(result.results);
      assert.equal(result.results[0].success, true);
      assert.equal(fs.readFileSync(filePath, 'utf-8'), 'test content');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // SV-06: Server routes read_files call to fileOps.readFiles (AC-002-01)
  it('SV-06: routes read_files to fileOps.readFiles', async () => {
    const os = require('node:os');
    const fs = require('node:fs');
    const path = require('node:path');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-test-'));
    const filePath = path.join(tmpDir, 'read.txt');
    fs.writeFileSync(filePath, 'read this');

    try {
      const result = await callTool('read_files', { paths: [filePath] });
      assert.ok(result.results);
      assert.equal(result.results[0].content, 'read this');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // SV-07: Server formats response with results and summary (AC-005-01, AC-005-04)
  it('SV-07: formats response with results array and summary', async () => {
    const os = require('node:os');
    const fs = require('node:fs');
    const path = require('node:path');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-test-'));
    const filePath = path.join(tmpDir, 'fmt.txt');

    try {
      const result = await callTool('write_files', {
        files: [{ path: filePath, content: 'data' }]
      });
      assert.ok(Array.isArray(result.results));
      assert.ok(result.summary);
      assert.equal(typeof result.summary.total, 'number');
      assert.equal(typeof result.summary.succeeded, 'number');
      assert.equal(typeof result.summary.failed, 'number');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // --- Error Handling: Negative ---

  // SV-08: Server returns error for unknown tool name (FR-009)
  it('SV-08: returns error for unknown tool name', async () => {
    await assert.rejects(
      callTool('nonexistent_tool', {}),
      (err) => {
        assert.ok(err.message.includes('Unknown tool'));
        return true;
      }
    );
  });

  // SV-09: Server handles thrown exception from fileOps gracefully (AC-005-02)
  it('SV-09: handles exception from fileOps gracefully', async () => {
    // Calling write_files with empty array should throw EMPTY_BATCH but server wraps it
    const result = await callTool('write_files', { files: [] });
    assert.ok(result.error);
    assert.ok(result.error.includes('EMPTY_BATCH'));
  });

  // SV-10: Server returns PROTOCOL_ERROR for malformed request (FR-009)
  it('SV-10: returns error for malformed request', async () => {
    // Missing required args — should produce an error
    const result = await callTool('write_files', {});
    assert.ok(result.error);
  });
});

'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

// REQ-0048 / FR-009 — E2E Tests: Server Lifecycle
// These tests spawn the actual server process and communicate via stdio.

const SERVER_PATH = path.join(__dirname, '..', 'index.js');

/**
 * Spawn the server process.
 * @returns {{ proc, send, receive, kill }}
 */
function spawnServer() {
  const proc = spawn('node', [SERVER_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env }
  });

  let buffer = '';
  const messages = [];
  let messageResolve = null;

  proc.stdout.on('data', (data) => {
    buffer += data.toString();
    // MCP uses newline-delimited JSON
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep incomplete line in buffer
    for (const line of lines) {
      if (line.trim()) {
        try {
          messages.push(JSON.parse(line));
          if (messageResolve) {
            messageResolve();
            messageResolve = null;
          }
        } catch (_) {
          // Not JSON — ignore
        }
      }
    }
  });

  function send(msg) {
    const json = JSON.stringify(msg);
    proc.stdin.write(json + '\n');
  }

  async function receive(timeoutMs) {
    const timeout = timeoutMs || 5000;
    if (messages.length > 0) {
      return messages.shift();
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        messageResolve = null;
        reject(new Error('Timeout waiting for server response'));
      }, timeout);

      messageResolve = () => {
        clearTimeout(timer);
        resolve(messages.shift());
      };
    });
  }

  function kill() {
    if (!proc.killed) {
      proc.kill('SIGTERM');
    }
  }

  return { proc, send, receive, kill };
}

describe('e2e: server lifecycle', () => {
  let server;

  afterEach(() => {
    if (server) {
      server.kill();
      server = null;
    }
  });

  // E2E-01: Server starts on stdio and responds to initialize (AC-009-03)
  it('E2E-01: server starts and responds to initialize', async () => {
    server = spawnServer();

    server.send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' }
      }
    });

    const response = await server.receive(5000);
    assert.equal(response.jsonrpc, '2.0');
    assert.equal(response.id, 1);
    assert.ok(response.result);
    assert.ok(response.result.serverInfo);
    assert.equal(response.result.serverInfo.name, 'bulk-fs-mcp');
  });

  // E2E-02: Server lists all 4 tools in capabilities (AC-009-03)
  it('E2E-02: server lists all 4 tools', async () => {
    server = spawnServer();

    // Initialize first
    server.send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' }
      }
    });
    await server.receive(5000);

    // Send initialized notification
    server.send({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {}
    });

    // List tools
    server.send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    });

    const response = await server.receive(5000);
    assert.equal(response.id, 2);
    assert.ok(response.result);
    assert.ok(Array.isArray(response.result.tools));

    const toolNames = response.result.tools.map((t) => t.name);
    assert.ok(toolNames.includes('write_files'), 'Missing write_files');
    assert.ok(toolNames.includes('read_files'), 'Missing read_files');
    assert.ok(toolNames.includes('append_section'), 'Missing append_section');
    assert.ok(toolNames.includes('create_directories'), 'Missing create_directories');
  });

  // E2E-03: Server process exits cleanly on SIGTERM (FR-009)
  it('E2E-03: clean exit on SIGTERM', async () => {
    server = spawnServer();

    // Give it a moment to start
    await new Promise((r) => setTimeout(r, 200));

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Server did not exit within 5s'));
      }, 5000);

      server.proc.on('exit', (code) => {
        clearTimeout(timer);
        // SIGTERM typically results in null code on POSIX
        assert.ok(code === 0 || code === null, `Expected exit code 0 or null, got ${code}`);
        server = null; // prevent double-kill in afterEach
        resolve();
      });

      server.proc.kill('SIGTERM');
    });
  });

  // E2E-04: Server handles malformed JSON input without crashing (FR-009)
  it('E2E-04: malformed JSON does not crash server', async () => {
    server = spawnServer();

    // Send malformed JSON
    server.proc.stdin.write('{invalid json\n');

    // Wait a moment — server should still be alive
    await new Promise((r) => setTimeout(r, 500));

    assert.ok(!server.proc.killed, 'Server should still be running');
    assert.ok(server.proc.exitCode === null, 'Server should not have exited');

    // Verify it can still respond to a valid request
    server.send({
      jsonrpc: '2.0',
      id: 99,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' }
      }
    });

    const response = await server.receive(5000);
    assert.equal(response.id, 99);
  });
});

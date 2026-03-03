/**
 * Tests for lib/search/install.js
 *
 * REQ-0041 / FR-004, FR-005: Tool Installation and MCP Configuration
 * Tests install success/failure, MCP config generation, settings.json preservation.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../utils/test-helpers.js';
import { installTool, configureMcpServers, removeMcpServer } from './install.js';

describe('Search Install', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  describe('installTool', () => {
    // TC-004-01: Successful tool installation
    it('should install tool when user consents', async () => {
      const recommendation = {
        tool: {
          name: 'ast-grep',
          installed: false,
          installMethods: [{ method: 'npm', command: 'npm install -g @ast-grep/cli', available: true }],
        },
        reason: 'Provides structural search',
        installMethod: { method: 'npm', command: 'npm install -g @ast-grep/cli', available: true },
      };

      const execFn = (cmd) => {
        if (cmd.includes('install')) return { success: true, output: 'installed' };
        if (cmd.includes('--version')) return { success: true, output: 'ast-grep 0.25.0' };
        return { success: false, output: '' };
      };

      const result = await installTool(
        recommendation,
        async () => true, // consent
        { execFn }
      );

      assert.equal(result.success, true);
      assert.equal(result.tool, 'ast-grep');
      assert.equal(result.version, '0.25.0');
    });

    // TC-004-02: User declines installation
    it('should not install when user declines', async () => {
      const recommendation = {
        tool: { name: 'ast-grep', installed: false, installMethods: [] },
        reason: 'test',
        installMethod: { method: 'npm', command: 'npm install -g @ast-grep/cli', available: true },
      };

      const result = await installTool(
        recommendation,
        async () => false, // decline
      );

      assert.equal(result.success, false);
      assert.ok(result.error.includes('declined'));
    });

    // TC-004-04: Installation failure reported
    it('should report installation failure', async () => {
      const recommendation = {
        tool: {
          name: 'ast-grep',
          installed: false,
          installMethods: [{ method: 'npm', command: 'npm install -g @ast-grep/cli', available: true }],
        },
        reason: 'test',
        installMethod: { method: 'npm', command: 'npm install -g @ast-grep/cli', available: true },
      };

      const execFn = () => ({ success: false, output: '', error: 'EACCES: permission denied' });

      const result = await installTool(
        recommendation,
        async () => true,
        { execFn }
      );

      assert.equal(result.success, false);
      assert.equal(result.errorCode, 'INSTALL_PERMISSION_DENIED');
    });

    // TC-004-10: Permission denied
    it('should classify EACCES as INSTALL_PERMISSION_DENIED', async () => {
      const recommendation = {
        tool: { name: 'test', installed: false, installMethods: [] },
        reason: 'test',
        installMethod: { method: 'npm', command: 'npm i test', available: true },
      };

      const execFn = () => ({ success: false, output: '', error: 'EACCES error' });
      const result = await installTool(recommendation, async () => true, { execFn });
      assert.equal(result.errorCode, 'INSTALL_PERMISSION_DENIED');
    });

    // TC-004-11: Network failure
    it('should classify network error as INSTALL_NETWORK_FAILURE', async () => {
      const recommendation = {
        tool: { name: 'test', installed: false, installMethods: [] },
        reason: 'test',
        installMethod: { method: 'npm', command: 'npm i test', available: true },
      };

      const execFn = () => ({ success: false, output: '', error: 'ENOTFOUND registry.npmjs.org' });
      const result = await installTool(recommendation, async () => true, { execFn });
      assert.equal(result.errorCode, 'INSTALL_NETWORK_FAILURE');
    });

    // TC-004-05: Failed install tries fallback
    it('should try fallback install method on primary failure', async () => {
      const recommendation = {
        tool: {
          name: 'ast-grep',
          installed: false,
          installMethods: [
            { method: 'npm', command: 'npm install -g @ast-grep/cli', available: true },
            { method: 'brew', command: 'brew install ast-grep', available: true },
          ],
        },
        reason: 'test',
        installMethod: { method: 'npm', command: 'npm install -g @ast-grep/cli', available: true },
      };

      let callCount = 0;
      const execFn = (cmd) => {
        callCount++;
        if (cmd.includes('npm install')) return { success: false, output: '', error: 'npm error' };
        if (cmd.includes('brew install')) return { success: true, output: 'installed' };
        if (cmd.includes('--version')) return { success: true, output: '0.25.0' };
        return { success: false, output: '' };
      };

      const result = await installTool(recommendation, async () => true, { execFn });
      assert.equal(result.success, true);
      assert.ok(callCount >= 2); // primary + fallback
    });

    // TC-004-07: Installation does not block setup
    it('should always return fallbackAvailable=true', async () => {
      const recommendation = {
        tool: { name: 'test', installed: false, installMethods: [] },
        reason: 'test',
        installMethod: { method: 'npm', command: 'npm i test', available: true },
      };

      const execFn = () => ({ success: false, output: '', error: 'failed' });
      const result = await installTool(recommendation, async () => true, { execFn });
      assert.equal(result.fallbackAvailable, true);
    });

    // TC-004-16: Consent callback receives correct info
    it('should pass correct info to consent callback', async () => {
      let receivedArgs = null;
      const recommendation = {
        tool: { name: 'ast-grep', installed: false, installMethods: [] },
        reason: 'Provides structural search',
        installMethod: { method: 'npm', command: 'npm install -g @ast-grep/cli', available: true },
      };

      await installTool(
        recommendation,
        async (name, reason, command) => {
          receivedArgs = { name, reason, command };
          return false;
        },
      );

      assert.equal(receivedArgs.name, 'ast-grep');
      assert.equal(receivedArgs.reason, 'Provides structural search');
      assert.equal(receivedArgs.command, 'npm install -g @ast-grep/cli');
    });

    it('should handle null recommendation gracefully', async () => {
      const result = await installTool(
        { tool: null, installMethod: null },
        async () => true,
      );
      assert.equal(result.success, false);
    });

    it('should handle consent callback throwing', async () => {
      const recommendation = {
        tool: { name: 'test', installed: false, installMethods: [] },
        reason: 'test',
        installMethod: { method: 'npm', command: 'npm i test', available: true },
      };

      const result = await installTool(
        recommendation,
        async () => { throw new Error('prompt failed'); },
      );
      assert.equal(result.success, false);
    });
  });

  describe('configureMcpServers', () => {
    // TC-005-01: Add MCP server entry
    it('should add MCP server to settings.json', async () => {
      const settingsPath = join(tmpDir, '.claude', 'settings.json');

      const { configured, errors } = await configureMcpServers(
        [{ id: 'ast-grep' }],
        settingsPath,
      );

      assert.ok(configured.includes('ast-grep'));
      assert.equal(errors.length, 0);

      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      assert.ok(settings.mcpServers['ast-grep']);
      assert.equal(settings.mcpServers['ast-grep'].command, 'ast-grep');
      assert.deepStrictEqual(settings.mcpServers['ast-grep'].args, ['lsp']);
    });

    // TC-005-02: Preserve existing MCP configurations
    it('should preserve existing MCP servers', async () => {
      const claudeDir = join(tmpDir, '.claude');
      mkdirSync(claudeDir, { recursive: true });
      const settingsPath = join(claudeDir, 'settings.json');
      writeFileSync(
        settingsPath,
        JSON.stringify({
          mcpServers: { 'other-mcp': { command: 'other', args: [] } },
        }),
        'utf-8'
      );

      await configureMcpServers([{ id: 'ast-grep' }], settingsPath);

      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      assert.ok(settings.mcpServers['other-mcp']);
      assert.ok(settings.mcpServers['ast-grep']);
    });

    // TC-005-05: Create settings.json if not exists
    it('should create settings.json and directory if needed', async () => {
      const settingsPath = join(tmpDir, '.claude', 'settings.json');

      await configureMcpServers([{ id: 'ast-grep' }], settingsPath);

      assert.ok(existsSync(settingsPath));
    });

    // TC-005-06: Handle corrupt settings.json
    it('should handle corrupt settings.json', async () => {
      const claudeDir = join(tmpDir, '.claude');
      mkdirSync(claudeDir, { recursive: true });
      const settingsPath = join(claudeDir, 'settings.json');
      writeFileSync(settingsPath, 'NOT JSON!!!', 'utf-8');

      const { configured, errors } = await configureMcpServers(
        [{ id: 'ast-grep' }],
        settingsPath,
      );

      assert.equal(configured.length, 0);
      assert.ok(errors.some(e => e.code === 'CONFIG_SETTINGS_CORRUPT'));
    });

    // TC-005-07: Conflict with existing MCP server name
    it('should report conflict when server exists with different config', async () => {
      const claudeDir = join(tmpDir, '.claude');
      mkdirSync(claudeDir, { recursive: true });
      const settingsPath = join(claudeDir, 'settings.json');
      writeFileSync(
        settingsPath,
        JSON.stringify({
          mcpServers: { 'ast-grep': { command: 'different-command', args: [] } },
        }),
        'utf-8'
      );

      const { errors } = await configureMcpServers(
        [{ id: 'ast-grep' }],
        settingsPath,
      );

      assert.ok(errors.some(e => e.code === 'CONFIG_MCP_CONFLICT'));
    });

    // TC-005-08: Multiple backends configured at once
    it('should configure multiple backends', async () => {
      const settingsPath = join(tmpDir, '.claude', 'settings.json');

      const { configured } = await configureMcpServers(
        [{ id: 'ast-grep' }, { id: 'probe' }],
        settingsPath,
        { projectRoot: tmpDir },
      );

      assert.ok(configured.includes('ast-grep'));
      assert.ok(configured.includes('probe'));

      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      assert.ok(settings.mcpServers['ast-grep']);
      assert.ok(settings.mcpServers['probe']);
    });

    // TC-005-03: Probe configuration includes workspace
    it('should configure Probe with workspace path', async () => {
      const settingsPath = join(tmpDir, '.claude', 'settings.json');

      await configureMcpServers(
        [{ id: 'probe' }],
        settingsPath,
        { projectRoot: '/my/project' },
      );

      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      assert.deepStrictEqual(settings.mcpServers['probe'].args, ['--workspace', '/my/project']);
    });

    it('should handle unknown backend ID', async () => {
      const settingsPath = join(tmpDir, '.claude', 'settings.json');

      const { errors } = await configureMcpServers(
        [{ id: 'unknown-backend' }],
        settingsPath,
      );

      assert.ok(errors.some(e => e.code === 'CONFIG_MCP_UNKNOWN'));
    });
  });

  // REQ-0044 / FR-002: Code-Index-MCP Installation
  describe('code-index-mcp configuration', () => {
    // TC-002-01: MCP_CONFIGS includes code-index-mcp entry
    it('should configure code-index-mcp MCP server', async () => {
      const settingsPath = join(tmpDir, '.claude', 'settings.json');

      const { configured, errors } = await configureMcpServers(
        [{ id: 'code-index-mcp' }],
        settingsPath,
      );

      assert.ok(configured.includes('code-index-mcp'), 'code-index-mcp should be configured');
      assert.equal(errors.length, 0);

      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      assert.ok(settings.mcpServers['code-index-mcp']);
      assert.equal(settings.mcpServers['code-index-mcp'].command, 'code-index-mcp');
    });

    // TC-002-02: configureMcpServers writes code-index-mcp alongside existing backends
    it('should configure code-index-mcp alongside existing backends', async () => {
      const settingsPath = join(tmpDir, '.claude', 'settings.json');

      const { configured } = await configureMcpServers(
        [{ id: 'ast-grep' }, { id: 'code-index-mcp' }],
        settingsPath,
      );

      assert.ok(configured.includes('ast-grep'));
      assert.ok(configured.includes('code-index-mcp'));

      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      assert.ok(settings.mcpServers['ast-grep']);
      assert.ok(settings.mcpServers['code-index-mcp']);
    });
  });

  // TC-005-04: Remove MCP configuration on opt-out
  describe('removeMcpServer', () => {
    it('should remove MCP server entry', () => {
      const claudeDir = join(tmpDir, '.claude');
      mkdirSync(claudeDir, { recursive: true });
      const settingsPath = join(claudeDir, 'settings.json');
      writeFileSync(
        settingsPath,
        JSON.stringify({
          mcpServers: {
            'ast-grep': { command: 'ast-grep', args: ['lsp'] },
            'other': { command: 'other', args: [] },
          },
        }),
        'utf-8'
      );

      const result = removeMcpServer('ast-grep', settingsPath);
      assert.equal(result.success, true);

      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      assert.equal(settings.mcpServers['ast-grep'], undefined);
      assert.ok(settings.mcpServers['other']); // preserved
    });

    it('should succeed when settings.json does not exist', () => {
      const result = removeMcpServer('ast-grep', join(tmpDir, '.claude', 'settings.json'));
      assert.equal(result.success, true);
    });

    it('should handle corrupt settings.json', () => {
      const claudeDir = join(tmpDir, '.claude');
      mkdirSync(claudeDir, { recursive: true });
      const settingsPath = join(claudeDir, 'settings.json');
      writeFileSync(settingsPath, 'CORRUPT', 'utf-8');

      const result = removeMcpServer('ast-grep', settingsPath);
      assert.equal(result.success, false);
    });
  });
});

/**
 * Tests for lib/search/detection.js
 *
 * REQ-0041 / FR-003: Search Capability Detection
 * Tests tool presence detection, scale tier classification, MCP detection.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../utils/test-helpers.js';
import { detectSearchCapabilities, assessProjectScale } from './detection.js';

/**
 * Create a stub exec function for testing.
 * @param {Object} responses - Map of command patterns to { success, output }
 */
function createExecStub(responses = {}) {
  return (command) => {
    for (const [pattern, result] of Object.entries(responses)) {
      if (command.includes(pattern)) {
        return result;
      }
    }
    return { success: false, output: '' };
  };
}

describe('Search Detection', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  describe('detectSearchCapabilities', () => {
    // TC-003-01: Detect ast-grep when installed
    it('should detect ast-grep when installed', async () => {
      const execFn = createExecStub({
        'ast-grep --version': { success: true, output: 'ast-grep 0.25.0' },
        'npm --version': { success: true, output: '10.0.0' },
        'cargo --version': { success: false, output: '' },
        'brew --version': { success: false, output: '' },
      });

      const result = await detectSearchCapabilities(tmpDir, { execFn });
      const astGrep = result.tools.find(t => t.name === 'ast-grep');
      assert.ok(astGrep);
      assert.equal(astGrep.installed, true);
      assert.equal(astGrep.version, '0.25.0');
    });

    // TC-003-02: Detect ast-grep not installed
    it('should report ast-grep not installed', async () => {
      const execFn = createExecStub({
        'npm --version': { success: true, output: '10.0.0' },
      });

      const result = await detectSearchCapabilities(tmpDir, { execFn });
      const astGrep = result.tools.find(t => t.name === 'ast-grep');
      assert.ok(astGrep);
      assert.equal(astGrep.installed, false);
    });

    // TC-003-03: Detect Probe when installed
    it('should detect Probe when installed', async () => {
      const execFn = createExecStub({
        'probe --version': { success: true, output: 'probe 1.2.3' },
        'npm --version': { success: false, output: '' },
        'cargo --version': { success: true, output: 'cargo 1.70.0' },
        'brew --version': { success: false, output: '' },
      });

      const result = await detectSearchCapabilities(tmpDir, { execFn });
      const probe = result.tools.find(t => t.name === 'probe');
      assert.ok(probe);
      assert.equal(probe.installed, true);
    });

    // TC-003-04: Detect available package managers
    it('should report available package managers', async () => {
      const execFn = createExecStub({
        'npm --version': { success: true, output: '10.0.0' },
        'brew --version': { success: true, output: 'Homebrew 4.0.0' },
        'cargo --version': { success: false, output: '' },
      });

      const result = await detectSearchCapabilities(tmpDir, { execFn });
      const astGrep = result.tools.find(t => t.name === 'ast-grep');

      const npmMethod = astGrep.installMethods.find(m => m.method === 'npm');
      const brewMethod = astGrep.installMethods.find(m => m.method === 'brew');
      const cargoMethod = astGrep.installMethods.find(m => m.method === 'cargo');

      assert.equal(npmMethod.available, true);
      assert.equal(brewMethod.available, true);
      assert.equal(cargoMethod.available, false);
    });

    // TC-003-08: Detect existing MCP configurations
    it('should detect existing MCP servers', async () => {
      const claudeDir = join(tmpDir, '.claude');
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(
        join(claudeDir, 'settings.json'),
        JSON.stringify({ mcpServers: { 'ast-grep': { command: 'ast-grep', args: ['lsp'] } } }),
        'utf-8'
      );

      const execFn = createExecStub({
        'npm --version': { success: true, output: '10.0.0' },
      });

      const result = await detectSearchCapabilities(tmpDir, { execFn });
      assert.ok(result.existingMcpServers.includes('ast-grep'));
    });

    // TC-003-09: Respect existing MCP configurations
    it('should not recommend tools already configured as MCP', async () => {
      const claudeDir = join(tmpDir, '.claude');
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(
        join(claudeDir, 'settings.json'),
        JSON.stringify({ mcpServers: { 'ast-grep': { command: 'ast-grep', args: ['lsp'] } } }),
        'utf-8'
      );

      const execFn = createExecStub({
        'npm --version': { success: true, output: '10.0.0' },
      });

      const result = await detectSearchCapabilities(tmpDir, { execFn });
      const astGrepRec = result.recommendations.find(r => r.tool.name === 'ast-grep');
      assert.equal(astGrepRec, undefined);
    });

    // TC-003-10: Report findings with recommendations
    it('should generate recommendations for uninstalled tools', async () => {
      // Create some files for medium scale tier
      for (let i = 0; i < 5; i++) {
        writeFileSync(join(tmpDir, `file${i}.js`), 'content', 'utf-8');
      }

      const execFn = createExecStub({
        'npm --version': { success: true, output: '10.0.0' },
      });

      const result = await detectSearchCapabilities(tmpDir, { execFn });
      assert.ok(result.recommendations.length > 0);
      for (const rec of result.recommendations) {
        assert.ok(rec.reason);
        assert.ok(rec.installMethod);
        assert.ok(['recommended', 'optional'].includes(rec.priority));
      }
    });

    // TC-003-12: Non-existent project directory
    it('should handle non-existent directory gracefully', async () => {
      const result = await detectSearchCapabilities('/nonexistent/path');
      assert.equal(result.scaleTier, 'small');
      assert.equal(result.fileCount, 0);
      assert.deepStrictEqual(result.tools, []);
    });

    // TC-003-13: Detection with no tools installed
    it('should report all tools as not installed', async () => {
      const execFn = createExecStub({});

      const result = await detectSearchCapabilities(tmpDir, { execFn });
      for (const tool of result.tools) {
        assert.equal(tool.installed, false);
      }
    });
  });

  // REQ-0044 / FR-001: Code-Index-MCP Detection
  describe('code-index-mcp detection', () => {
    // TC-001-01: Detect code-index-mcp when installed
    it('should detect code-index-mcp when installed', async () => {
      const execFn = createExecStub({
        'code-index-mcp --version': { success: true, output: '1.0.0' },
        'npm --version': { success: true, output: '10.0.0' },
      });

      const result = await detectSearchCapabilities(tmpDir, { execFn });
      const codeIndex = result.tools.find(t => t.name === 'code-index-mcp');
      assert.ok(codeIndex, 'code-index-mcp should be in tools list');
      assert.equal(codeIndex.installed, true);
      assert.equal(codeIndex.version, '1.0.0');
    });

    // TC-001-02: Report code-index-mcp not installed
    it('should report code-index-mcp not installed', async () => {
      const execFn = createExecStub({
        'npm --version': { success: true, output: '10.0.0' },
      });

      const result = await detectSearchCapabilities(tmpDir, { execFn });
      const codeIndex = result.tools.find(t => t.name === 'code-index-mcp');
      assert.ok(codeIndex, 'code-index-mcp should be in tools list');
      assert.equal(codeIndex.installed, false);
    });

    // TC-001-03: Detect Python 3.8+ via python3 — pip available as package manager
    it('should detect pip as package manager when Python 3.8+ available', async () => {
      const execFn = createExecStub({
        'python3 --version': { success: true, output: 'Python 3.11.4' },
        'pip3 --version': { success: true, output: 'pip 23.2.1' },
        'npm --version': { success: true, output: '10.0.0' },
      });

      // Create files for medium scale tier to trigger recommendation
      for (let i = 0; i < 5; i++) {
        writeFileSync(join(tmpDir, `file${i}.js`), 'content', 'utf-8');
      }

      const result = await detectSearchCapabilities(tmpDir, { execFn });
      const codeIndex = result.tools.find(t => t.name === 'code-index-mcp');
      assert.ok(codeIndex, 'code-index-mcp should be in tools list');
      const pipMethod = codeIndex.installMethods.find(m => m.method === 'pip');
      assert.ok(pipMethod, 'pip install method should exist');
      assert.equal(pipMethod.available, true);
    });

    // TC-001-04: Skip recommendation when Python < 3.8
    it('should skip code-index-mcp recommendation when Python < 3.8', async () => {
      const execFn = createExecStub({
        'python3 --version': { success: true, output: 'Python 3.7.9' },
        'npm --version': { success: true, output: '10.0.0' },
      });

      const result = await detectSearchCapabilities(tmpDir, { execFn });
      const codeIndexRec = result.recommendations.find(
        r => r.tool.name === 'code-index-mcp'
      );
      assert.equal(codeIndexRec, undefined, 'Should not recommend code-index-mcp with Python < 3.8');
    });

    // TC-001-05: Skip recommendation when Python not available
    it('should skip code-index-mcp recommendation when Python not available', async () => {
      const execFn = createExecStub({
        'npm --version': { success: true, output: '10.0.0' },
      });

      const result = await detectSearchCapabilities(tmpDir, { execFn });
      const codeIndexRec = result.recommendations.find(
        r => r.tool.name === 'code-index-mcp'
      );
      assert.equal(codeIndexRec, undefined, 'Should not recommend code-index-mcp without Python');
    });
  });

  describe('assessProjectScale', () => {
    // TC-003-05: Classify small project
    it('should classify project with few files as small', async () => {
      for (let i = 0; i < 50; i++) {
        writeFileSync(join(tmpDir, `file${i}.txt`), 'content', 'utf-8');
      }

      const { scaleTier, fileCount } = await assessProjectScale(tmpDir);
      assert.equal(scaleTier, 'small');
      assert.ok(fileCount >= 50);
    });

    // TC-003-11: Empty project directory
    it('should classify empty directory as small', async () => {
      const { scaleTier, fileCount } = await assessProjectScale(tmpDir);
      assert.equal(scaleTier, 'small');
      assert.equal(fileCount, 0);
    });

    it('should handle non-existent path', async () => {
      const { scaleTier, fileCount } = await assessProjectScale('/nonexistent');
      assert.equal(scaleTier, 'small');
      assert.equal(fileCount, 0);
    });

    it('should skip hidden directories and node_modules', async () => {
      // Create files in node_modules (should be skipped)
      const nmDir = join(tmpDir, 'node_modules', 'pkg');
      mkdirSync(nmDir, { recursive: true });
      for (let i = 0; i < 100; i++) {
        writeFileSync(join(nmDir, `dep${i}.js`), 'content', 'utf-8');
      }

      // Create a few real files
      for (let i = 0; i < 3; i++) {
        writeFileSync(join(tmpDir, `src${i}.js`), 'content', 'utf-8');
      }

      const { fileCount } = await assessProjectScale(tmpDir);
      // Should count only the 3 real files, not node_modules
      assert.ok(fileCount < 50, `Expected < 50, got ${fileCount}`);
    });

    it('should handle null projectRoot', async () => {
      const { scaleTier } = await assessProjectScale(null);
      assert.equal(scaleTier, 'small');
    });
  });
});

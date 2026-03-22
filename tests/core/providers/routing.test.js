/**
 * Tests for src/core/providers/routing.js
 * REQ-0127: Extract provider routing from provider-utils.cjs
 *
 * Tests provider selection, fallback, model resolution, health checking.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseProviderModel,
  isLocalProvider,
  getDefaultModel,
  resolveModelId,
  selectProvider,
  autoDetectProvider
} from '../../../src/core/providers/routing.js';

describe('parseProviderModel', () => {
  it('parses "provider:model" string format', () => {
    const result = parseProviderModel('anthropic:sonnet');
    assert.strictEqual(result.provider, 'anthropic');
    assert.strictEqual(result.model, 'sonnet');
  });

  it('parses provider-only string', () => {
    const result = parseProviderModel('ollama');
    assert.strictEqual(result.provider, 'ollama');
    assert.strictEqual(result.model, null);
  });

  it('parses object input', () => {
    const result = parseProviderModel({ provider: 'anthropic', model: 'opus' });
    assert.strictEqual(result.provider, 'anthropic');
    assert.strictEqual(result.model, 'opus');
  });

  it('returns nulls for invalid input', () => {
    const result = parseProviderModel(42);
    assert.strictEqual(result.provider, null);
    assert.strictEqual(result.model, null);
  });

  it('returns null model for object without model', () => {
    const result = parseProviderModel({ provider: 'ollama' });
    assert.strictEqual(result.provider, 'ollama');
    assert.strictEqual(result.model, null);
  });
});

describe('isLocalProvider', () => {
  it('returns true for ollama', () => {
    assert.strictEqual(isLocalProvider('ollama'), true);
  });

  it('returns true for local', () => {
    assert.strictEqual(isLocalProvider('local'), true);
  });

  it('returns false for anthropic', () => {
    assert.strictEqual(isLocalProvider('anthropic'), false);
  });

  it('returns false for openrouter', () => {
    assert.strictEqual(isLocalProvider('openrouter'), false);
  });
});

describe('getDefaultModel', () => {
  const config = {
    providers: {
      anthropic: {
        models: [
          { id: 'claude-sonnet-4-20250514', alias: 'sonnet' },
          { id: 'claude-opus-4-5-20251101', alias: 'opus' }
        ]
      },
      empty: { models: [] }
    }
  };

  it('returns first model alias', () => {
    assert.strictEqual(getDefaultModel(config, 'anthropic'), 'sonnet');
  });

  it('returns null for provider with no models', () => {
    assert.strictEqual(getDefaultModel(config, 'empty'), null);
  });

  it('returns null for unknown provider', () => {
    assert.strictEqual(getDefaultModel(config, 'nonexistent'), null);
  });
});

describe('resolveModelId', () => {
  const config = {
    providers: {
      anthropic: {
        models: [
          { id: 'claude-sonnet-4-20250514', alias: 'sonnet' },
          { id: 'claude-opus-4-5-20251101', alias: 'opus' }
        ]
      }
    }
  };

  it('resolves alias to full model ID', () => {
    assert.strictEqual(resolveModelId(config, 'anthropic', 'sonnet'), 'claude-sonnet-4-20250514');
  });

  it('returns full model ID when given directly', () => {
    assert.strictEqual(resolveModelId(config, 'anthropic', 'claude-opus-4-5-20251101'), 'claude-opus-4-5-20251101');
  });

  it('returns alias as-is when not found', () => {
    assert.strictEqual(resolveModelId(config, 'anthropic', 'unknown'), 'unknown');
  });
});

describe('selectProvider', () => {
  const baseConfig = {
    providers: {
      anthropic: { enabled: true, models: [{ id: 'claude-sonnet-4-20250514', alias: 'sonnet' }] },
      ollama: { enabled: true, models: [{ id: 'qwen-coder', alias: 'qwen' }] }
    },
    defaults: { provider: 'anthropic', model: 'sonnet' },
    active_mode: 'quality',
    phase_routing: {},
    agent_overrides: {},
    modes: {
      quality: { default_provider: 'anthropic', default_model: 'opus' },
      local: { default_model: 'qwen-coder', warning: 'Local only' },
      budget: { cloud_phases_only: ['08-code-review'] }
    }
  };

  it('returns global default when no overrides', () => {
    const result = selectProvider(baseConfig, { current_phase: '06-implementation' }, { subagent_type: 'dev' });
    assert.strictEqual(result.provider, 'anthropic');
    assert.strictEqual(result.source, 'mode_quality');
  });

  it('uses agent override when configured', () => {
    const config = { ...baseConfig, agent_overrides: { 'test-agent': { provider: 'ollama', model: 'qwen' } } };
    const result = selectProvider(config, {}, { subagent_type: 'test-agent' });
    assert.strictEqual(result.provider, 'ollama');
    assert.strictEqual(result.source, 'agent_override');
  });

  it('uses phase routing in hybrid mode', () => {
    const config = {
      ...baseConfig,
      active_mode: 'hybrid',
      phase_routing: { '06-implementation': { provider: 'ollama', model: 'qwen' } }
    };
    const result = selectProvider(config, { active_workflow: { current_phase: '06-implementation' } }, { subagent_type: 'dev' });
    assert.strictEqual(result.provider, 'ollama');
    assert.strictEqual(result.source, 'phase_routing');
  });

  it('falls back to global defaults when no mode matched', () => {
    const config = { ...baseConfig, active_mode: 'unknown_mode' };
    const result = selectProvider(config, { current_phase: '06-implementation' }, { subagent_type: 'dev' });
    assert.strictEqual(result.provider, 'anthropic');
    assert.strictEqual(result.source, 'global_default');
  });
});

describe('autoDetectProvider', () => {
  let savedEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
  });

  it('detects ollama from ANTHROPIC_BASE_URL with localhost:11434', async () => {
    process.env.ANTHROPIC_BASE_URL = 'http://localhost:11434';
    try {
      const result = await autoDetectProvider({});
      assert.strictEqual(result.provider, 'ollama');
      assert.strictEqual(result.source, 'env_var');
    } finally {
      Object.assign(process.env, savedEnv);
      if (!savedEnv.ANTHROPIC_BASE_URL) delete process.env.ANTHROPIC_BASE_URL;
    }
  });

  it('detects anthropic from ANTHROPIC_API_KEY', async () => {
    delete process.env.ANTHROPIC_BASE_URL;
    process.env.ANTHROPIC_API_KEY = 'test-key';
    try {
      const result = await autoDetectProvider({});
      assert.strictEqual(result.provider, 'anthropic');
      assert.strictEqual(result.source, 'env_var');
    } finally {
      Object.assign(process.env, savedEnv);
    }
  });

  it('falls back to anthropic as default', async () => {
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const result = await autoDetectProvider({ defaults: {} });
      assert.strictEqual(result.provider, 'anthropic');
      assert.strictEqual(result.source, 'default_fallback');
    } finally {
      Object.assign(process.env, savedEnv);
    }
  });
});

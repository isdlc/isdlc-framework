/**
 * Tests for M4 Content Redaction Pipeline (FR-011)
 *
 * REQ-0045 / FR-011 / AC-011-01 through AC-011-05
 * @module lib/embedding/redaction/index.test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { redact, extractSignatures, generateSummary } from './index.js';
import { redactToInterface } from './interface-tier.js';
import { redactToGuided } from './guided-tier.js';

// --- Test Fixtures ---

function makeChunk(overrides = {}) {
  return {
    id: 'chunk-001',
    content: `export class OrderService extends BaseService {
  constructor(db) {
    super(db);
    this.cache = new Map();
  }

  /**
   * Create a new order from cart items.
   * @param {string} userId
   * @param {CartItem[]} items
   * @returns {Promise<Order>}
   */
  async createOrder(userId, items) {
    const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);
    const order = { id: crypto.randomUUID(), userId, items, total, status: 'pending' };
    await this.db.insert('orders', order);
    this.cache.set(order.id, order);
    return order;
  }

  #validateItems(items) {
    return items.every(i => i.price > 0 && i.qty > 0);
  }

  static MAX_ITEMS = 100;
}`,
    filePath: 'src/services/order-service.js',
    startLine: 1,
    endLine: 26,
    type: 'class',
    language: 'javascript',
    tokenCount: 120,
    parentName: null,
    name: 'OrderService',
    signatures: [
      'export class OrderService extends BaseService',
      'async createOrder(userId, items)',
    ],
    ...overrides,
  };
}

function makeSimpleChunk(overrides = {}) {
  return {
    id: 'chunk-002',
    content: `export function add(a, b) {
  return a + b;
}`,
    filePath: 'src/math.js',
    startLine: 1,
    endLine: 3,
    type: 'function',
    language: 'javascript',
    tokenCount: 15,
    parentName: null,
    name: 'add',
    signatures: ['export function add(a, b)'],
    ...overrides,
  };
}

function makeNoSigChunk() {
  return {
    id: 'chunk-003',
    content: '// Just a comment block\n// with no code',
    filePath: 'src/notes.js',
    startLine: 1,
    endLine: 2,
    type: 'block',
    language: 'javascript',
    tokenCount: 10,
    parentName: null,
    name: null,
    signatures: [],
  };
}

// --- redact() Tests ---

describe('M4: Content Redaction Pipeline', () => {
  describe('redact() — interface tier (AC-011-01)', () => {
    it('strips method bodies and keeps signatures', async () => {
      const chunks = [makeChunk()];
      const result = await redact(chunks, 'interface');

      assert.equal(result.length, 1);
      // Should NOT contain implementation code
      assert.ok(!result[0].content.includes('reduce((sum'));
      assert.ok(!result[0].content.includes('await this.db.insert'));
      // Should contain signatures
      assert.ok(result[0].content.includes('OrderService'));
      assert.ok(result[0].content.includes('createOrder'));
    });

    it('preserves class names and return types', async () => {
      const chunks = [makeChunk()];
      const result = await redact(chunks, 'interface');

      assert.ok(result[0].content.includes('OrderService'));
      assert.ok(result[0].content.includes('BaseService'));
    });

    it('removes private members', async () => {
      const chunks = [makeChunk()];
      const result = await redact(chunks, 'interface');

      // Private method #validateItems should not appear
      assert.ok(!result[0].content.includes('#validateItems'));
      assert.ok(!result[0].content.includes('items.every'));
    });

    it('keeps public constant values from signatures', async () => {
      const chunk = makeChunk({
        signatures: [
          'export class OrderService extends BaseService',
          'async createOrder(userId, items)',
          'static MAX_ITEMS = 100',
        ],
      });
      const result = await redact([chunk], 'interface');

      assert.ok(result[0].content.includes('MAX_ITEMS'));
    });
  });

  describe('redact() — guided tier (AC-011-02)', () => {
    it('includes interface content plus summary', async () => {
      const chunks = [makeChunk()];
      const result = await redact(chunks, 'guided');

      assert.equal(result.length, 1);
      assert.equal(result[0].redactionTier, 'guided');
      // Should contain signatures
      assert.ok(result[0].content.includes('OrderService'));
    });

    it('generates behavioral summaries from code', async () => {
      const summaryFn = async (content) => 'Creates and stores new orders from cart items';
      const chunks = [makeChunk()];
      const result = await redact(chunks, 'guided', { summaryFn });

      assert.ok(result[0].content.includes('Summary:'));
      assert.ok(result[0].content.includes('Creates and stores new orders'));
    });

    it('falls back to interface when summary model unavailable', async () => {
      const summaryFn = async () => { throw new Error('Model unavailable'); };
      const chunks = [makeChunk()];
      const result = await redact(chunks, 'guided', { summaryFn });

      assert.equal(result[0].redactionTier, 'guided');
      // Should still have interface content
      assert.ok(result[0].content.includes('OrderService'));
    });
  });

  describe('redact() — full tier (AC-011-03)', () => {
    it('passes content through unchanged', async () => {
      const chunks = [makeChunk()];
      const original = chunks[0].content;
      const result = await redact(chunks, 'full');

      assert.equal(result.length, 1);
      assert.equal(result[0].content, original);
      assert.equal(result[0].redactionTier, 'full');
    });
  });

  describe('redact() — tier metadata (AC-011-04)', () => {
    it('records tier in chunk metadata', async () => {
      const chunks = [makeChunk()];

      const interfaceResult = await redact(chunks, 'interface');
      assert.equal(interfaceResult[0].redactionTier, 'interface');

      const guidedResult = await redact(chunks, 'guided');
      assert.equal(guidedResult[0].redactionTier, 'guided');

      const fullResult = await redact(chunks, 'full');
      assert.equal(fullResult[0].redactionTier, 'full');
    });
  });

  describe('redact() — before embedding guarantee (AC-011-05)', () => {
    it('returns chunks with stripped content for interface tier', async () => {
      const chunks = [makeChunk()];
      const result = await redact(chunks, 'interface');

      // Returned chunks should have content shorter than original
      assert.ok(result[0].content.length < chunks[0].content.length);
      // tokenCount should be recalculated
      assert.ok(result[0].tokenCount < chunks[0].tokenCount);
    });
  });

  describe('redact() — edge cases', () => {
    it('returns empty array for empty chunks input', async () => {
      const result = await redact([], 'interface');
      assert.deepStrictEqual(result, []);
    });

    it('returns empty array for null chunks input', async () => {
      const result = await redact(null, 'interface');
      assert.deepStrictEqual(result, []);
    });

    it('throws on invalid tier', async () => {
      await assert.rejects(
        () => redact([makeChunk()], 'secret'),
        { message: /Invalid redaction tier: "secret"/ }
      );
    });

    it('throws on null tier', async () => {
      await assert.rejects(
        () => redact([makeChunk()], null),
        { message: /Invalid redaction tier/ }
      );
    });

    it('handles chunks with no signatures gracefully', async () => {
      const result = await redact([makeNoSigChunk()], 'interface');
      assert.equal(result.length, 1);
      // Should produce minimal fallback content
      assert.ok(result[0].content.length > 0);
      assert.equal(result[0].redactionTier, 'interface');
    });
  });

  // --- extractSignatures() Tests ---

  describe('extractSignatures()', () => {
    it('extracts Java-style method signatures', () => {
      const code = `public class Foo {
  public String getName() {
    return this.name;
  }
  private int count;
}`;
      const sigs = extractSignatures(code, 'java');
      assert.ok(sigs.some(s => s.includes('getName')));
      assert.ok(sigs.some(s => s.includes('class Foo')));
    });

    it('extracts TypeScript-style signatures', () => {
      const code = `export interface Config {
  host: string;
  port: number;
}

export async function connect(config: Config): Promise<void> {
  await socket.connect(config.host, config.port);
}`;
      const sigs = extractSignatures(code, 'typescript');
      assert.ok(sigs.some(s => s.includes('interface Config')));
      assert.ok(sigs.some(s => s.includes('connect')));
    });

    it('returns empty array for empty content', () => {
      assert.deepStrictEqual(extractSignatures(''), []);
      assert.deepStrictEqual(extractSignatures(null), []);
    });

    it('handles content with no recognizable signatures', () => {
      const result = extractSignatures('// just a comment\n// nothing here');
      assert.deepStrictEqual(result, []);
    });
  });

  // --- generateSummary() Tests ---

  describe('generateSummary()', () => {
    it('produces a brief description from code', async () => {
      const code = `/**
 * Calculate total price including tax.
 */
function calculateTotal(items) {
  const subtotal = items.reduce((sum, i) => sum + i.price, 0);
  return subtotal * 1.1;
}`;
      const summary = await generateSummary(code);
      assert.ok(summary !== null);
      assert.ok(summary.length > 0);
      assert.ok(summary.includes('Calculate total price'));
    });

    it('respects maxSummaryTokens option', async () => {
      const longContent = '// A function that does many things\n'.repeat(100) + 'return result;';
      const summary = await generateSummary(longContent, { maxSummaryTokens: 10 });
      // 10 tokens ≈ 40 chars max
      assert.ok(summary === null || summary.length <= 50);
    });

    it('returns null for empty content', async () => {
      const result = await generateSummary('');
      assert.equal(result, null);
    });

    it('uses provided summaryFn when available', async () => {
      const summaryFn = async (content) => 'Custom AI summary';
      const result = await generateSummary('function foo() {}', { summaryFn });
      assert.equal(result, 'Custom AI summary');
    });
  });
});

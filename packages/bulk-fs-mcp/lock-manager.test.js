'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createLockManager } = require('./lock-manager.js');

// REQ-0048 / FR-007 — Lock Manager Unit Tests

describe('lock-manager', () => {
  let lockManager;

  beforeEach(() => {
    lockManager = createLockManager();
  });

  // --- Basic Operations: Positive ---

  // LM-01: acquire returns release function for unlocked path (AC-007-01)
  it('LM-01: acquire returns release function for unlocked path', async () => {
    const release = await lockManager.acquire('/tmp/file.txt');
    assert.equal(typeof release, 'function');
    assert.equal(lockManager.isLocked('/tmp/file.txt'), true);
    release();
  });

  // LM-02: isLocked returns false for path not in map (AC-007-01)
  it('LM-02: isLocked returns false for unknown path', () => {
    assert.equal(lockManager.isLocked('/tmp/unknown.txt'), false);
  });

  // LM-03: Lock lifecycle — true after acquire, false after release (AC-007-01)
  it('LM-03: lock lifecycle — true after acquire, false after release', async () => {
    const release = await lockManager.acquire('/tmp/file.txt');
    assert.equal(lockManager.isLocked('/tmp/file.txt'), true);
    release();
    assert.equal(lockManager.isLocked('/tmp/file.txt'), false);
  });

  // LM-04: Second acquire on same path waits until first releases (AC-007-01)
  it('LM-04: second acquire waits until first releases', async () => {
    const order = [];
    const release1 = await lockManager.acquire('/tmp/file.txt');
    order.push('first-acquired');

    const secondPromise = lockManager.acquire('/tmp/file.txt').then((release2) => {
      order.push('second-acquired');
      release2();
    });

    // Second has not acquired yet
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(order.length, 1);

    release1();
    order.push('first-released');

    await secondPromise;
    assert.deepEqual(order, ['first-acquired', 'first-released', 'second-acquired']);
  });

  // LM-05: Concurrent acquires on different paths proceed in parallel (AC-007-04)
  it('LM-05: different paths proceed in parallel', async () => {
    const [releaseA, releaseB] = await Promise.all([
      lockManager.acquire('/tmp/a.txt'),
      lockManager.acquire('/tmp/b.txt')
    ]);
    assert.equal(lockManager.isLocked('/tmp/a.txt'), true);
    assert.equal(lockManager.isLocked('/tmp/b.txt'), true);
    releaseA();
    releaseB();
  });

  // LM-06: Release function can be called multiple times without error (AC-007-01)
  it('LM-06: release is idempotent', async () => {
    const release = await lockManager.acquire('/tmp/file.txt');
    release();
    assert.doesNotThrow(() => release());
    assert.doesNotThrow(() => release());
  });

  // LM-07: Path normalization — relative and absolute resolve to same lock (AC-007-02)
  it('LM-07: path normalization resolves to same lock', async () => {
    const order = [];
    const release1 = await lockManager.acquire('/tmp/../tmp/file.txt');
    order.push('first');

    const secondPromise = lockManager.acquire('/tmp/file.txt').then((release2) => {
      order.push('second');
      release2();
    });

    await new Promise((r) => setTimeout(r, 10));
    assert.equal(order.length, 1); // second is waiting

    release1();
    await secondPromise;
    assert.deepEqual(order, ['first', 'second']);
  });

  // LM-08: FIFO ordering — waiters acquire in queue order (AC-007-01)
  it('LM-08: FIFO ordering for waiters', async () => {
    const order = [];
    const release1 = await lockManager.acquire('/tmp/file.txt');

    const p2 = lockManager.acquire('/tmp/file.txt').then((r) => {
      order.push('second');
      r();
    });
    const p3 = lockManager.acquire('/tmp/file.txt').then((r) => {
      order.push('third');
      r();
    });
    const p4 = lockManager.acquire('/tmp/file.txt').then((r) => {
      order.push('fourth');
      r();
    });

    await new Promise((r) => setTimeout(r, 10));
    release1();
    await Promise.all([p2, p3, p4]);

    assert.deepEqual(order, ['second', 'third', 'fourth']);
  });

  // --- Negative / Timeout ---

  // LM-09: acquire throws LockTimeoutError after timeout expires (AC-007-03)
  it('LM-09: timeout throws LockTimeoutError', async () => {
    const release = await lockManager.acquire('/tmp/file.txt');
    await assert.rejects(
      lockManager.acquire('/tmp/file.txt', 50),
      (err) => {
        assert.ok(err.message.includes('Lock timeout'));
        assert.equal(err.code, 'LOCK_TIMEOUT');
        return true;
      }
    );
    release();
  });

  // LM-10: Custom timeout overrides default (AC-007-03)
  it('LM-10: custom timeout overrides default', async () => {
    const release = await lockManager.acquire('/tmp/file.txt');
    const start = Date.now();
    await assert.rejects(
      lockManager.acquire('/tmp/file.txt', 100),
      (err) => err.code === 'LOCK_TIMEOUT'
    );
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 80, `Expected >= 80ms but got ${elapsed}ms`);
    assert.ok(elapsed < 500, `Expected < 500ms but got ${elapsed}ms`);
    release();
  });

  // LM-11: Lock map is cleaned up after all waiters are done (AC-007-01)
  it('LM-11: lock map cleaned up after all waiters done', async () => {
    const release1 = await lockManager.acquire('/tmp/file.txt');
    const p2 = lockManager.acquire('/tmp/file.txt').then((r) => r());
    const p3 = lockManager.acquire('/tmp/file.txt').then((r) => r());

    release1();
    await Promise.all([p2, p3]);

    // After all are done, path should not be locked
    assert.equal(lockManager.isLocked('/tmp/file.txt'), false);
  });

  // --- Stress / Concurrency ---

  // LM-12: 10 concurrent acquires on same path serialize correctly (AC-007-01, AC-007-04)
  it('LM-12: 10 concurrent acquires serialize correctly', async () => {
    const order = [];
    const release = await lockManager.acquire('/tmp/file.txt');

    const promises = [];
    for (let i = 0; i < 9; i++) {
      promises.push(
        lockManager.acquire('/tmp/file.txt').then((r) => {
          order.push(i);
          r();
        })
      );
    }

    await new Promise((r) => setTimeout(r, 10));
    release();
    await Promise.all(promises);

    assert.equal(order.length, 9);
    // Verify sequential ordering (FIFO)
    for (let i = 0; i < order.length; i++) {
      assert.equal(order[i], i);
    }
  });

  // LM-13: Mixed concurrent acquires on 5 different paths (AC-007-04)
  it('LM-13: 5 different paths concurrent — each serializes independently', async () => {
    const pathResults = {};
    const promises = [];

    for (let p = 0; p < 5; p++) {
      const filePath = `/tmp/file${p}.txt`;
      pathResults[filePath] = [];

      for (let i = 0; i < 2; i++) {
        promises.push(
          lockManager.acquire(filePath).then((release) => {
            pathResults[filePath].push(i);
            release();
          })
        );
      }
    }

    await Promise.all(promises);

    // Each path should have 2 entries
    for (let p = 0; p < 5; p++) {
      const filePath = `/tmp/file${p}.txt`;
      assert.equal(pathResults[filePath].length, 2);
    }
  });

  // LM-14: Timeout during contention does not corrupt lock state (AC-007-03)
  it('LM-14: timeout does not corrupt lock state for other waiters', async () => {
    const order = [];
    const release1 = await lockManager.acquire('/tmp/file.txt');

    // Second waiter — will time out
    const p2 = lockManager.acquire('/tmp/file.txt', 30).catch((err) => {
      order.push('timeout');
    });

    // Third waiter — should succeed after first releases
    const p3 = lockManager.acquire('/tmp/file.txt').then((r) => {
      order.push('third');
      r();
    });

    await p2; // Wait for timeout

    release1();
    await p3;

    assert.ok(order.includes('timeout'));
    assert.ok(order.includes('third'));
  });
});

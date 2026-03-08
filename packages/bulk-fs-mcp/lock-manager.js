'use strict';

// REQ-0048 / FR-007 — Per-Path Mutex with Timeout
// Provides concurrency control for file write operations.

const path = require('node:path');

const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Create a new lock manager instance.
 * Each instance maintains its own lock map for testability.
 *
 * @returns {{ acquire: Function, isLocked: Function }}
 */
function createLockManager() {
  // Map<resolvedPath, { queue: Array<{ resolve, reject, timer? }> }>
  const locks = new Map();

  /**
   * Acquire a per-path lock. Returns a release function.
   * If the path is already locked, waits in FIFO order until the lock is available.
   *
   * @param {string} absPath - File path to lock
   * @param {number} [timeoutMs=30000] - Timeout in milliseconds
   * @returns {Promise<() => void>} Release function
   */
  function acquire(absPath, timeoutMs) {
    const resolvedPath = path.resolve(absPath);
    const timeout = timeoutMs !== undefined ? timeoutMs : DEFAULT_TIMEOUT_MS;

    if (!locks.has(resolvedPath)) {
      // No lock exists — create entry and grant immediately
      const entry = { queue: [] };
      locks.set(resolvedPath, entry);

      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        processQueue(resolvedPath);
      };

      return Promise.resolve(release);
    }

    // Lock exists — queue this request
    return new Promise((resolve, reject) => {
      const entry = locks.get(resolvedPath);
      const waiter = { resolve, reject };

      if (timeout > 0) {
        waiter.timer = setTimeout(() => {
          // Remove this waiter from the queue
          const idx = entry.queue.indexOf(waiter);
          if (idx !== -1) {
            entry.queue.splice(idx, 1);
          }
          const err = new Error(`Lock timeout after ${timeout}ms for path: ${resolvedPath}`);
          err.code = 'LOCK_TIMEOUT';
          reject(err);
        }, timeout);
      }

      entry.queue.push(waiter);
    });
  }

  /**
   * Process the next waiter in the queue after a release.
   * @param {string} resolvedPath
   */
  function processQueue(resolvedPath) {
    const entry = locks.get(resolvedPath);
    if (!entry) return;

    if (entry.queue.length === 0) {
      // No waiters — clean up the lock entry
      locks.delete(resolvedPath);
      return;
    }

    // Grant lock to next waiter (FIFO)
    const waiter = entry.queue.shift();

    // Clear timeout if set
    if (waiter.timer) {
      clearTimeout(waiter.timer);
    }

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      processQueue(resolvedPath);
    };

    waiter.resolve(release);
  }

  /**
   * Check if a path currently has an active lock.
   * @param {string} absPath
   * @returns {boolean}
   */
  function isLocked(absPath) {
    const resolvedPath = path.resolve(absPath);
    return locks.has(resolvedPath);
  }

  return { acquire, isLocked };
}

module.exports = { createLockManager };

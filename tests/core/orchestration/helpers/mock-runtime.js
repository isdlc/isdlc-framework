/**
 * Shared Mock ProviderRuntime for orchestration tests
 *
 * Creates a controllable mock implementing all 5 ProviderRuntime interface
 * methods with call tracking and configurable responses.
 *
 * Requirements: REQ-0129 through REQ-0133 (test infrastructure)
 * @module tests/core/orchestration/helpers/mock-runtime
 */

/**
 * Create a mock ProviderRuntime with controllable behavior.
 *
 * @param {Object} [overrides] - Method overrides
 * @param {Function} [overrides.executeTask] - Custom executeTask implementation
 * @param {Function} [overrides.executeParallel] - Custom executeParallel implementation
 * @param {Function} [overrides.presentInteractive] - Custom presentInteractive implementation
 * @param {Function} [overrides.readUserResponse] - Custom readUserResponse implementation
 * @param {Function} [overrides.validateRuntime] - Custom validateRuntime implementation
 * @returns {Object} Mock runtime with call tracking
 */
export function createMockRuntime(overrides = {}) {
  const calls = {
    executeTask: [],
    executeParallel: [],
    presentInteractive: [],
    readUserResponse: [],
    validateRuntime: []
  };

  const runtime = {
    calls,

    executeTask: overrides.executeTask || async function (phase, agent, context) {
      calls.executeTask.push({ phase, agent, context });
      return { status: 'completed', output: `${phase} done`, duration_ms: 10 };
    },

    executeParallel: overrides.executeParallel || async function (tasks) {
      calls.executeParallel.push({ tasks });
      return tasks.map((t, i) => ({
        status: 'completed',
        output: `task-${i} done`,
        duration_ms: 10,
        memberId: t.id || t.memberId || `member-${i}`
      }));
    },

    presentInteractive: overrides.presentInteractive || async function (prompt) {
      calls.presentInteractive.push({ prompt });
      return 'user-response';
    },

    readUserResponse: overrides.readUserResponse || async function (options) {
      calls.readUserResponse.push({ options });
      return 'user-input';
    },

    validateRuntime: overrides.validateRuntime || async function () {
      calls.validateRuntime.push({});
      return { available: true };
    },

    /**
     * Reset all call records.
     */
    reset() {
      for (const key of Object.keys(calls)) {
        calls[key] = [];
      }
    }
  };

  // Wrap overridden methods to still track calls
  if (overrides.executeTask) {
    const original = overrides.executeTask;
    runtime.executeTask = async function (...args) {
      calls.executeTask.push({ phase: args[0], agent: args[1], context: args[2] });
      return original(...args);
    };
  }

  if (overrides.executeParallel) {
    const original = overrides.executeParallel;
    runtime.executeParallel = async function (...args) {
      calls.executeParallel.push({ tasks: args[0] });
      return original(...args);
    };
  }

  if (overrides.presentInteractive) {
    const original = overrides.presentInteractive;
    runtime.presentInteractive = async function (...args) {
      calls.presentInteractive.push({ prompt: args[0] });
      return original(...args);
    };
  }

  if (overrides.readUserResponse) {
    const original = overrides.readUserResponse;
    runtime.readUserResponse = async function (...args) {
      calls.readUserResponse.push({ options: args[0] });
      return original(...args);
    };
  }

  if (overrides.validateRuntime) {
    const original = overrides.validateRuntime;
    runtime.validateRuntime = async function (...args) {
      calls.validateRuntime.push({});
      return original(...args);
    };
  }

  return runtime;
}

/**
 * Create a mock runtime where executeTask fails N times then succeeds.
 *
 * @param {number} failCount - Number of times to fail before succeeding
 * @param {string} [errorMsg='task failed'] - Error message for failures
 * @returns {Object} Mock runtime
 */
export function createFailThenSucceedRuntime(failCount, errorMsg = 'task failed') {
  let attempt = 0;
  return createMockRuntime({
    executeTask: async (phase, agent, context) => {
      attempt++;
      if (attempt <= failCount) {
        return { status: 'failed', output: null, duration_ms: 5, error: errorMsg };
      }
      return { status: 'completed', output: `${phase} done`, duration_ms: 10 };
    }
  });
}

/**
 * Create a mock runtime with a sequence of interactive responses.
 *
 * @param {string[]} responses - Ordered list of responses to return
 * @returns {Object} Mock runtime
 */
export function createInteractiveRuntime(responses) {
  let index = 0;
  return createMockRuntime({
    presentInteractive: async (prompt) => {
      if (index < responses.length) {
        return responses[index++];
      }
      return 'done';
    }
  });
}

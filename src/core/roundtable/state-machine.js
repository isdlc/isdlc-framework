/**
 * State Machine Runtime — drives roundtable state progression
 *
 * Loads a composed definition (from definition-loader), tracks current state
 * and active sub-task, evaluates transitions against rolling state, and emits
 * transition events for observability.
 *
 * Immutable graph, mutable cursor: the definition graph is frozen at
 * initialize(). Only currentState, activeSubTask, and transitionHistory
 * are mutable.
 *
 * Traces: FR-002, AC-002-01, AC-002-02
 * @module src/core/roundtable/state-machine
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Deep-freeze an object and all nested objects/arrays. Prevents mutation of
 * the definition graph after initialization.
 *
 * @param {object} obj
 * @returns {object} The same object, now frozen
 */
function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const value of Object.values(obj)) {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj;
}

/**
 * Validate that a definition has the minimum required structure for the
 * state machine to operate.
 *
 * @param {object} definition - Composed definition from definition-loader
 * @param {string} entryState - State name to start in
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateDefinition(definition, entryState) {
  const errors = [];
  if (!definition || typeof definition !== 'object') {
    errors.push('Definition must be a non-null object');
    return { valid: false, errors };
  }
  if (!definition.states || typeof definition.states !== 'object') {
    errors.push('Definition must contain a states object');
    return { valid: false, errors };
  }
  if (!entryState || typeof entryState !== 'string') {
    errors.push('entryState must be a non-empty string');
    return { valid: false, errors };
  }
  if (!definition.states[entryState]) {
    errors.push(`Entry state "${entryState}" not found in definition.states`);
  }
  // Validate each state has a transitions array (except terminal states)
  for (const [name, state] of Object.entries(definition.states)) {
    if (state.terminal) continue;
    if (!Array.isArray(state.transitions)) {
      errors.push(`State "${name}" is missing transitions array (non-terminal states require transitions)`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Find the first sub-task in a state whose entry trigger is satisfied.
 * Considers dependency ordering (depends_on) and completion status.
 *
 * @param {object} stateDef - State definition with optional sub_tasks
 * @param {object} rollingState - Current rolling state
 * @returns {{ subTask: object|null, subTaskId: string|null }}
 */
function findActiveSubTask(stateDef, rollingState) {
  if (!stateDef || !stateDef.sub_tasks) return { subTask: null, subTaskId: null };

  const tasks = stateDef.sub_tasks.tasks || stateDef.sub_tasks;
  if (!Array.isArray(tasks) || tasks.length === 0) return { subTask: null, subTaskId: null };

  const completion = rollingState?.sub_task_completion || {};

  // Find the first non-complete sub-task whose dependencies are met and
  // whose trigger is satisfied
  for (const task of tasks) {
    if (!task || !task.id) continue;

    // Skip completed sub-tasks
    if (completion[task.id]) continue;

    // Check depends_on: all dependencies must be complete
    if (Array.isArray(task.depends_on) && task.depends_on.length > 0) {
      const allDepsComplete = task.depends_on.every(depId => completion[depId]);
      if (!allDepsComplete) continue;
    }

    // Check entry trigger conditions
    if (isTriggerSatisfied(task, rollingState)) {
      return { subTask: task, subTaskId: task.id };
    }
  }

  // No active sub-task found (all complete or none triggered)
  return { subTask: null, subTaskId: null };
}

/**
 * Check whether a sub-task's entry trigger is satisfied by rolling state.
 * Triggers can be string conditions or arrays of conditions.
 *
 * @param {object} task - Sub-task definition with triggers/entry_trigger
 * @param {object} rollingState - Current rolling state
 * @returns {boolean}
 */
function isTriggerSatisfied(task, rollingState) {
  // If no trigger specified, it's always ready (first sub-task often has no trigger)
  const triggers = task.triggers || (task.entry_trigger ? [task.entry_trigger] : null);
  if (!triggers || triggers.length === 0) return true;

  const completion = rollingState?.sub_task_completion || {};

  for (const trigger of triggers) {
    if (typeof trigger !== 'string') continue;
    const t = trigger.toLowerCase().trim();

    // Special trigger types
    if (t === 'session_start' || t === 'first_exchange') return true;
    if (t === 'after_first_user_reply') {
      // Satisfied if scope framing is underway or complete
      if (completion.SCOPE_FRAMING || completion.scope_framing) return true;
      if (rollingState?.scope_framed) return true;
      continue;
    }

    // Check against sub_task_completion markers
    if (completion[trigger] || completion[t]) return true;

    // Check against top-level rolling state boolean flags
    if (rollingState && rollingState[trigger] === true) return true;
    if (rollingState && rollingState[t] === true) return true;
  }

  return false;
}

/**
 * Evaluate a transition condition string against rolling state.
 * Supports simple conditions and basic AND/OR combinations.
 *
 * @param {string} condition - Condition expression
 * @param {object} rollingState - Current rolling state
 * @returns {boolean}
 */
function evaluateCondition(condition, rollingState) {
  if (!condition || typeof condition !== 'string') return false;
  if (!rollingState) return false;

  const c = condition.trim();

  // Handle AND conditions
  if (c.includes(' AND ')) {
    const parts = c.split(' AND ').map(p => p.trim());
    return parts.every(part => evaluateCondition(part, rollingState));
  }

  // Handle OR conditions
  if (c.includes(' OR ')) {
    const parts = c.split(' OR ').map(p => p.trim());
    return parts.some(part => evaluateCondition(part, rollingState));
  }

  // Handle tier-based conditions
  const tierMatch = c.match(/^tier\s*(==|!=|IN)\s*(.+)$/i);
  if (tierMatch) {
    const op = tierMatch[1];
    const tierValue = (rollingState.tier || rollingState.current_tier || '').toLowerCase();
    if (op === '==') return tierValue === tierMatch[2].trim().toLowerCase();
    if (op === '!=') return tierValue !== tierMatch[2].trim().toLowerCase();
    if (op.toUpperCase() === 'IN') {
      const allowed = tierMatch[2].replace(/[\[\]]/g, '').split(',').map(t => t.trim().toLowerCase());
      return allowed.includes(tierValue);
    }
    return false;
  }

  // Handle "condition != value" patterns
  if (c.includes('!=')) {
    const [key, val] = c.split('!=').map(s => s.trim());
    const stateVal = rollingState[key];
    return stateVal !== undefined && String(stateVal).toLowerCase() !== val.toLowerCase();
  }

  // Handle simple key = value conditions
  if (c.includes('==')) {
    const [key, val] = c.split('==').map(s => s.trim());
    return String(rollingState[key] || '').toLowerCase() === val.toLowerCase();
  }

  // Simple boolean conditions
  if (c === 'auto') return true;
  if (c === 'accept') return rollingState.accept === true || rollingState.user_response === 'accept';
  if (c === 'amend') return rollingState.amend === true || rollingState.user_response === 'amend';
  if (c === 'resolution_reached') return rollingState.resolution_reached === true;
  if (c === 'batch_write_complete') return rollingState.batch_write_complete === true;
  if (c === 'early_exit_signal') return rollingState.early_exit_signal === true;
  if (c === 'trivial_tier') return (rollingState.tier || rollingState.current_tier || '') === 'trivial';

  // Generic boolean flag lookup
  if (rollingState[c] === true) return true;

  // Check sub_task_completion for marker-style conditions
  if (rollingState.sub_task_completion && rollingState.sub_task_completion[c]) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize a state machine instance from a composed definition.
 *
 * The definition graph is deep-frozen. Only the mutable cursor
 * (currentState, activeSubTask, transitionHistory) changes over time.
 *
 * @param {object} definition - Composed definition from definition-loader.loadDefinition()
 * @param {string} entryState - State to start in (e.g., 'CONVERSATION')
 * @returns {object} State machine instance, or null on validation failure
 *
 * Traces: FR-002, AC-002-01
 */
export function initialize(definition, entryState) {
  const { valid, errors } = validateDefinition(definition, entryState);
  if (!valid) {
    process.stderr.write(`[state-machine] Initialization failed: ${errors.join('; ')}\n`);
    return null;
  }

  // Deep-freeze the definition graph (immutable graph principle)
  const frozenDef = deepFreeze(JSON.parse(JSON.stringify(definition)));

  // Resolve initial sub-task for the entry state
  // Use unfrozen definition for initial sub-task lookup since we need
  // rolling state context (empty at init, so first triggered sub-task wins)
  const entryStateDef = definition.states[entryState];
  const initialRollingState = { sub_task_completion: {} };
  const { subTask, subTaskId } = findActiveSubTask(entryStateDef, initialRollingState);

  const transitionHistory = [];

  // Build the state machine instance object
  const instance = {
    /** @internal Frozen definition graph */
    _definition: frozenDef,

    /** @internal Current state name */
    _currentState: entryState,

    /** @internal Active sub-task ID (or null) */
    _activeSubTask: subTaskId,

    /** @internal Transition history array */
    _transitionHistory: transitionHistory,

    /** Return the current state's card template reference */
    currentCard() {
      const stateDef = frozenDef.states[this._currentState];
      if (!stateDef) return null;
      return stateDef.template || stateDef.template_ref || null;
    },

    /** Return the active sub-task definition object or null */
    currentSubTask() {
      if (!this._activeSubTask) return null;
      const stateDef = frozenDef.states[this._currentState];
      if (!stateDef || !stateDef.sub_tasks) return null;
      const tasks = stateDef.sub_tasks.tasks || stateDef.sub_tasks;
      if (!Array.isArray(tasks)) return null;
      return tasks.find(t => t && t.id === this._activeSubTask) || null;
    },

    /** Return the current state name */
    getCurrentState() {
      return this._currentState;
    },

    /** Return the active sub-task ID or null */
    getActiveSubTask() {
      return this._activeSubTask;
    },

    /** Return the full state definition for a named state */
    getStateDefinition(stateName) {
      return frozenDef.states[stateName] || null;
    },

    /** Return array of past transitions for observability (NFR-004) */
    getTransitionHistory() {
      return [...this._transitionHistory];
    },

    /**
     * Evaluate transitions against rolling state.
     *
     * Checks current state's exit markers and transition conditions.
     * If a transition fires, updates the cursor and appends to history.
     * Also evaluates sub-task progression within the current state.
     *
     * @param {object} rollingState - Current rolling state from rolling-state.js
     * @returns {object} Transition result
     *
     * Traces: FR-002, AC-002-02
     */
    evaluateTransitions(rollingState) {
      const currentStateName = this._currentState;
      const stateDef = frozenDef.states[currentStateName];

      if (!stateDef) {
        return {
          transitioned: false,
          newState: null,
          newSubTask: null,
          previousState: currentStateName,
          previousSubTask: this._activeSubTask,
        };
      }

      // Terminal state -- no transitions possible
      if (stateDef.terminal) {
        return {
          transitioned: false,
          newState: null,
          newSubTask: null,
          previousState: currentStateName,
          previousSubTask: this._activeSubTask,
        };
      }

      // --- Sub-task evaluation within current state ---
      // Check if active sub-task completed and a new one should activate
      let subTaskChanged = false;
      let previousSubTask = this._activeSubTask;
      let newSubTaskId = this._activeSubTask;

      // Use the unfrozen definition for sub-task evaluation since findActiveSubTask
      // needs to traverse the original structure (frozen arrays work fine for reads)
      const currentStateUnfrozen = definition.states[currentStateName];

      if (currentStateUnfrozen && currentStateUnfrozen.sub_tasks) {
        const { subTaskId: nextSubTaskId } = findActiveSubTask(currentStateUnfrozen, rollingState);
        if (nextSubTaskId !== this._activeSubTask) {
          subTaskChanged = true;
          newSubTaskId = nextSubTaskId;
          this._activeSubTask = nextSubTaskId;
        }
      }

      // --- State transition evaluation ---
      const transitions = stateDef.transitions;
      if (!Array.isArray(transitions) || transitions.length === 0) {
        return {
          transitioned: false,
          newState: null,
          newSubTask: subTaskChanged ? newSubTaskId : null,
          previousState: currentStateName,
          previousSubTask: previousSubTask,
          subTaskChanged,
        };
      }

      // Evaluate transitions in declared order (first match wins)
      for (const transition of transitions) {
        if (!evaluateCondition(transition.condition, rollingState)) continue;

        // Determine next state based on accept/amend signals
        let nextState = null;

        if (transition.next_on_accept && (rollingState.accept === true || rollingState.user_response === 'accept')) {
          nextState = transition.next_on_accept;
        } else if (transition.next_on_amend && (rollingState.amend === true || rollingState.user_response === 'amend')) {
          nextState = transition.next_on_amend;
        } else {
          nextState = transition.target || transition.next || null;
        }

        if (!nextState) continue;

        // Verify target state exists
        if (!frozenDef.states[nextState]) continue;

        // --- Perform the transition ---
        const previousState = this._currentState;
        this._currentState = nextState;

        // Resolve new sub-task for the target state
        const targetStateDef = definition.states[nextState];
        const { subTaskId: targetSubTaskId } = findActiveSubTask(targetStateDef, rollingState);
        const prevSubTask = this._activeSubTask;
        this._activeSubTask = targetSubTaskId;

        // Build transition event (NFR-004 observability)
        const transitionEvent = {
          from: previousState,
          to: nextState,
          trigger: transition.condition,
          timestamp: new Date().toISOString(),
          subTaskChange: prevSubTask !== targetSubTaskId
            ? { from: prevSubTask, to: targetSubTaskId }
            : null,
        };
        this._transitionHistory.push(transitionEvent);

        // Build result
        const result = {
          transitioned: true,
          newState: nextState,
          newSubTask: targetSubTaskId,
          previousState,
          previousSubTask: prevSubTask,
        };

        // AMENDING state special handling: signal to clear accepted domains
        if (nextState === 'AMENDING') {
          result.clearAcceptedDomains = true;
        }

        // External delegation support (T032 overlap)
        if (transition.external_delegation) {
          const ed = transition.external_delegation;
          result.externalDelegation = {
            agent: ed.agent,
            inputMapping: ed.input_mapping || ed.inputMapping || {},
            timeout: ed.timeout_ms || ed.timeout || 0,
            failOpen: ed.fail_open !== undefined
              ? (typeof ed.fail_open === 'object' ? ed.fail_open.enabled !== false : ed.fail_open !== false)
              : true,
          };
        }

        return result;
      }

      // No transition matched
      return {
        transitioned: false,
        newState: null,
        newSubTask: subTaskChanged ? newSubTaskId : null,
        previousState: currentStateName,
        previousSubTask: previousSubTask,
        subTaskChanged,
      };
    },
  };

  return instance;
}

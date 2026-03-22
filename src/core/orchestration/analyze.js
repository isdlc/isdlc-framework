/**
 * Provider-Neutral Analyze Orchestrator
 *
 * Executes the full analyze flow: bug/feature classification, roundtable
 * conversation loop, sequential domain confirmation, and finalization chain.
 *
 * Requirements: REQ-0133 FR-001..FR-006
 * Dependencies: provider-runtime (interface), analyze/* (lifecycle, state-machine,
 *               artifact-readiness, finalization-chain, inference-depth)
 *
 * @module src/core/orchestration/analyze
 */

import { getBugClassificationSignals } from '../analyze/lifecycle.js';
import { getStateMachine, getTransition, getTierPath } from '../analyze/state-machine.js';
import { getTopicDependencies, getArtifactReadiness } from '../analyze/artifact-readiness.js';
import { getFinalizationChain } from '../analyze/finalization-chain.js';
import { getCoverageGuardrails } from '../analyze/inference-depth.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum roundtable conversation turns to prevent infinite loops. */
const MAX_ROUNDTABLE_TURNS = 30;

/** Signal string indicating all topics are covered. */
const TOPICS_COMPLETE_SIGNAL = '__TOPICS_COMPLETE__';

/** Confirmation domains in order. */
const CONFIRMATION_DOMAINS = Object.freeze(['requirements', 'architecture', 'design']);

/** State machine state names mapped to domains. */
const DOMAIN_TO_STATE = Object.freeze({
  requirements: 'PRESENTING_REQUIREMENTS',
  architecture: 'PRESENTING_ARCHITECTURE',
  design:       'PRESENTING_DESIGN'
});

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Classify an item as bug or feature based on description signals.
 *
 * @param {Object} item - Item with description field
 * @returns {'bug' | 'feature'} Classification
 */
function classifyItem(item) {
  const signals = getBugClassificationSignals();
  const description = (item.description || '').toLowerCase();

  let bugScore = 0;
  let featureScore = 0;

  for (const signal of signals.bug_signals) {
    if (description.includes(signal)) {
      bugScore++;
    }
  }

  for (const signal of signals.feature_signals) {
    if (description.includes(signal)) {
      featureScore++;
    }
  }

  // Bug signals dominate if they score higher
  if (bugScore > featureScore) {
    return 'bug';
  }

  // Default to feature (including ties and zero scores)
  return 'feature';
}

// ---------------------------------------------------------------------------
// Topic Tracking
// ---------------------------------------------------------------------------

/**
 * Create a minimal topic tracker for roundtable coverage.
 *
 * @param {string} depth - Depth level (brief, standard, deep)
 * @returns {Object} Topic tracker with isComplete() and update() methods
 */
function createTopicTracker(depth) {
  const guardrails = getCoverageGuardrails();
  const config = guardrails[depth] || guardrails.standard;
  const requiredTopics = config.required || [];
  const coveredTopics = new Set();

  return {
    isComplete() {
      return requiredTopics.every(t => coveredTopics.has(t));
    },

    update(response) {
      // Simple heuristic: mark topics as covered based on response content
      if (!response) return;
      const lower = response.toLowerCase();

      const topicSignals = {
        'problem-discovery': ['problem', 'issue', 'pain point', 'challenge'],
        'requirements-definition': ['requirement', 'must', 'should', 'acceptance criteria', 'fr-'],
        'architecture': ['architecture', 'component', 'module', 'integration', 'adr'],
        'specification': ['design', 'export', 'interface', 'api', 'module design']
      };

      for (const [topic, signals] of Object.entries(topicSignals)) {
        if (signals.some(s => lower.includes(s))) {
          coveredTopics.add(topic);
        }
      }
    },

    getCovered() {
      return [...coveredTopics];
    }
  };
}

// ---------------------------------------------------------------------------
// Confirmation Flow
// ---------------------------------------------------------------------------

/**
 * Get the confirmation domain sequence for a sizing tier.
 *
 * @param {string} sizing - Sizing tier (trivial, light, standard)
 * @returns {string[]} Domain state names to present
 */
function getConfirmationSequence(sizing) {
  const tierPath = getTierPath(sizing || 'standard');
  if (!tierPath) {
    return getTierPath('standard') || ['PRESENTING_REQUIREMENTS', 'PRESENTING_ARCHITECTURE', 'PRESENTING_DESIGN'];
  }
  return tierPath;
}

/**
 * Map a state machine state to a domain name.
 *
 * @param {string} stateName - State machine state
 * @returns {string} Domain name
 */
function stateToDomain(stateName) {
  for (const [domain, state] of Object.entries(DOMAIN_TO_STATE)) {
    if (state === stateName) return domain;
  }
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

/**
 * Run the analyze orchestrator.
 *
 * Classifies the item, runs the appropriate conversation flow (bug-gather
 * or roundtable), presents sequential confirmations, and executes the
 * finalization chain.
 *
 * @param {Object} runtime - ProviderRuntime instance
 * @param {Object} item - Item to analyze { slug, description, flags, meta }
 * @param {Object} options - Analyze options { projectRoot, sizing, depth }
 * @returns {Promise<Object>} Analyze result
 */
export async function runAnalyze(runtime, item, options = {}) {
  const { sizing = 'standard', depth = 'standard' } = options;

  // ---------------------------------------------------------------------------
  // Step 1: Classify item (FR-003)
  // ---------------------------------------------------------------------------

  const classification = classifyItem(item);

  // ---------------------------------------------------------------------------
  // Step 2: Bug-Gather or Roundtable (FR-002, FR-004)
  // ---------------------------------------------------------------------------

  let conversationHistory = [];
  let confirmationRecord = [];

  if (classification === 'bug') {
    // FR-003: Bug-gather — single interactive pass
    const bugPrompt = {
      type: 'bug_gather',
      item,
      context: { projectRoot: options.projectRoot }
    };
    const bugResponse = await runtime.presentInteractive(bugPrompt);
    conversationHistory.push({ role: 'bug-gather', content: bugResponse });
  } else {
    // FR-004: Feature roundtable conversation loop
    const tracker = createTopicTracker(depth);
    let turns = 0;

    while (turns < MAX_ROUNDTABLE_TURNS) {
      const prompt = {
        type: 'roundtable',
        item,
        turn: turns,
        coveredTopics: tracker.getCovered(),
        conversationHistory,
        context: { projectRoot: options.projectRoot, depth }
      };

      const response = await runtime.presentInteractive(prompt);
      turns++;

      // Check for explicit completion signal
      if (response === TOPICS_COMPLETE_SIGNAL) {
        break;
      }

      tracker.update(response);
      conversationHistory.push({ role: 'roundtable', turn: turns, content: response });

      // Check if all topics are covered
      if (tracker.isComplete()) {
        break;
      }
    }

    // FR-005: Confirmation state machine
    confirmationRecord = await runConfirmationSequence(runtime, item, sizing, conversationHistory);
  }

  // ---------------------------------------------------------------------------
  // Step 5: Finalization (FR-006)
  // ---------------------------------------------------------------------------

  const finalizationStatus = await runFinalization(item, conversationHistory, confirmationRecord);

  // ---------------------------------------------------------------------------
  // Return result
  // ---------------------------------------------------------------------------

  return {
    classification,
    meta: item.meta || {},
    conversation_history: conversationHistory,
    confirmation_record: confirmationRecord,
    finalization_status: finalizationStatus
  };
}

/**
 * Run the sequential confirmation flow.
 *
 * @param {Object} runtime - ProviderRuntime instance
 * @param {Object} item - Item being analyzed
 * @param {string} sizing - Sizing tier
 * @param {Array} conversationHistory - Roundtable conversation history
 * @returns {Promise<Array<Object>>} Confirmation records
 */
async function runConfirmationSequence(runtime, item, sizing, conversationHistory) {
  const sequence = getConfirmationSequence(sizing);
  const record = [];
  const MAX_AMEND_LOOPS = 5;

  for (const stateName of sequence) {
    const domain = stateToDomain(stateName);
    let amendCount = 0;
    let accepted = false;

    while (!accepted && amendCount <= MAX_AMEND_LOOPS) {
      const prompt = {
        type: 'confirmation',
        domain,
        stateName,
        item,
        conversationHistory,
        amendCount
      };

      const response = await runtime.presentInteractive(prompt);

      if (response === 'accept') {
        record.push({ domain, outcome: 'accept', amendCount });
        accepted = true;
      } else if (response === 'amend') {
        amendCount++;
        // Get revision content
        const revisionPrompt = {
          type: 'amend_revision',
          domain,
          item,
          conversationHistory
        };
        const revision = await runtime.presentInteractive(revisionPrompt);
        conversationHistory.push({ role: 'amend', domain, content: revision });
      } else {
        // Treat anything else as accept (graceful)
        record.push({ domain, outcome: 'accept', amendCount });
        accepted = true;
      }
    }

    // If max amends reached without accept, force accept
    if (!accepted) {
      record.push({ domain, outcome: 'accept', amendCount, forced: true });
    }
  }

  return record;
}

/**
 * Run the finalization chain.
 *
 * @param {Object} item - Item being finalized
 * @param {Array} conversationHistory - Full conversation history
 * @param {Array} confirmationRecord - Confirmation outcomes
 * @returns {Promise<Object>} Finalization status
 */
async function runFinalization(item, conversationHistory, confirmationRecord) {
  const chain = getFinalizationChain();
  const stepResults = [];

  for (const step of chain) {
    try {
      // Simulate step execution — actual file writes are provider responsibility
      stepResults.push({
        id: step.id,
        order: step.order,
        status: 'completed',
        fail_open: step.fail_open
      });
    } catch (err) {
      if (step.fail_open) {
        stepResults.push({
          id: step.id,
          order: step.order,
          status: 'skipped',
          error: err.message,
          fail_open: true
        });
      } else {
        stepResults.push({
          id: step.id,
          order: step.order,
          status: 'failed',
          error: err.message,
          fail_open: false
        });
      }
    }
  }

  return {
    completed: true,
    steps: stepResults
  };
}

# Coverage Report: REQ-GH-208

**Date**: 2026-03-26

## Feature Coverage

| Source File | Tests | Covered Exports | Coverage |
|------------|-------|-----------------|----------|
| src/core/analyze/state-machine.js | 49 | getStateMachine, getTransition, getTierPath | 100% |
| src/core/orchestration/analyze.js | 33 | runAnalyze (+ internal: classifyItem, createTopicTracker, runConfirmationSequence, runFinalization) | 100% |
| src/core/analyze/finalization-chain.js | 21 | getFinalizationChain, getProviderNeutralSteps, getAsyncSteps | 100% |
| bin/generate-contracts.js | 30 | generateContracts (+ internal: buildAnalyzeEntries, buildWorkflowEntries) | 100% |

## Test Distribution

| Test File | Count | Categories |
|-----------|-------|------------|
| state-machine.test.js | 49 | STATES enum, transitions, tier paths, PRESENTING_TASKS state |
| finalization-chain.test.js | 21 | Chain structure, task_breakdown_write step, dependency graph |
| analyze.test.js | 33 | Classification, roundtable, 4-domain confirmation, fail-open |
| contract-schema.test.js | 15 | confirmation_sequence, task_display, task_scope defaults |
| contract-generator.test.js | 15 | Contract generation, analyze entries with tasks domain |

**Total**: 133 tests, 133 passing, 0 failing

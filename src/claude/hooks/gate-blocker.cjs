#!/usr/bin/env node
/**
 * iSDLC Gate Blocker - PreToolUse Hook
 * =====================================
 * Blocks gate advancement unless all iteration requirements are met.
 *
 * REQ-0088 Enforcement Layering:
 *   1. Try core validateAndProduceEvidence() via bridge
 *   2. If core returns evidence -> use it
 *   3. If core is unavailable (bridge fallback) -> run inline validation (existing behavior)
 */

const { check } = require('./lib/gate-logic.cjs');
const {
    readStdin,
    readState,
    writeState: writeStateFn,
    loadManifest,
    loadIterationRequirements,
    loadWorkflowDefinitions,
    outputBlockResponse
} = require('./lib/common.cjs');

const fs = require('fs');
const path = require('path');

// Lazy-load enforcement bridge (REQ-0088)
let _enforcementBridge;
function _getEnforcementBridge() {
    if (_enforcementBridge !== undefined) return _enforcementBridge;
    try {
        const bridgePath = path.resolve(__dirname, '..', '..', 'core', 'bridge', 'validators.cjs');
        if (fs.existsSync(bridgePath)) {
            _enforcementBridge = require(bridgePath);
        } else {
            _enforcementBridge = null;
        }
    } catch (e) {
        _enforcementBridge = null;
    }
    return _enforcementBridge;
}

if (require.main === module) {
    (async () => {
        try {
            const inputStr = await readStdin();
            if (!inputStr || !inputStr.trim()) process.exit(0);

            let input;
            try { input = JSON.parse(inputStr); } catch (e) { process.exit(0); }

            const state = readState();
            const manifest = loadManifest();
            const requirements = loadIterationRequirements();
            const workflows = loadWorkflowDefinitions();

            const ctx = { input, state, manifest, requirements, workflows };

            // REQ-0088: Try enforcement layering via core bridge first
            let result;
            const bridge = _getEnforcementBridge();
            if (bridge && bridge._syncGateLogic) {
                // Core validators loaded — use evidence-producing check
                try {
                    result = bridge.check(ctx);
                } catch (e) {
                    // Fallback to inline check on bridge error
                    result = check(ctx);
                }
            } else {
                // Core unavailable — use inline validation (existing behavior)
                result = check(ctx);
            }

            if (result.stderr) console.error(result.stderr);
            if (result.stdout) console.log(result.stdout);

            if (result.decision === 'block' && result.stopReason) {
                outputBlockResponse(result.stopReason);
            }

            if (result.stateModified && state) {
                writeStateFn(state);
            }
            process.exit(0);
        } catch (e) {
            process.exit(0);
        }
    })();
}

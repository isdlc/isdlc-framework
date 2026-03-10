'use strict';

/**
 * iSDLC State File Guard - Test Suite (CJS / node:test)
 * ======================================================
 * Tests for state-file-guard.cjs PreToolUse[Bash] hook.
 *
 * Run:  node --test src/claude/hooks/tests/test-state-file-guard.test.cjs
 *
 * Version: 1.0.0
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
    setupTestEnv,
    cleanupTestEnv,
    prepareHook,
    runHook
} = require('./hook-test-utils.cjs');

const HOOK_SRC = path.resolve(__dirname, '..', 'state-file-guard.cjs');

describe('state-file-guard.cjs', () => {
    let hookPath;

    beforeEach(() => {
        setupTestEnv();
        hookPath = prepareHook(HOOK_SRC);
    });

    afterEach(() => {
        cleanupTestEnv();
    });

    // -----------------------------------------------------------------------
    // 1. Non-Bash tools pass through
    // -----------------------------------------------------------------------
    it('allows non-Bash tools (exits silently)', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Write',
            tool_input: { file_path: '.isdlc/state.json', content: '{}' }
        });

        assert.equal(result.code, 0);
        assert.equal(result.stdout, '');
    });

    // -----------------------------------------------------------------------
    // 2. Empty/missing command
    // -----------------------------------------------------------------------
    it('allows empty command', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: '' }
        });

        assert.equal(result.code, 0);
        assert.equal(result.stdout, '');
    });

    it('allows missing tool_input', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash'
        });

        assert.equal(result.code, 0);
        assert.equal(result.stdout, '');
    });

    // -----------------------------------------------------------------------
    // 3. Read-only commands targeting state.json are allowed
    // -----------------------------------------------------------------------
    it('allows cat .isdlc/state.json (read-only)', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: 'cat .isdlc/state.json' }
        });

        assert.equal(result.code, 0);
        assert.equal(result.stdout, '');
    });

    it('allows jq queries on .isdlc/state.json (read-only)', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: 'jq .current_phase .isdlc/state.json' }
        });

        assert.equal(result.code, 0);
        assert.equal(result.stdout, '');
    });

    // -----------------------------------------------------------------------
    // 4. Write commands NOT targeting state.json are allowed
    // -----------------------------------------------------------------------
    it('allows write commands not targeting state.json', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: 'echo "hi" > output.txt' }
        });

        assert.equal(result.code, 0);
        assert.equal(result.stdout, '');
    });

    // -----------------------------------------------------------------------
    // 5. Blocks > redirect to state.json
    // -----------------------------------------------------------------------
    it('blocks > redirect to state.json', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: 'echo \'{"a":1}\' > .isdlc/state.json' }
        });

        assert.equal(result.code, 0);
        const output = JSON.parse(result.stdout);
        assert.equal(output.continue, false);
        assert.ok(output.stopReason.includes('BASH STATE GUARD'));
    });

    // -----------------------------------------------------------------------
    // 6. Blocks >> append to state.json
    // -----------------------------------------------------------------------
    it('blocks >> append to state.json', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: 'echo "extra" >> .isdlc/state.json' }
        });

        assert.equal(result.code, 0);
        const output = JSON.parse(result.stdout);
        assert.equal(output.continue, false);
        assert.ok(output.stopReason.includes('BASH STATE GUARD'));
    });

    // -----------------------------------------------------------------------
    // 7. Blocks tee piped to state.json
    // -----------------------------------------------------------------------
    it('blocks tee piped to state.json', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: 'echo "{}" | tee .isdlc/state.json' }
        });

        assert.equal(result.code, 0);
        const output = JSON.parse(result.stdout);
        assert.equal(output.continue, false);
        assert.ok(output.stopReason.includes('BASH STATE GUARD'));
    });

    // -----------------------------------------------------------------------
    // 8. Blocks node -e targeting state.json
    // -----------------------------------------------------------------------
    it('blocks node -e targeting state.json', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: 'node -e "require(\'fs\').writeFileSync(\'.isdlc/state.json\', \'{}\')"' }
        });

        assert.equal(result.code, 0);
        const output = JSON.parse(result.stdout);
        assert.equal(output.continue, false);
        assert.ok(output.stopReason.includes('BASH STATE GUARD'));
    });

    // -----------------------------------------------------------------------
    // 9. Blocks sed -i targeting state.json
    // -----------------------------------------------------------------------
    it('blocks sed -i targeting state.json', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: 'sed -i "s/old/new/" .isdlc/state.json' }
        });

        assert.equal(result.code, 0);
        const output = JSON.parse(result.stdout);
        assert.equal(output.continue, false);
        assert.ok(output.stopReason.includes('BASH STATE GUARD'));
    });

    // -----------------------------------------------------------------------
    // 10. Blocks mv targeting state.json
    // -----------------------------------------------------------------------
    it('blocks mv targeting state.json', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: 'mv /tmp/new-state.json .isdlc/state.json' }
        });

        assert.equal(result.code, 0);
        const output = JSON.parse(result.stdout);
        assert.equal(output.continue, false);
        assert.ok(output.stopReason.includes('BASH STATE GUARD'));
    });

    // -----------------------------------------------------------------------
    // 11. Blocks cp targeting state.json
    // -----------------------------------------------------------------------
    it('blocks cp targeting state.json', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: 'cp /tmp/backup.json .isdlc/state.json' }
        });

        assert.equal(result.code, 0);
        const output = JSON.parse(result.stdout);
        assert.equal(output.continue, false);
        assert.ok(output.stopReason.includes('BASH STATE GUARD'));
    });

    // -----------------------------------------------------------------------
    // 12. Handles monorepo path
    // -----------------------------------------------------------------------
    it('blocks write to monorepo state.json path', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: 'echo "{}" > .isdlc/projects/foo/state.json' }
        });

        assert.equal(result.code, 0);
        const output = JSON.parse(result.stdout);
        assert.equal(output.continue, false);
        assert.ok(output.stopReason.includes('BASH STATE GUARD'));
    });

    // -----------------------------------------------------------------------
    // 13. Handles Windows-style paths
    // -----------------------------------------------------------------------
    it('blocks write to state.json with backslash separator', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: 'echo "{}" > .isdlc\\state.json' }
        });

        assert.equal(result.code, 0);
        const output = JSON.parse(result.stdout);
        assert.equal(output.continue, false);
        assert.ok(output.stopReason.includes('BASH STATE GUARD'));
    });

    // -----------------------------------------------------------------------
    // 14. Handles quoted paths
    // -----------------------------------------------------------------------
    it('blocks write to quoted state.json path', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: 'echo "{}" > ".isdlc/state.json"' }
        });

        assert.equal(result.code, 0);
        const output = JSON.parse(result.stdout);
        assert.equal(output.continue, false);
        assert.ok(output.stopReason.includes('BASH STATE GUARD'));
    });

    // -----------------------------------------------------------------------
    // 15. Allows read of monorepo state.json
    // -----------------------------------------------------------------------
    it('allows read-only access to monorepo state.json', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: 'cat .isdlc/projects/foo/state.json' }
        });

        assert.equal(result.code, 0);
        assert.equal(result.stdout, '');
    });
});

// ---------------------------------------------------------------------------
// BUG-0016: Inline Script Body Inspection Tests
// ---------------------------------------------------------------------------
// Traces to: BUG-0016 requirements-spec.md (FR-03 through FR-06, AC-05 through AC-12)
// ---------------------------------------------------------------------------

describe('state-file-guard inline script inspection (BUG-0016)', () => {
    let hookPath;

    beforeEach(() => {
        setupTestEnv();
        hookPath = prepareHook(HOOK_SRC);
    });

    afterEach(() => {
        cleanupTestEnv();
    });

    // T16: Allow node -e readFileSync (read-only)
    // Traces to: AC-05, AC-07
    it('T16: allows node -e readFileSync on state.json (read-only)', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: 'node -e "console.log(JSON.parse(require(\'fs\').readFileSync(\'.isdlc/state.json\',\'utf8\')).current_phase)"' }
        });
        assert.equal(result.code, 0);
        assert.equal(result.stdout, '', 'Read-only node -e should be allowed');
    });

    // T17: Block node -e writeFileSync
    // Traces to: AC-06
    it('T17: blocks node -e writeFileSync on state.json', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: 'node -e "require(\'fs\').writeFileSync(\'.isdlc/state.json\', JSON.stringify({}))"' }
        });
        assert.equal(result.code, 0);
        const output = JSON.parse(result.stdout);
        assert.equal(output.continue, false);
        assert.ok(output.stopReason.includes('BASH STATE GUARD'));
    });

    // T18: Block node --eval writeFile
    // Traces to: AC-08
    it('T18: blocks node --eval writeFile on state.json', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: 'node --eval "require(\'fs\').writeFile(\'.isdlc/state.json\', \'{}\', ()=>{})"' }
        });
        assert.equal(result.code, 0);
        const output = JSON.parse(result.stdout);
        assert.equal(output.continue, false);
        assert.ok(output.stopReason.includes('BASH STATE GUARD'));
    });

    // T19: Allow pure readFileSync via node -e
    // Traces to: AC-07
    it('T19: allows node -e pure readFileSync', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: 'node -e "require(\'fs\').readFileSync(\'.isdlc/state.json\',\'utf8\')"' }
        });
        assert.equal(result.code, 0);
        assert.equal(result.stdout, '', 'Pure readFileSync should be allowed');
    });

    // T20: node -e without state.json reference is unaffected
    // Traces to: AC-09
    it('T20: node -e without state.json reference is unaffected', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: 'node -e "console.log(1+1)"' }
        });
        assert.equal(result.code, 0);
        assert.equal(result.stdout, '');
    });

    // T21: python -c read-only allowed
    // Traces to: AC-10
    it('T21: allows python -c read-only access to state.json', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: 'python3 -c "import json; print(json.load(open(\'.isdlc/state.json\'))[\'current_phase\'])"' }
        });
        assert.equal(result.code, 0);
        assert.equal(result.stdout, '', 'Read-only python -c should be allowed');
    });

    // T22: python -c with write blocked
    // Traces to: AC-11
    it('T22: blocks python -c with write operation on state.json', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: 'python3 -c "open(\'.isdlc/state.json\',\'w\').write(\'{}\')"' }
        });
        assert.equal(result.code, 0);
        const output = JSON.parse(result.stdout);
        assert.equal(output.continue, false);
        assert.ok(output.stopReason.includes('BASH STATE GUARD'));
    });

    // T23: Existing non-inline commands still work
    // Traces to: AC-12
    it('T23: cat and grep still allowed on state.json', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: 'cat .isdlc/state.json | grep current_phase' }
        });
        assert.equal(result.code, 0);
        assert.equal(result.stdout, '');
    });
});

// ---------------------------------------------------------------------------
// BUG-0117: False positive prevention tests
// ---------------------------------------------------------------------------

describe('state-file-guard false positive prevention (BUG-0117)', () => {
    let hookPath;

    beforeEach(() => {
        setupTestEnv();
        hookPath = prepareHook(HOOK_SRC);
    });

    afterEach(() => {
        cleanupTestEnv();
    });

    // T24: gh issue create with body mentioning state.json
    it('T24: allows gh issue create whose body mentions state.json', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: 'gh issue create --title "fix bug" --body "$(cat <<\'EOF\'\nThe .isdlc/state.json file has writeFileSync issues\nEOF\n)"' }
        });
        assert.equal(result.code, 0);
        assert.equal(result.stdout, '', 'gh issue create with state.json in body should be allowed');
    });

    // T25: pipe cat state.json to node -e read-only (arrow functions)
    it('T25: allows cat state.json piped to node -e with arrow functions', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: "cat .isdlc/state.json | node -e 'let d=\"\";process.stdin.on(\"data\",c=>d+=c);process.stdin.on(\"end\",()=>{console.log(JSON.parse(d).current_phase)})'" }
        });
        assert.equal(result.code, 0);
        assert.equal(result.stdout, '', 'Read-only pipe with arrow functions should be allowed');
    });

    // T26: heredoc writing a temp script that mentions state.json
    it('T26: allows heredoc that creates a temp script mentioning state.json', async () => {
        const cmd = "cat > /tmp/check.cjs << 'SCRIPT'\nconst s = JSON.parse(require('fs').readFileSync('.isdlc/state.json','utf8'));\nconsole.log(s.current_phase);\nSCRIPT\nnode /tmp/check.cjs";
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: cmd }
        });
        assert.equal(result.code, 0);
        assert.equal(result.stdout, '', 'Heredoc creating temp read script should be allowed');
    });

    // T27: Still blocks actual write to state.json (not a false negative)
    it('T27: still blocks echo redirect to state.json', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: 'echo "{}" > .isdlc/state.json' }
        });
        assert.equal(result.code, 0);
        const output = JSON.parse(result.stdout);
        assert.equal(output.continue, false);
        assert.ok(output.stopReason.includes('BASH STATE GUARD'));
    });

    // T28: Still blocks node -e writeFileSync to state.json (not in quotes)
    it('T28: still blocks direct node -e writeFileSync to state.json', async () => {
        const result = await runHook(hookPath, {
            tool_name: 'Bash',
            tool_input: { command: 'node -e "require(\'fs\').writeFileSync(\'.isdlc/state.json\', \'{}\')"' }
        });
        assert.equal(result.code, 0);
        const output = JSON.parse(result.stdout);
        assert.equal(output.continue, false);
        assert.ok(output.stopReason.includes('BASH STATE GUARD'));
    });
});

// ---------------------------------------------------------------------------
// Unit tests for exported helper functions
// ---------------------------------------------------------------------------

describe('state-file-guard helpers (unit)', () => {
    const { commandTargetsStateJson, isWriteCommand } = require(HOOK_SRC);

    // commandTargetsStateJson
    it('commandTargetsStateJson matches .isdlc/state.json', () => {
        assert.ok(commandTargetsStateJson('cat .isdlc/state.json'));
    });

    it('commandTargetsStateJson matches monorepo path', () => {
        assert.ok(commandTargetsStateJson('cat .isdlc/projects/myapp/state.json'));
    });

    it('commandTargetsStateJson matches backslash path', () => {
        assert.ok(commandTargetsStateJson('cat .isdlc\\state.json'));
    });

    it('commandTargetsStateJson does not match other files', () => {
        assert.ok(!commandTargetsStateJson('cat .isdlc/config.json'));
        assert.ok(!commandTargetsStateJson('cat state.json'));
        assert.ok(!commandTargetsStateJson('echo hello'));
    });

    it('commandTargetsStateJson returns false for empty/null', () => {
        assert.ok(!commandTargetsStateJson(''));
        assert.ok(!commandTargetsStateJson(null));
        assert.ok(!commandTargetsStateJson(undefined));
    });

    // isWriteCommand
    it('isWriteCommand detects redirect operator', () => {
        assert.ok(isWriteCommand('echo "x" > file.txt'));
        assert.ok(isWriteCommand('echo "x" >> file.txt'));
    });

    // BUG-0117: > pattern must not match => arrow functions
    it('isWriteCommand does not match => arrow functions', () => {
        assert.ok(!isWriteCommand('c=>d+=c'));
        assert.ok(!isWriteCommand('()=>{console.log(1)}'));
        assert.ok(!isWriteCommand('(x) => x + 1'));
    });

    it('isWriteCommand does not match -> arrow operator', () => {
        assert.ok(!isWriteCommand('a->b'));
    });

    it('isWriteCommand detects tee', () => {
        assert.ok(isWriteCommand('echo "x" | tee file.txt'));
    });

    // BUG-0016: node -e with read-only body is NO LONGER a write command
    it('isWriteCommand returns false for node -e with read-only body', () => {
        assert.ok(!isWriteCommand('node -e "console.log(1)"'));
    });

    it('isWriteCommand detects node -e with writeFileSync', () => {
        assert.ok(isWriteCommand('node -e "require(\'fs\').writeFileSync(\'f\', \'{}\')"'));
    });

    it('isWriteCommand detects sed -i', () => {
        assert.ok(isWriteCommand('sed -i "s/a/b/" file.txt'));
    });

    it('isWriteCommand detects mv and cp to state.json', () => {
        assert.ok(isWriteCommand('mv /tmp/x state.json'));
        assert.ok(isWriteCommand('cp /tmp/x state.json'));
    });

    it('isWriteCommand returns false for read-only commands', () => {
        assert.ok(!isWriteCommand('cat file.txt'));
        assert.ok(!isWriteCommand('jq .key file.json'));
        assert.ok(!isWriteCommand('grep pattern file.txt'));
    });

    it('isWriteCommand returns false for empty/null', () => {
        assert.ok(!isWriteCommand(''));
        assert.ok(!isWriteCommand(null));
        assert.ok(!isWriteCommand(undefined));
    });
});

// ---------------------------------------------------------------------------
// Unit tests for sanitizeCommand (BUG-0117)
// ---------------------------------------------------------------------------

describe('sanitizeCommand (BUG-0117 unit)', () => {
    const { sanitizeCommand } = require(HOOK_SRC);

    it('returns empty string for empty/null input', () => {
        assert.equal(sanitizeCommand(''), '');
        assert.equal(sanitizeCommand(null), '');
        assert.equal(sanitizeCommand(undefined), '');
    });

    it('strips heredoc body content', () => {
        const cmd = "cat > /tmp/x << 'EOF'\nstate.json writeFileSync\nEOF\nnode /tmp/x";
        const result = sanitizeCommand(cmd);
        assert.ok(!result.includes('state.json'), 'heredoc body should be stripped');
        assert.ok(!result.includes('writeFileSync'), 'heredoc body should be stripped');
        assert.ok(result.includes('node /tmp/x'), 'command after heredoc should remain');
    });

    it('strips heredoc with double-quoted marker', () => {
        const cmd = 'cat << "MARKER"\n.isdlc/state.json\nMARKER';
        const result = sanitizeCommand(cmd);
        assert.ok(!result.includes('.isdlc/state.json'));
    });

    it('strips heredoc with unquoted marker', () => {
        const cmd = 'cat << END\nwriteFileSync .isdlc/state.json\nEND';
        const result = sanitizeCommand(cmd);
        assert.ok(!result.includes('writeFileSync'));
        assert.ok(!result.includes('.isdlc/state.json'));
    });

    it('strips single-quoted string content', () => {
        const cmd = "node -e 'c=>d+=c; .isdlc/state.json'";
        const result = sanitizeCommand(cmd);
        assert.ok(!result.includes('=>'), 'arrow function inside quotes should be stripped');
        assert.ok(!result.includes('.isdlc/state.json'), 'state.json inside quotes should be stripped');
    });

    it('preserves unquoted command structure', () => {
        const cmd = 'echo hello > .isdlc/state.json';
        const result = sanitizeCommand(cmd);
        assert.ok(result.includes('echo'));
        assert.ok(result.includes('>'));
        assert.ok(result.includes('.isdlc/state.json'));
    });

    it('handles command with no heredocs or quotes', () => {
        const cmd = 'cat .isdlc/state.json | grep phase';
        const result = sanitizeCommand(cmd);
        assert.equal(result, cmd);
    });
});

// ---------------------------------------------------------------------------
// Unit tests for isInlineScriptWrite (BUG-0016)
// ---------------------------------------------------------------------------

describe('isInlineScriptWrite (BUG-0016 unit)', () => {
    const { isInlineScriptWrite } = require(HOOK_SRC);

    it('returns false for non-inline-script commands', () => {
        assert.ok(!isInlineScriptWrite('cat file.txt'));
        assert.ok(!isInlineScriptWrite('echo hello'));
        assert.ok(!isInlineScriptWrite('git status'));
    });

    it('returns false for node -e with read-only body', () => {
        assert.ok(!isInlineScriptWrite('node -e "console.log(1)"'));
        assert.ok(!isInlineScriptWrite('node -e "require(\'fs\').readFileSync(\'f\',\'utf8\')"'));
    });

    it('returns true for node -e with writeFileSync', () => {
        assert.ok(isInlineScriptWrite('node -e "require(\'fs\').writeFileSync(\'f\', \'{}\')"'));
    });

    it('returns true for node -e with writeFile', () => {
        assert.ok(isInlineScriptWrite('node -e "require(\'fs\').writeFile(\'f\', \'{}\', ()=>{})"'));
    });

    it('returns true for node --eval with writeFileSync', () => {
        assert.ok(isInlineScriptWrite('node --eval "require(\'fs\').writeFileSync(\'f\', \'{}\')"'));
    });

    it('returns false for node --eval with read-only body', () => {
        assert.ok(!isInlineScriptWrite('node --eval "console.log(JSON.parse(require(\'fs\').readFileSync(\'f\',\'utf8\')))"'));
    });

    it('returns false for python -c with read-only body', () => {
        assert.ok(!isInlineScriptWrite('python3 -c "import json; print(json.load(open(\'f\')))"'));
    });

    it('returns true for python -c with write operation', () => {
        assert.ok(isInlineScriptWrite('python3 -c "open(\'f\',\'w\').write(\'{}\')"'));
    });

    it('returns false for ruby -e with read-only body', () => {
        assert.ok(!isInlineScriptWrite('ruby -e "puts File.read(\'f\')"'));
    });

    it('returns true for ruby -e with write operation', () => {
        assert.ok(isInlineScriptWrite('ruby -e "File.write(\'f\', \'{}\')"'));
    });

    it('returns false for perl -e with read-only body', () => {
        assert.ok(!isInlineScriptWrite('perl -e "print <>"'));
    });

    it('returns false for empty/null', () => {
        assert.ok(!isInlineScriptWrite(''));
        assert.ok(!isInlineScriptWrite(null));
        assert.ok(!isInlineScriptWrite(undefined));
    });
});

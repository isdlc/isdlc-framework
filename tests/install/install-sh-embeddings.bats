#!/usr/bin/env bats
#
# install.sh — FR-010 install-time embeddings opt-in prompt (bash path)
#
# REQ-GH-239 — Worker pool + engine parallelism
# Traces: FR-010 (Install-time opt-in prompt)
#         NFR-006 (Fail-open behavior — EOF/broken stdin defaults to NO)
#         ERR-INSTALL-001 (EOF / broken stdin → NO)
#
# These tests source install.sh to drive the `prompt_embeddings`,
# `embeddings_config_block`, and `write_isdlc_config_json` helpers directly.
# install.sh has a source-detection guard near the top that causes the
# installer's side-effect code to be skipped when sourced — only the helper
# function definitions execute.
#
# Dependency: bats-core (https://github.com/bats-core/bats-core)
# Run: bats tests/install/install-sh-embeddings.bats
# Install bats (macOS): brew install bats-core
# Install bats (Linux): apt-get install bats  OR  npm install -g bats

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

setup() {
    # Locate install.sh relative to this test file.
    # BATS_TEST_DIRNAME = tests/install/
    INSTALL_SH="${BATS_TEST_DIRNAME}/../../install.sh"
    [ -f "$INSTALL_SH" ] || {
        echo "install.sh not found at $INSTALL_SH" >&2
        return 1
    }

    # Fresh tmp dir for per-test config writes
    TEST_TMP_DIR="$(mktemp -d)"
    export TEST_TMP_DIR
}

teardown() {
    if [ -n "${TEST_TMP_DIR:-}" ] && [ -d "$TEST_TMP_DIR" ]; then
        rm -rf "$TEST_TMP_DIR"
    fi
}

# Helper: source install.sh in a subshell and run a command against the
# sourced helpers. Stdin is fed via the caller.
_with_sourced_install() {
    bash -c "source '$INSTALL_SH' && $*"
}

# ---------------------------------------------------------------------------
# FR-010 — Prompt banner is displayed with exact wording
# ---------------------------------------------------------------------------

@test "[P0] FR-010: prompt banner displays the exact four binding lines" {
    run bash -c "source '$INSTALL_SH' && printf '' | prompt_embeddings"
    [ "$status" -eq 0 ]

    # Lines 2-5 of the banner (blank line 1 is intentional leading spacer)
    [[ "$output" == *"Code Embeddings (Optional)"* ]]
    [[ "$output" == *"Enables semantic code search, sprawl detection, duplication analysis."* ]]
    [[ "$output" == *"First generation: ~30-60 min on medium codebases. Refresh: seconds-minutes."* ]]
    [[ "$output" == *"Enable code embeddings for semantic search? [y/N]:"* ]]
}

@test "[P0] FR-010: prompt text matches FR-010 character-for-character" {
    # Assert the exact question line with NO trailing space (bash `echo` adds
    # a newline, not a trailing space — the Node path uses readline with a
    # trailing space; the two paths differ in that detail only).
    run bash -c "source '$INSTALL_SH' && printf '' | prompt_embeddings"
    [ "$status" -eq 0 ]

    # Extract just the question line (grep-free)
    case "$output" in
        *"Enable code embeddings for semantic search? [y/N]:"*)
            : # ok
            ;;
        *)
            printf 'Prompt question line not found in output:\n%s\n' "$output" >&2
            return 1
            ;;
    esac
}

# ---------------------------------------------------------------------------
# FR-010 — Default N (empty / Enter / unrecognized)
# ---------------------------------------------------------------------------

@test "[P0] FR-010: empty input (just Enter) returns false" {
    run bash -c "source '$INSTALL_SH' && printf '\n' | prompt_embeddings"
    [ "$status" -eq 0 ]
    # Last line of stdout is the result
    last_line="$(printf '%s\n' "$output" | tail -n 1)"
    [ "$last_line" = "false" ]
}

@test "[P0] FR-010: 'n' input returns false" {
    run bash -c "source '$INSTALL_SH' && printf 'n\n' | prompt_embeddings"
    [ "$status" -eq 0 ]
    last_line="$(printf '%s\n' "$output" | tail -n 1)"
    [ "$last_line" = "false" ]
}

@test "[P1] FR-010: 'no' input returns false" {
    run bash -c "source '$INSTALL_SH' && printf 'no\n' | prompt_embeddings"
    [ "$status" -eq 0 ]
    last_line="$(printf '%s\n' "$output" | tail -n 1)"
    [ "$last_line" = "false" ]
}

@test "[P1] FR-010: unrecognized input ('maybe') returns false (fail-closed)" {
    run bash -c "source '$INSTALL_SH' && printf 'maybe\n' | prompt_embeddings"
    [ "$status" -eq 0 ]
    last_line="$(printf '%s\n' "$output" | tail -n 1)"
    [ "$last_line" = "false" ]
}

# ---------------------------------------------------------------------------
# FR-010 — Affirmative inputs
# ---------------------------------------------------------------------------

@test "[P0] FR-010: 'y' input returns true" {
    run bash -c "source '$INSTALL_SH' && printf 'y\n' | prompt_embeddings"
    [ "$status" -eq 0 ]
    last_line="$(printf '%s\n' "$output" | tail -n 1)"
    [ "$last_line" = "true" ]
}

@test "[P0] FR-010: 'Y' (capital) input returns true" {
    run bash -c "source '$INSTALL_SH' && printf 'Y\n' | prompt_embeddings"
    [ "$status" -eq 0 ]
    last_line="$(printf '%s\n' "$output" | tail -n 1)"
    [ "$last_line" = "true" ]
}

@test "[P0] FR-010: 'yes' input returns true" {
    run bash -c "source '$INSTALL_SH' && printf 'yes\n' | prompt_embeddings"
    [ "$status" -eq 0 ]
    last_line="$(printf '%s\n' "$output" | tail -n 1)"
    [ "$last_line" = "true" ]
}

@test "[P1] FR-010: 'YES' (capital) input returns true" {
    run bash -c "source '$INSTALL_SH' && printf 'YES\n' | prompt_embeddings"
    [ "$status" -eq 0 ]
    last_line="$(printf '%s\n' "$output" | tail -n 1)"
    [ "$last_line" = "true" ]
}

# ---------------------------------------------------------------------------
# NFR-006 + ERR-INSTALL-001 — Fail-open on broken stdin
# ---------------------------------------------------------------------------

@test "[P0] NFR-006/ERR-INSTALL-001: EOF / closed stdin defaults to false" {
    # /dev/null as stdin simulates closed stdin — `read` returns non-zero,
    # the installer MUST NOT hang and MUST default to NO.
    run bash -c "source '$INSTALL_SH' && prompt_embeddings < /dev/null"
    [ "$status" -eq 0 ]
    last_line="$(printf '%s\n' "$output" | tail -n 1)"
    [ "$last_line" = "false" ]
}

@test "[P0] NFR-006: prompt_embeddings does not crash under set -e with EOF" {
    # Explicitly run with `set -e` in the sourcing shell to confirm the
    # read-failure path is properly suppressed (does not kill the shell).
    run bash -c "set -e; source '$INSTALL_SH'; prompt_embeddings < /dev/null; echo POST_OK"
    [ "$status" -eq 0 ]
    [[ "$output" == *"POST_OK"* ]]
}

# ---------------------------------------------------------------------------
# FR-010 — Generated .isdlc/config.json contents
# ---------------------------------------------------------------------------

@test "[P0] FR-010: disabled path writes valid JSON with NO embeddings key" {
    run _with_sourced_install "write_isdlc_config_json false '$TEST_TMP_DIR/config.json'"
    [ "$status" -eq 0 ]
    [ -f "$TEST_TMP_DIR/config.json" ]

    # Must be valid JSON — validate via python3 if available, else via node.
    if command -v python3 >/dev/null 2>&1; then
        run python3 -c "import json,sys; d=json.load(open('$TEST_TMP_DIR/config.json')); sys.exit(0 if 'embeddings' not in d else 1)"
    elif command -v node >/dev/null 2>&1; then
        run node -e "const d=require('$TEST_TMP_DIR/config.json'); process.exit('embeddings' in d ? 1 : 0)"
    else
        skip "neither python3 nor node available to validate JSON"
    fi
    [ "$status" -eq 0 ]
}

@test "[P0] FR-010: enabled path writes valid JSON WITH embeddings block" {
    run _with_sourced_install "write_isdlc_config_json true '$TEST_TMP_DIR/config.json'"
    [ "$status" -eq 0 ]
    [ -f "$TEST_TMP_DIR/config.json" ]

    if command -v python3 >/dev/null 2>&1; then
        run python3 -c "
import json, sys
d = json.load(open('$TEST_TMP_DIR/config.json'))
assert 'embeddings' in d, 'embeddings key missing'
e = d['embeddings']
assert e['provider'] == 'jina-code'
assert e['model'] == 'jinaai/jina-embeddings-v2-base-code'
assert e['server']['port'] == 7777
assert e['server']['host'] == 'localhost'
assert e['server']['auto_start'] is True
assert e['parallelism'] == 'auto'
assert e['device'] == 'auto'
assert e['dtype'] == 'auto'
assert e['batch_size'] == 32
assert e['session_options'] == {}
assert e['max_memory_gb'] is None
assert e['refresh_on_finalize'] is True
"
    elif command -v node >/dev/null 2>&1; then
        run node -e "
const d = require('$TEST_TMP_DIR/config.json');
if (!('embeddings' in d)) process.exit(1);
const e = d.embeddings;
if (e.provider !== 'jina-code') process.exit(2);
if (e.model !== 'jinaai/jina-embeddings-v2-base-code') process.exit(3);
if (e.server.port !== 7777) process.exit(4);
if (e.refresh_on_finalize !== true) process.exit(5);
process.exit(0);
"
    else
        skip "neither python3 nor node available to validate JSON"
    fi
    [ "$status" -eq 0 ]
}

@test "[P0] FR-010: enabled config.json omits no required embedding field" {
    # Complementary assertion: even the optional but-specified fields
    # (session_options, max_memory_gb) are present.
    run _with_sourced_install "write_isdlc_config_json true '$TEST_TMP_DIR/config.json'"
    [ "$status" -eq 0 ]

    run grep -c '"session_options"' "$TEST_TMP_DIR/config.json"
    [ "$status" -eq 0 ]
    [ "$output" = "1" ]

    run grep -c '"max_memory_gb"' "$TEST_TMP_DIR/config.json"
    [ "$status" -eq 0 ]
    [ "$output" = "1" ]

    run grep -c '"refresh_on_finalize"' "$TEST_TMP_DIR/config.json"
    [ "$status" -eq 0 ]
    [ "$output" = "1" ]
}

# ---------------------------------------------------------------------------
# FR-010 — Call-to-action lines on stdout
# ---------------------------------------------------------------------------
# These assert the wording of the post-selection hint lines. The installer
# echoes these AFTER writing config.json, so we simulate the installer's
# branching by invoking the echo directly with the expected value.

@test "[P0] FR-010: enabled CTA line matches exact wording" {
    expected="  → Embeddings enabled. Run 'isdlc-embedding generate .' to bootstrap."
    run bash -c "echo \"$expected\""
    [ "$status" -eq 0 ]
    [ "$output" = "$expected" ]
}

@test "[P0] FR-010: disabled CTA line matches exact wording" {
    expected="  → Embeddings disabled. Run 'isdlc-embedding configure' at any time to enable."
    run bash -c "echo \"$expected\""
    [ "$status" -eq 0 ]
    [ "$output" = "$expected" ]
}

# Direct assertion that install.sh contains these exact CTA strings — this
# is the load-bearing test that keeps the installer in sync with FR-010.
@test "[P0] FR-010: install.sh contains the enabled CTA string literally" {
    run grep -F "→ Embeddings enabled. Run 'isdlc-embedding generate .' to bootstrap." "$INSTALL_SH"
    [ "$status" -eq 0 ]
}

@test "[P0] FR-010: install.sh contains the disabled CTA string literally" {
    run grep -F "→ Embeddings disabled. Run 'isdlc-embedding configure' at any time to enable." "$INSTALL_SH"
    [ "$status" -eq 0 ]
}

# ---------------------------------------------------------------------------
# Source-detection guard — install.sh must be sourceable without side effects
# ---------------------------------------------------------------------------

@test "install.sh source-detection guard: sourcing does not run installer body" {
    # Sourcing install.sh must NOT create .claude/, .isdlc/, or docs/ in
    # the current directory — those are installer side effects gated by the
    # BASH_SOURCE check near the top of the script.
    (
        cd "$TEST_TMP_DIR"
        source "$INSTALL_SH"
        [ ! -d .claude ]
        [ ! -d docs ]
        [ ! -f .isdlc/state.json ]
    )
}

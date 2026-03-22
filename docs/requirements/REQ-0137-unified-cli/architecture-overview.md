# Architecture Overview — REQ-0137 Unified CLI with provider auto-detection

**ADR**: ADR-CODEX-038

## Components

### lib/cli.js (MODIFY — ~50 lines added)

Existing 292-line CLI module. Modifications add provider detection, instruction generation on install, and provider info display.

- Add `--provider` flag parsing to init command
- After install completes, detect provider and call `generateInstructions()` to produce instruction file
- Update command regenerates instruction file
- Doctor command validates provider runtime and displays provider name

### bin/isdlc.js (unchanged)

Entry point remains unchanged. All provider logic lives in lib/cli.js.

## Dependencies

- **REQ-0134** — Claude ProviderRuntime adapter
- **REQ-0135** — Codex ProviderRuntime adapter
- **REQ-0136** — Provider instruction generation

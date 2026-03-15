# Configurable Session Cache Token Budget

Replace hardcoded 128K char warning and 5K external skill truncation in `rebuildSessionCache()` (common.cjs) with project-configurable limits, supporting up to 200-300K tokens for 1M context windows.

## Current State
- `rebuildSessionCache()` has a hardcoded 128K character warning threshold (line 4409 of common.cjs)
- External skill content is truncated at 5K characters (line 4292)
- No per-section budgets — all sections are included at full size
- Current cache for the dogfooding project is ~170K chars (~4,352 lines)
- With 1M context windows now available, these limits are unnecessarily conservative

## Desired State
- Limits configurable via a config file (e.g., `.isdlc/cache-config.json` or section in `process.json`)
- Total cache budget configurable up to 200-300K tokens
- Per-section limits configurable (some sections more important than others)
- External skill truncation limit configurable
- Sensible defaults that work for both small projects and large frameworks like iSDLC itself
- Backward compatible — existing projects with no config get current behavior

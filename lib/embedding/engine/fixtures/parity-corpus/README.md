# Parity Corpus

Pinned fixture corpus for the graph-optimization parity test
(`graph-optimization-parity.test.js`).

## Purpose

Provide a deterministic, reproducible set of real multi-language chunks for
the cosine-similarity regression gate on `graphOptimizationLevel` flipping
from `"disabled"` to `"all"`.

## Contents

- `corpus.json` — single JSON file with an array of `{id, language, content}`
  entries. See §7.1 of `test-strategy.md` for the full format decision.

## Why a committed fixture?

- Fully deterministic — no runtime chunker invocation in the parity test
- Diff-able in code review
- Single file to pin (single SHA-256 captured in the test)

## Source

Real code chunks from the iSDLC framework and common library idioms across
JavaScript/TypeScript, Python, Go, Rust, Markdown, YAML, and shell. Each
chunk has a stable numeric ID that test failures quote to pinpoint the
offending vector.

## Distribution

- ~100 chunks total
- Short (~200-500 chars): ~30
- Medium (~500-1000 chars): ~45
- Long (~1000-2000 chars): ~25
- Languages: JS/TS ~35, Python ~20, Go ~15, Rust ~15, Markdown ~10, Other ~5

## Adding/modifying chunks

Re-pin the SHA-256 in `graph-optimization-parity.test.js` when this
corpus changes. Tests will fail until the pinned hash is updated.

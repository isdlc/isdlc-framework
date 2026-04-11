# Root Cause Summary: BUG-GH-250

**Confidence**: HIGH

`hasUserEmbeddingsConfig()` was added as part of REQ-GH-239 (FR-006) but adoption was incomplete. Only the two finalize-path call sites were retrofitted; the four pre-existing embedding entry points continued using the legacy `cfg?.embeddings || {}` defensive-read idiom from before FR-006 was specified.

The `|| {}` fall-through idiom is semantically incompatible with FR-006: it erases the distinction between `cfg.embeddings === undefined` (opt-out, per FR-006) and `cfg.embeddings === {}` (opt-in with defaults). All four violating sites share this exact pattern.

**Fix direction**: surgical per-site guards using the canonical `hasUserEmbeddingsConfig(projectRoot)` primitive. No architectural changes, no new abstractions.

See `root-cause-analysis.md` for full ranked hypotheses, execution paths, and blast radius.

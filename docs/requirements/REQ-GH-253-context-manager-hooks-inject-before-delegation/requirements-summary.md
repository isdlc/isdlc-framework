# Requirements Summary: REQ-GH-253

**Problem**: LLM cognitive load during analyze + bug-gather roundtables causes inconsistent rule adherence — semantic search missed, templates wrong, confirmations collapsed, conversation style drifts. "Inject more text" has diminishing returns (BUG-0028 evidence).

**Design Principle**: preserve specification fidelity while reducing LLM recall load. Every prose cut must be matched by a mechanism.

**8 Must-Have FRs**: Two-layer affordance model (state card + task card), state-machine-driven composition (core + workflow-specific definitions), hybrid rolling state updates (LLM trailer + handler markers), skills at background-task granularity (reuse REQ-0022), provider parity (core in src/core/), boundary (analyze + bug-gather only), bucketed simplification audit, phased migration with parallel runs.

**5 NFRs**: Fail-open everywhere, provider parity, 200ms performance budget, observability, specification fidelity preservation.

**59 tasks across 4 phases** (05/06/16/08). Critical path: schemas -> core modules -> handler restructure -> parallel runs -> audit -> code review.

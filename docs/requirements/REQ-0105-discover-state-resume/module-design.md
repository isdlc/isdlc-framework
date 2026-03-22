# Module Design: REQ-0105 — Discover State/Resume

## discover-state-schema.js
Frozen schema object defining all discover state fields with types and defaults.
Functions: createInitialDiscoverState(mode, depth), computeResumePoint(state), isDiscoverComplete(state), markStepComplete(state, stepId).

Known resume limitations constant: RESUME_LIMITATIONS (frozen array of { step_type, behavior, reason }).

~80 lines.

# Transparent Critic/Refiner at Analysis Step Boundaries

**Source**: GitHub #22
**Type**: Enhancement
**Complexity**: Medium
**Dependencies**: #20 (roundtable agent — completed)

## Problem

The existing Creator/Critic/Refiner debate loop runs invisibly. Users don't see improvements and can't validate them. This erodes trust and misses opportunities for user input on refinements.

## Design

At each step boundary (after BA finishes requirements, after Architect finishes architecture, after Designer finishes design):

1. Critic reviews draft artifacts (runs in background)
2. Refiner improves based on critique (runs in background)
3. Roundtable agent presents improvements transparently: "My team reviewed this and suggested some improvements:"
4. Shows what changed, why, and the updated version
5. User menu: `[A] Accept` / `[M] Modify` / `[R] Reject — keep original` / `[E] Elaboration Mode` / `[C] Continue`

### Key principle

Nothing hidden. The team's work is surfaced as "team feedback" within the persona's natural voice. The agent says "my team suggested..." — maintaining the roundtable metaphor.

## Backlog Reference

Item 16.4 in BACKLOG.md

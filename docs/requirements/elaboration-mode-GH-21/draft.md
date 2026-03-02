# Elaboration Mode — Multi-Persona Roundtable Discussions

**Source**: GitHub Issue #21
**Source ID**: GH-21
**Category**: Enhancement

## Summary

At any step during analyze, the user can enter Elaboration Mode to bring all personas into a focused roundtable discussion on the current topic.

## Problem

Some topics need deeper exploration than a single persona can provide. Architecture tradeoffs, complex requirements, and cross-cutting concerns benefit from multiple perspectives debating in real time.

## Design

- User selects `[E] Elaboration Mode` at any analysis step
- All three personas (BA, Architect, Designer) plus the user participate as equals
- Personas discuss, debate, and build on each other's points naturally
- Cross-talk enabled: "As the Architect mentioned, if subscriptions are coming later..."
- User can address specific personas by name or ask the group
- Exit returns to the step workflow with enriched context applied to artifacts
- Focused on the current analysis topic, not freeform — personas stay in character and on topic

## Dependencies

- #20 (roundtable agent with personas must exist first)

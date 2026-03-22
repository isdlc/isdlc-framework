# Architecture Overview — REQ-0136 Provider instruction generation

**ADR**: ADR-CODEX-037

## Components

### src/core/orchestration/instruction-generator.js (~150 lines)

Single module responsible for generating provider-specific system instruction files.

- Consumes content classifications from Phase 5 (agent-classification role_spec sections)
- Produces text content; the provider installer writes the file to disk
- Exports `generateInstructions()`, `getInstructionPath()`, `listSupportedProviders()`, and `INSTRUCTION_TEMPLATES`
- Template registry is a frozen map — immutable at runtime

## Dependencies

- **REQ-0128** — ProviderRuntime interface contract
- **REQ-0099 to REQ-0102** — Phase 5 content classifications (agent-classification, skill manifest, constitution)

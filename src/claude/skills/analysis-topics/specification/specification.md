---
topic_id: "specification"
topic_name: "Specification"
primary_persona: "system-designer"
contributing_personas:
  - "solutions-architect"
coverage_criteria:
  - "Module boundaries defined with single responsibility per module"
  - "At least 1 interface contract specified with concrete types"
  - "Data flow documented with source-to-sink tracing"
  - "Error taxonomy defined with codes, severity, and recovery"
  - "No circular dependencies between modules"
  - "Design review confirms consistency with architecture"
artifact_sections:
  - artifact: "module-design.md"
    sections: ["all"]
  - artifact: "interface-spec.md"
    sections: ["all"]
  - artifact: "data-flow.md"
    sections: ["all"]
  - artifact: "error-taxonomy.md"
    sections: ["all"]
  - artifact: "design-summary.md"
    sections: ["all"]
depth_guidance:
  brief:
    behavior: "Define module boundaries and key public interfaces only. Infer internal structure from codebase conventions."
    acceptance: "Module boundaries identified with single responsibility. At least 1 interface contract specified."
    inference_policy: "Infer data flow, error handling, and internal module structure from existing codebase patterns. Tag inferences as Medium confidence."
  standard:
    behavior: "Full module design with interfaces, data flow, and error taxonomy. Validate consistency with architecture."
    acceptance: "All coverage criteria met. Interfaces have concrete types. Error paths defined for every interface."
    inference_policy: "Infer only error recovery strategies and internal data transformations. Tag inferences as Medium confidence."
  deep:
    behavior: "Exhaustive specification including error taxonomy, design review, and implementation readiness assessment."
    acceptance: "All coverage criteria met with exhaustive detail. Design review confirms consistency. No open questions."
    inference_policy: "Minimize inference. Specify every interface, error path, and data flow explicitly. Only infer low-risk internal details."
source_step_files:
  - "04-01"
  - "04-02"
  - "04-03"
  - "04-04"
  - "04-05"
---

## Analytical Knowledge

### Module Design

- Identify all modules or components: name, responsibility (single responsibility principle)
- Define boundaries: what data crosses each boundary, in what format
- Map dependencies between modules (no circular dependencies)
- Define data structure ownership: which module owns which data
- For each module: public interface (function signatures), internal state, estimated size
- Consider testability: how will each module be tested in isolation?

### Interface Contracts

- For each public interface: function name, parameters with types, return type, error types
- Define data structure schemas with field-level constraints (type, required, default, validation rules)
- Provide request/response examples: valid inputs, expected outputs, error outputs
- Define validation rules at each boundary
- Specify error communication across interfaces
- Consider backward compatibility for public APIs

### Data Flow Specification

- Trace every data path from source to sink
- Identify state mutation points and their readers
- Document data transformations at each stage
- Define persistence boundaries (what is stored, what is transient)
- Document session management (what persists across sessions)
- Identify concurrency considerations (shared state, race conditions)

### Error Handling Design

- Create error taxonomy table: code, description, trigger condition, severity (info/warning/error/fatal), recovery action
- Define error propagation strategy: throw, collect, log-and-continue
- Specify graceful degradation: what still works when X fails
- Define user-facing error messages: factual, not in-persona, actionable
- Consider error aggregation and reporting

### Design Review

- Check consistency with architecture decisions (ADRs)
- Verify implementability: can a developer build this from the spec?
- Inventory open questions that need resolution before implementation
- Check that all error paths have recovery strategies
- Verify no circular dependencies
- Confirm all interfaces have concrete types (no untyped parameters)

## Validation Criteria

- Each module has single responsibility (not doing two unrelated things)
- No circular dependencies between modules
- Interfaces have concrete types (no `any`, no untyped parameters)
- Error paths defined for every interface
- Design is consistent with architecture decisions
- A developer can implement from these specs without further clarification

## Artifact Instructions

- **module-design.md**: Module name, responsibility, public interface (signatures), data structures, dependencies, estimated size
- **interface-spec.md**: Interface contracts with signatures, types, validation rules, examples
- **data-flow.md**: Source-to-sink data flow, state mutations, transformations, persistence boundaries
- **error-taxonomy.md**: Error code table (code, description, trigger, severity, recovery), graceful degradation levels
- **design-summary.md**: Executive summary, cross-check results, open questions, implementation readiness

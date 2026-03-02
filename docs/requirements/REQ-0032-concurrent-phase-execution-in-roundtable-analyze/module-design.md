# Module Design: Concurrent Phase Execution in Roundtable Analyze

**Source**: GH-63
**Date**: 2026-02-21
**Status**: Draft
**Traces**: ADR-001, ADR-002, ADR-003, ADR-004, ADR-005, ADR-006

---

## 1. Module Overview

The concurrent analysis system comprises 5 modules: 1 lead orchestrator, 3 persona files, and a topic file collection. Each module is a markdown file (or directory of markdown files) that serves as agent instructions for Claude Code.

```
Module 1: roundtable-lead.md        (Orchestration, conversation flow, coverage tracking)
Module 2: persona-business-analyst.md (Maya Chen -- problem discovery, requirements)
Module 3: persona-solutions-architect.md (Alex Rivera -- technical analysis, architecture)
Module 4: persona-system-designer.md (Jordan Park -- specifications, design)
Module 5: analysis-topics/           (Topic files -- analytical knowledge library)
```

### Module Dependency Diagram

```
isdlc.md (dispatcher)
    |
    | Single dispatch (IP-1)
    v
roundtable-lead.md ----reads----> persona-business-analyst.md
    |                  |--------> persona-solutions-architect.md
    |                  |--------> persona-system-designer.md
    |                  |--------> analysis-topics/**/*.md
    |
    +--- writes --> docs/requirements/{slug}/ (artifacts)
    +--- writes --> docs/requirements/{slug}/meta.json (progress)
```

In agent teams mode, the "reads" arrows become "spawns" arrows (IP-3 replaces IP-2).

---

## 2. Module 1: roundtable-lead.md

### 2.1 Responsibility

Thin orchestrator. Owns the conversation lifecycle from dispatch to finalization. Does NOT contain persona behavior, analytical knowledge, or artifact content generation logic. The lead's job is:
- Frame the conversation opening
- Track topic coverage
- Evaluate information thresholds for artifact readiness
- Coordinate persona contributions at natural conversation breaks
- Manage meta.json progress
- Trigger cross-check before finalization
- Handle early exit and completion

### 2.2 YAML Frontmatter

```yaml
---
name: roundtable-lead
description: "Lead orchestrator for concurrent roundtable analysis. Coordinates three persona agents (Maya, Alex, Jordan) in a unified conversation. Reads persona files at startup (single-agent) or spawns them as teammates (agent teams). Tracks topic coverage and triggers progressive artifact writes."
model: opus
owned_skills: []
---
```

### 2.3 Section Layout

```
# Roundtable Lead Orchestrator

## 1. Execution Modes
  ### 1.1 Single-Agent Mode (Default)
  ### 1.2 Agent Teams Mode (Opt-In)
  ### 1.3 Mode Detection

## 2. Conversation Protocol
  ### 2.1 Opening (First Turn)
  ### 2.2 Conversation Flow Rules
  ### 2.3 Persona Contribution Batching
  ### 2.4 Natural Language Steering
  ### 2.5 Completion Detection
  ### 2.6 Early Exit Handling

## 3. Coverage Tracker
  ### 3.1 Topic Registry Initialization
  ### 3.2 Coverage State Structure
  ### 3.3 Coverage Update Rules
  ### 3.4 Steering Strategy

## 4. Information Threshold Engine
  ### 4.1 Threshold Definitions Per Artifact Type
  ### 4.2 Readiness Evaluation
  ### 4.3 Progressive Write Triggers
  ### 4.4 Conservative Threshold Policy

## 5. Artifact Coordination
  ### 5.1 Ownership Partitioning
  ### 5.2 Progressive Write Protocol
  ### 5.3 Cross-Check Protocol (FR-012)
  ### 5.4 Confidence Indicator Assignment

## 6. File Discovery Abstraction
  ### 6.1 Mode 1: Step Files (Interim)
  ### 6.2 Mode 2: Topic Files (Final)
  ### 6.3 Switchover Protocol

## 7. Agent Teams Coordination
  ### 7.1 Teammate Spawn Protocol
  ### 7.2 Message Handling
  ### 7.3 Artifact Merge Protocol
  ### 7.4 Failure Recovery (ADR-006)

## 8. Meta.json Protocol
  ### 8.1 Read on Startup
  ### 8.2 Progressive Updates
  ### 8.3 Finalization Write

## 9. Constraints
```

### 2.4 Internal State (Tracked in Memory, Not Persisted)

The lead maintains these data structures in its working memory during a conversation. They are NOT written to disk except via meta.json at defined checkpoints.

```typescript
// Coverage tracker state -- one entry per topic
interface TopicCoverage {
  topic_id: string;             // e.g., "problem-discovery"
  topic_name: string;           // e.g., "Problem Discovery"
  coverage_pct: number;         // 0-100, estimated by lead
  confidence: "high" | "medium" | "low";
  last_discussed_turn: number;  // conversation turn number
  coverage_criteria_met: string[]; // which criteria from topic file are satisfied
  coverage_criteria_total: string[]; // all criteria from topic file
}

// Information threshold state -- one entry per artifact type
interface ArtifactReadiness {
  artifact_type: string;        // e.g., "requirements-spec"
  owner: string;                // persona key: "business-analyst", "solutions-architect", "system-designer"
  status: "pending" | "ready" | "written" | "updated" | "finalized";
  threshold_met: boolean;       // true when enough info gathered
  write_count: number;          // how many times written (progressive updates)
  last_write_turn: number;      // turn number of last write
  blocking_topics: string[];    // topic_ids that must be covered before first write
}

// Conversation state
interface ConversationState {
  turn_number: number;
  active_persona: string;       // who is currently leading the thread
  pending_contributions: PendingContribution[]; // batched persona observations
  user_expertise_signal: "business" | "technical" | "balanced" | "unknown";
  completion_suggested: boolean;
  early_exit: boolean;
}

interface PendingContribution {
  persona: string;
  content: string;
  relevance_to_current_thread: "high" | "medium" | "low";
  turn_queued: number;
}
```

### 2.5 Public Interface (What the Lead Exposes to isdlc.md)

The lead is invoked via a single Task delegation. Its "public interface" is the dispatch prompt format it expects and the artifacts it produces.

**Input**: Dispatch prompt from isdlc.md (see Module Design Section 7 -- Dispatch Prompt Spec)
**Output**: Written artifacts in `docs/requirements/{slug}/`, updated meta.json

### 2.6 Dependencies

| Dependency | Type | Purpose |
|------------|------|---------|
| persona-business-analyst.md | Read (single-agent) or Spawn (agent teams) | Maya's identity, voice, and artifact responsibilities |
| persona-solutions-architect.md | Read (single-agent) or Spawn (agent teams) | Alex's identity, voice, and artifact responsibilities |
| persona-system-designer.md | Read (single-agent) or Spawn (agent teams) | Jordan's identity, voice, and artifact responsibilities |
| analysis-topics/**/*.md | Read | Coverage criteria, analytical knowledge |
| docs/requirements/{slug}/draft.md | Read (via dispatch prompt) | Prior intake content |
| docs/requirements/{slug}/meta.json | Read + Write | Progress tracking |
| docs/requirements/{slug}/*.md | Write | Artifact output |

### 2.7 Estimated Size

~250-300 lines. The lead is thin: orchestration rules, coverage tracker logic, threshold definitions, and coordination protocols. No persona behavior, no analytical questions, no artifact content templates.

---

## 3. Module 2: persona-business-analyst.md

### 3.1 Responsibility

Fully self-contained persona file for Maya Chen. Owns problem discovery, user needs analysis, requirements definition, and prioritization. Produces requirements-spec.md, user-stories.json, and traceability-matrix.csv. Can operate as a standalone agent teams spawn prompt or as a supplement read by the lead in single-agent mode.

### 3.2 YAML Frontmatter

```yaml
---
name: persona-business-analyst
description: "Maya Chen, Business Analyst persona for roundtable analysis. Owns problem discovery, requirements definition, and prioritization. Produces requirements-spec.md, user-stories.json, and traceability-matrix.csv."
model: opus
owned_skills: []
---
```

### 3.3 Section Layout

```
# Maya Chen -- Business Analyst

## 1. Identity
  - Name, role, communication style
  - Opening line: "I'm Maya, your Business Analyst..."

## 2. Principles
  - Understand before solving
  - Surface the unstated
  - Validate with examples
  - Prioritize ruthlessly

## 3. Voice Integrity Rules
  - DO: Ground discussion in user needs, ask "why" and "what if", challenge solutions lacking user benefit, summarize agreement and tension, use acceptance criteria language
  - DO NOT: Use technical jargon unprompted, propose implementations, specify function signatures, evaluate system-wide tradeoffs
  - Anti-blending rule: Stay silent rather than echo another persona

## 4. Analytical Approach
  ### 4.1 Problem Discovery
    - Business context probing (what, why, who benefits)
    - Stakeholder identification and mapping
    - Current state and pain point analysis
    - Success metrics and acceptance thresholds
  ### 4.2 User Needs Analysis
    - User type identification (primary, secondary, automated)
    - Workflow mapping (current vs desired)
    - Pain point articulation (user behavior terms, not technical)
    - Edge cases in user journeys
  ### 4.3 Requirements Definition
    - FR-NNN format with AC-NNN-NN acceptance criteria
    - Testable, observable behavior (not implementation)
    - Boundary conditions (min/max, empty states, error states)
    - Dependency mapping between requirements
  ### 4.4 Prioritization
    - MoSCoW framework
    - Challenge inflated priorities with "What happens if we ship without this?"
    - Minimum viable requirement set identification

## 5. Interaction Style
  ### 5.1 With User
    - Opens naturally, not with numbered lists
    - Acknowledges what she already knows from draft
    - Probes organically (one focus question per turn, follow-ups as conversation flows)
    - Summarizes what she heard before moving forward
  ### 5.2 With Alex and Jordan
    - Hands off to Alex when technical decisions surface
    - Asks Jordan for specificity when requirements need precision
    - Receives codebase findings from Alex, translates to requirement implications
  ### 5.3 Adapting to User Type
    - Product owner: Lean into business context, shield from technical questions
    - Developer/Architect: Efficient requirements capture, acknowledge their technical input
    - Team lead: Focus on completeness and handoff quality

## 6. Artifact Responsibilities
  ### 6.1 requirements-spec.md
    - Owner: Maya (sole writer)
    - Sections: Business Context, Stakeholders, User Journeys, Technical Context, Quality/Risk, Functional Requirements, Out of Scope, MoSCoW
    - Progressive write: First write after problem discovery and core FRs defined. Updates as conversation adds requirements.
    - Self-describing: Each section indicates coverage level. "Sections not yet written" listed at bottom.
  ### 6.2 user-stories.json
    - Owner: Maya (sole writer)
    - Format: Array of { id, title, story, acceptance_criteria[], priority, traces[] }
    - Progressive write: First write after FR definition. Updated as FRs are refined.
  ### 6.3 traceability-matrix.csv
    - Owner: Maya (sole writer)
    - Format: FR_ID, AC_ID, User_Story_ID, Confidence, Source
    - Written once near end of Maya's analysis (requires FRs and user stories to exist)

## 7. Self-Validation Protocol
  - Before writing: Verify FRs have testable ACs, no vague requirements, priorities assigned
  - Before finalization: Verify all user types have journeys, out-of-scope is explicit, MoSCoW is complete

## 8. Artifact Folder Convention
  - All artifacts written to: docs/requirements/{slug}/
  - {slug} provided in dispatch prompt or spawn prompt context
  - Each write produces a COMPLETE file (not append). Previous version replaced entirely.
  - File must be self-describing: reader can determine what has been covered and what remains.

## 9. Meta.json Protocol (Agent Teams Mode)
  - Maya does NOT write meta.json directly
  - Reports progress to lead via agent teams messaging: { "type": "progress", "persona": "business-analyst", "artifact": "requirements-spec.md", "status": "written|updated", "coverage_summary": "..." }
  - Lead writes meta.json based on persona reports

## 10. Constraints
  - No state.json writes
  - No branch creation
  - Single-line Bash commands only
  - No framework internals (hooks, common.cjs, workflows.json)
```

### 3.4 Data Structures Owned

```typescript
// requirements-spec.md internal structure (rendered as markdown)
interface RequirementsSpec {
  business_context: {
    problem_statement: string;
    stakeholders: string[];
    success_metrics: string[];
    driving_factors: string[];
  };
  personas: Array<{
    role: string;
    goals: string[];
    pain_points: string[];
    proficiency: string;
    key_tasks: string[];
  }>;
  user_journeys: Array<{
    name: string;
    entry_point: string;
    flow: string[];
    exit_point: string;
  }>;
  technical_context: {
    constraints: string[];
    integration_points: string[];
    conventions: string[];
  };
  quality_attributes: Array<{
    attribute: string;
    priority: string;
    threshold: string;
  }>;
  risks: Array<{
    risk: string;
    likelihood: string;
    impact: string;
    mitigation: string;
  }>;
  functional_requirements: Array<{
    id: string;           // FR-NNN
    title: string;
    description: string;
    confidence: "high" | "medium" | "low";
    acceptance_criteria: Array<{
      id: string;         // AC-NNN-NN
      description: string;
    }>;
  }>;
  out_of_scope: Array<{
    item: string;
    reason: string;
    dependency: string;
  }>;
  moscow: Array<{
    fr_id: string;
    title: string;
    priority: "Must Have" | "Should Have" | "Could Have" | "Won't Have";
    rationale: string;
  }>;
}

// user-stories.json structure
interface UserStory {
  id: string;
  title: string;
  story: string;        // "As a {role}, I want {action} so that {benefit}"
  acceptance_criteria: string[];
  priority: "Must Have" | "Should Have" | "Could Have" | "Won't Have";
  traces: string[];      // FR-NNN references
}

// traceability-matrix.csv columns
// FR_ID, AC_ID, User_Story_ID, Confidence, Source
```

### 3.5 Estimated Size

~180-200 lines. Fully self-contained. Includes all analytical knowledge from current step files 01-01 through 01-08 (business context, user needs, UX journey, technical context, quality/risk, feature definition, user stories, prioritization), reorganized by analytical concern rather than step sequence.

---

## 4. Module 3: persona-solutions-architect.md

### 4.1 Responsibility

Fully self-contained persona file for Alex Rivera. Owns codebase analysis, impact assessment, architecture options, technology decisions, and integration design. Produces impact-analysis.md and architecture-overview.md. Performs the silent codebase scan (FR-002). Can operate as a standalone agent teams spawn prompt or as a supplement read by the lead.

### 4.2 YAML Frontmatter

```yaml
---
name: persona-solutions-architect
description: "Alex Rivera, Solutions Architect persona for roundtable analysis. Owns codebase analysis, impact assessment, architecture options, and technology decisions. Produces impact-analysis.md and architecture-overview.md."
model: opus
owned_skills: []
---
```

### 4.3 Section Layout

```
# Alex Rivera -- Solutions Architect

## 1. Identity
  - Name, role, communication style
  - Opening line: "I'm Alex, your Solutions Architect..."

## 2. Principles
  - Map before building
  - Options over opinions
  - Simplest viable architecture
  - Risk-aware decisions

## 3. Voice Integrity Rules
  - DO: Assess feasibility and risk, present tradeoff options, bridge requirements to architecture, name risks explicitly, use ADR language
  - DO NOT: Focus on UI aesthetics, write acceptance criteria, specify function signatures, ask open-ended technical questions to the user, discuss business value
  - Anti-blending rule: Stay silent rather than echo another persona

## 4. Analytical Approach
  ### 4.1 Codebase Scan (Silent -- FR-002)
    - Keyword searches from draft content
    - File count and module distribution
    - Pattern identification (naming conventions, module structure, integration patterns)
    - Dependency mapping
    - Run during first processing turn, no user-visible messaging
  ### 4.2 Impact Assessment
    - Blast radius: Tier 1 (direct), Tier 2 (transitive), Tier 3 (side effects)
    - Entry points: Where to start implementation
    - Risk zones: Areas of highest change risk
    - File count breakdown: new, modify, test, config, docs
  ### 4.3 Architecture Options
    - Present at least 2 options for each significant decision
    - Each option: summary, pros, cons, existing pattern alignment, verdict
    - ADR format for each selected option (Status, Context, Decision, Rationale, Consequences)
  ### 4.4 Technology Decisions
    - New dependencies assessment (prefer zero)
    - Version compatibility
    - Alternatives considered with rationale
  ### 4.5 Integration Design
    - Integration point table: Source, Target, Interface, Data Format, Error Handling
    - Data flow: Input -> Processing -> Output for the full system
    - Synchronization model (single-agent vs agent teams considerations)

## 5. Interaction Style
  ### 5.1 With User
    - Contributes observations, not questions (FR-010)
    - When decisions surface: present options with a stated recommendation and reasoning
    - User can accept, choose differently, or ask for more detail
    - If user provides no input on recommendation, proceed with recommended option
  ### 5.2 With Maya
    - Translates Maya's requirements into technical implications
    - Flags requirements that are technically infeasible or have hidden complexity
    - Provides codebase evidence for scope estimates
  ### 5.3 With Jordan
    - Provides architectural context for Jordan's specifications
    - Flags design choices that conflict with architecture decisions
    - Ensures Jordan's interfaces align with the integration design
  ### 5.4 Contribution Batching
    - Observations are batched and presented at natural conversation breaks
    - Never interrupts the current thread between Maya and the user
    - Prefaces contributions with codebase evidence: "I can see from the codebase that..."

## 6. Artifact Responsibilities
  ### 6.1 impact-analysis.md
    - Owner: Alex (sole writer)
    - Sections: Blast Radius (3 tiers), Entry Points, Implementation Order, Risk Zones, Summary
    - Progressive write: First write after codebase scan and initial impact mapping. Updated as conversation reveals new impact areas.
    - Self-describing: Blast radius tables include "TBD" markers for areas not yet assessed.
  ### 6.2 architecture-overview.md
    - Owner: Alex (sole writer)
    - Sections: Architecture Options, Selected Architecture (ADRs), Technology Decisions, Integration Architecture, Summary
    - Progressive write: First write after architecture options evaluated. Updated as decisions are made.
    - Self-describing: ADRs have explicit Status field. "Proposed" = pending user input. "Accepted" = confirmed.

## 7. Self-Validation Protocol
  - Before writing: Verify blast radius covers all 3 tiers, at least 2 options per decision, risks have mitigations
  - Before finalization: Verify ADR statuses are all "Accepted" (not "Proposed"), integration points are complete, implementation order is dependency-consistent

## 8. Artifact Folder Convention
  (Same as Maya -- Section 3.3 item 8)

## 9. Meta.json Protocol (Agent Teams Mode)
  (Same pattern as Maya -- report progress to lead, lead writes meta.json)

## 10. Constraints
  (Same as Maya)
```

### 4.4 Data Structures Owned

```typescript
// impact-analysis.md internal structure (rendered as markdown)
interface ImpactAnalysis {
  blast_radius: {
    tier1_direct: Array<{
      file: string;
      module: string;
      change_type: "new" | "modify" | "delete";
      traces: string[];
    }>;
    tier2_transitive: Array<{
      file: string;
      module: string;
      impact: string;
      change_type: string;
    }>;
    tier3_side_effects: Array<{
      area: string;
      impact: string;
      risk_level: "low" | "medium" | "high";
    }>;
    summary: {
      direct_modifications: number;
      new_files: number;
      restructured_files: number;
      transitive_modifications: number;
      total_affected: number;
    };
  };
  entry_points: {
    recommended_start: string;
    rationale: string;
  };
  implementation_order: Array<{
    order: number;
    frs: string[];
    description: string;
    risk: string;
    parallel: boolean;
    depends_on: string[];
  }>;
  risk_zones: Array<{
    id: string;
    risk: string;
    area: string;
    likelihood: string;
    impact: string;
    mitigation: string;
  }>;
}

// architecture-overview.md internal structure (rendered as markdown)
interface ArchitectureOverview {
  options: Array<{
    name: string;
    summary: string;
    pros: string[];
    cons: string[];
    existing_pattern_alignment: string;
    verdict: "Selected" | "Eliminated";
  }>;
  adrs: Array<{
    id: string;        // ADR-NNN
    title: string;
    status: "Proposed" | "Accepted" | "Superseded";
    context: string;
    decision: string;
    rationale: string;
    consequences: string[];
  }>;
  technology_decisions: Array<{
    technology: string;
    version: string;
    rationale: string;
    alternatives_considered: string[];
  }>;
  integration: {
    points: Array<{
      id: string;
      source: string;
      target: string;
      interface_type: string;
      data_format: string;
      error_handling: string;
    }>;
    data_flow: string;           // text-based diagram
    synchronization_model: string;
  };
}
```

### 4.5 Estimated Size

~200-220 lines. Fully self-contained. Includes all analytical knowledge from current step files across phases 00 (codebase scan), 02 (impact analysis), and 03 (architecture). The codebase scan knowledge from 00-02/00-03 moves here because it is Alex's work, not Maya's, in the concurrent model.

---

## 5. Module 4: persona-system-designer.md

### 5.1 Responsibility

Fully self-contained persona file for Jordan Park. Owns module design, interface contracts, data flow specifications, error handling design, and design review. Produces module-design files, interface-spec.md, data-flow.md, error-taxonomy.md, and design-summary.md. Can operate as a standalone agent teams spawn prompt or as a supplement read by the lead.

### 5.2 YAML Frontmatter

```yaml
---
name: persona-system-designer
description: "Jordan Park, System Designer persona for roundtable analysis. Owns module design, interface contracts, data flow, error handling, and design review. Produces design specification files."
model: opus
owned_skills: []
---
```

### 5.3 Section Layout

```
# Jordan Park -- System Designer

## 1. Identity
  - Name, role, communication style
  - Opening line: "I'm Jordan, your System Designer..."

## 2. Principles
  - Precision over prose
  - Design for testability
  - Error paths first
  - Minimize coupling

## 3. Voice Integrity Rules
  - DO: Translate to concrete specifications, specify function signatures and data structures, flag abstractions that need concretization, raise error handling proactively, use contract language
  - DO NOT: Ask discovery questions (that's Maya's job), evaluate system-wide tradeoffs (that's Alex's job), discuss business value
  - Anti-blending rule: Stay silent rather than echo another persona

## 4. Analytical Approach
  ### 4.1 Module Design
    - Module identification: name, responsibility (single responsibility principle)
    - Boundary definition: what crosses each boundary, in what format
    - Dependency diagram: no circular dependencies
    - Data structure ownership: which module owns which data
  ### 4.2 Interface Contracts
    - Function signatures with concrete types (input, return, error)
    - Data structure schemas with field-level constraints
    - Request/response examples (valid and invalid)
    - Validation rules at each boundary
    - Error communication across interfaces
  ### 4.3 Data Flow Specification
    - Source-to-sink tracing for every data path
    - State mutation points and readers
    - Data transformations at each stage
    - Persistence and session considerations
  ### 4.4 Error Handling Design
    - Error taxonomy: code, description, trigger, severity, recovery
    - Error propagation strategy (throw, collect, log-and-continue)
    - Graceful degradation specification
    - User-facing error messages
  ### 4.5 Design Review
    - Consistency check against architecture
    - Implementability assessment
    - Open questions inventory

## 5. Interaction Style
  ### 5.1 With User
    - Flags design considerations when conversation reaches sufficient specificity
    - Presents concrete specifications, not questions
    - When decisions surface in the design domain: states the specification and asks for confirmation
  ### 5.2 With Maya
    - Requests precision when requirements are too vague for specification
    - Translates requirements into concrete interfaces
    - Validates that specifications match intent
  ### 5.3 With Alex
    - Takes architectural decisions as input constraints
    - Validates that design is consistent with architecture
    - Raises concerns if architecture decisions create design problems
  ### 5.4 Contribution Batching
    - Contributions are batched at natural conversation breaks
    - Prefaces contributions with the specification context: "Based on what we've discussed, the interface for X would be..."

## 6. Artifact Responsibilities
  ### 6.1 module-design.md (or module-design-{name}.md per major module)
    - Owner: Jordan (sole writer)
    - Content: Module name, responsibility, public interface, data structures, dependencies
    - Progressive write: First write after architecture decisions are firm and core modules identified.
  ### 6.2 interface-spec.md
    - Owner: Jordan (sole writer)
    - Content: All public interface contracts with signatures, types, examples
    - Progressive write: First write after module boundaries are defined. Updated as interfaces are refined.
  ### 6.3 data-flow.md
    - Owner: Jordan (sole writer)
    - Content: Data flow documentation, state management, persistence
    - Progressive write: First write after data paths are identified from architecture.
  ### 6.4 error-taxonomy.md
    - Owner: Jordan (sole writer)
    - Content: Error code table, recovery strategies, validation rules
    - Progressive write: First write after interface contracts are defined (errors flow from interfaces).
  ### 6.5 design-summary.md
    - Owner: Jordan (sole writer)
    - Content: Executive summary of all design decisions, open questions
    - Written once at finalization (depends on all other design artifacts).

## 7. Self-Validation Protocol
  - Before writing: Verify modules have single responsibility, no circular dependencies, interfaces have concrete types
  - Before finalization: Verify design is consistent with architecture, all error paths handled, open questions documented

## 8. Artifact Folder Convention
  (Same as Maya -- Section 3.3 item 8)

## 9. Meta.json Protocol (Agent Teams Mode)
  (Same pattern as Maya)

## 10. Constraints
  (Same as Maya)
```

### 5.4 Data Structures Owned

```typescript
// Design artifacts -- Jordan produces structured markdown,
// these types represent the logical structure

interface ModuleDesign {
  name: string;
  responsibility: string;
  public_interface: Array<{
    name: string;
    signature: string;       // full signature with types
    description: string;
    error_conditions: string[];
  }>;
  internal_state: Array<{
    name: string;
    type: string;
    description: string;
    mutated_by: string[];
    read_by: string[];
  }>;
  data_structures: Array<{
    name: string;
    fields: Array<{
      name: string;
      type: string;
      constraints: string;
      default: string;
    }>;
  }>;
  dependencies: string[];
}

interface InterfaceContract {
  interface_id: string;
  module: string;
  function_name: string;
  parameters: Array<{
    name: string;
    type: string;
    required: boolean;
    constraints: string;
  }>;
  return_type: string;
  error_types: string[];
  side_effects: string[];
  examples: Array<{
    description: string;
    input: string;
    output: string;
  }>;
}

interface ErrorEntry {
  code: string;
  description: string;
  trigger: string;
  severity: "info" | "warning" | "error" | "fatal";
  recovery: string;
  user_message: string;
}
```

### 5.5 Estimated Size

~180-200 lines. Fully self-contained. Includes all analytical knowledge from current step files 04-01 through 04-05 (module design, interface contracts, data flow, error handling, design review).

---

## 6. Module 5: analysis-topics/

### 6.1 Responsibility

Library of topic files containing analytical knowledge. Each topic file is a reference document, not an execution script. Personas and the lead consult topic files for:
- What questions to explore in each knowledge domain
- What validation criteria define "adequately covered"
- What artifact sections correspond to each topic

### 6.2 Directory Structure

The 24 step files consolidate into 5 topic directories with merged files. No analytical knowledge is lost; it is reorganized by knowledge domain.

```
src/claude/skills/analysis-topics/
  problem-discovery/
    problem-discovery.md          (from: 00-01, 01-01, 01-02, 01-03)
  requirements/
    requirements-definition.md    (from: 01-04, 01-05, 01-06, 01-07, 01-08)
  technical-analysis/
    technical-analysis.md         (from: 00-02, 00-03, 02-01, 02-02, 02-03, 02-04)
  architecture/
    architecture.md               (from: 03-01, 03-02, 03-03, 03-04)
  specification/
    specification.md              (from: 04-01, 04-02, 04-03, 04-04, 04-05)
  security/
    security.md                   (NEW -- FR-009 AC-009-04)
```

### 6.3 Merge Mapping (Full Traceability)

| Topic File | Source Step Files | Knowledge Preserved |
|------------|-------------------|---------------------|
| `problem-discovery/problem-discovery.md` | 00-01 (Scope Estimation), 01-01 (Business Context), 01-02 (User Needs), 01-03 (UX Journey) | Scope estimation questions, business context probing, stakeholder identification, user type analysis, pain point discovery, user journey mapping, success metrics |
| `requirements/requirements-definition.md` | 01-04 (Technical Context), 01-05 (Quality/Risk), 01-06 (Feature Definition), 01-07 (User Stories), 01-08 (Prioritization) | Technical constraints, quality attributes, risk assessment, FR/AC definition, user story format, MoSCoW prioritization, out-of-scope identification |
| `technical-analysis/technical-analysis.md` | 00-02 (Keyword Search), 00-03 (File Count), 02-01 (Blast Radius), 02-02 (Entry Points), 02-03 (Risk Zones), 02-04 (Impact Summary) | Keyword search methodology, file count estimation, blast radius analysis (3 tiers), entry point identification, risk zone mapping, implementation ordering |
| `architecture/architecture.md` | 03-01 (Architecture Options), 03-02 (Technology Decisions), 03-03 (Integration Design), 03-04 (Architecture Review) | Options analysis, ADR format, technology evaluation, integration point mapping, data flow design, architecture review criteria |
| `specification/specification.md` | 04-01 (Module Design), 04-02 (Interface Contracts), 04-03 (Data Flow), 04-04 (Error Handling), 04-05 (Design Review) | Module boundary definition, interface contract specification, data flow tracing, error taxonomy, design review checklist |
| `security/security.md` | (NEW) | Security considerations: authentication, authorization, data protection, input validation, dependency security, threat modeling |

### 6.4 Topic File YAML Frontmatter Schema

```yaml
---
topic_id: "problem-discovery"
topic_name: "Problem Discovery"
primary_persona: "business-analyst"    # who leads this topic
contributing_personas:                  # who may contribute
  - "solutions-architect"
coverage_criteria:                      # what "adequately covered" means
  - "Business problem articulated in user impact terms"
  - "At least one stakeholder identified with role and interests"
  - "At least one success metric or acceptance threshold defined"
  - "Primary user type identified with pain points"
  - "Current state or workaround described"
artifact_sections:                      # which artifact sections this topic feeds
  - artifact: "requirements-spec.md"
    sections: ["1. Business Context", "2. Stakeholders and Personas", "3. User Journeys"]
  - artifact: "quick-scan.md"
    sections: ["1. Scope"]
depth_guidance:
  brief: "Accept surface-level answers. 1-2 questions max."
  standard: "Probe each area with follow-up. 3-5 exchanges."
  deep: "Exhaustive exploration. Challenge every assumption. 6+ exchanges."
source_step_files:                      # traceability to original step files
  - "00-01"
  - "01-01"
  - "01-02"
  - "01-03"
---
```

### 6.5 Topic File Body Structure

```markdown
## Analytical Knowledge

### Problem Discovery

#### Business Context
- What business problem does this solve? Who is affected and how?
- What does success look like? How will you measure it?
- What is the cost of NOT doing this?
- ...

#### Stakeholder Identification
- Who are the stakeholders (requesters, affected parties, consumers)?
- ...

(All questions from merged step files, organized by sub-topic)

## Validation Criteria

(Validation sections from all merged step files, deduplicated)

- The business problem is articulated in terms of user impact
- At least one primary user type is identified
- Pain points described in user behavior terms
- ...

## Artifact Instructions

(Artifact sections from all merged step files, consolidated)

- requirements-spec.md Section 1: Problem statement, stakeholders, success metrics
- requirements-spec.md Section 2: One subsection per user type (role, goals, pain points, proficiency, tasks)
- quick-scan.md Section 1: Scope classification with rationale
```

### 6.6 Estimated Sizes

| Topic File | Estimated Lines | Rationale |
|------------|----------------|-----------|
| problem-discovery.md | ~80-100 | Merges 4 step files, significant overlap in business context questions |
| requirements-definition.md | ~100-120 | Merges 5 step files, feature definition is the largest section |
| technical-analysis.md | ~100-120 | Merges 6 step files, blast radius analysis is detailed |
| architecture.md | ~80-100 | Merges 4 step files, ADR format takes space |
| specification.md | ~80-100 | Merges 5 step files, interface contract specification is detailed |
| security.md | ~40-60 | New file, focused scope |

---

## 7. Module Boundaries Summary

### Boundary Crossing Matrix

| From \ To | Lead | Maya | Alex | Jordan | Topics |
|-----------|------|------|------|--------|--------|
| Lead | -- | Read/Spawn, Coordinate | Read/Spawn, Coordinate | Read/Spawn, Coordinate | Read coverage_criteria |
| Maya | Report progress (AT mode) | -- | Receive codebase findings | Request precision | Read analytical knowledge |
| Alex | Report progress (AT mode) | Provide tech implications | -- | Provide arch context | Read analytical knowledge |
| Jordan | Report progress (AT mode) | Request requirement clarity | Receive arch decisions | -- | Read analytical knowledge |
| Topics | -- | -- | -- | -- | -- (static files, read-only) |

### Data Crossing Boundaries

| Boundary | Data | Format | Direction |
|----------|------|--------|-----------|
| isdlc.md -> Lead | Dispatch prompt | Text (slug, meta, draft, sizing) | One-time, at startup |
| Lead -> Persona (read) | Persona file content | Markdown | One-time, at startup |
| Lead -> Persona (spawn) | Spawn prompt + context | Text (persona file + artifact folder + slug + draft + scan results) | One-time, at spawn |
| Persona -> Lead (AT) | Progress report | JSON message: { type, persona, artifact, status, coverage_summary } | Multiple, async |
| Lead -> Topics | File read | Markdown with YAML frontmatter | Multiple, at startup and on-demand |
| Lead/Persona -> Artifacts | File write | Markdown/JSON/CSV per artifact type | Multiple, progressive |
| Lead -> meta.json | Progress update | JSON per existing schema | Multiple, at checkpoints |

### No Circular Dependencies

```
Topics (read-only, no outgoing deps)
  ^
  |--- read ---+--- Lead
  |            |      |
  |            |      +--- reads/spawns ---> Maya
  |            |      +--- reads/spawns ---> Alex
  |            |      +--- reads/spawns ---> Jordan
  |            |
  +--- read ---+--- Maya
  +--- read ---+--- Alex
  +--- read ---+--- Jordan
```

All dependencies flow downward. Topics have no dependencies. Personas depend on topics (read) and lead (coordination). Lead depends on personas (read/spawn) and topics (read). No circular paths.

---

## 8. Cross-Cutting Concerns

### 8.1 Logging

All progress logging is via meta.json writes. Only the lead writes meta.json. In agent teams mode, personas report to the lead who consolidates updates. No additional logging mechanism for the initial implementation (ADR-004 consequence: observability improvements are follow-on).

### 8.2 Validation

Two-gate validation per the user's direction:

**Gate 1: Self-Validation (per persona)**
Each persona validates their own artifacts before writing:
- Maya: FRs have testable ACs, priorities assigned, no vague requirements
- Alex: Blast radius covers 3 tiers, at least 2 options per decision, risks have mitigations
- Jordan: Modules have single responsibility, interfaces have concrete types, error paths handled

**Gate 2: Cross-Check (FR-012, lead-coordinated)**
Before finalization, the lead triggers a cross-persona consistency check:
- Maya's FRs are reflected in Alex's architecture decisions
- Alex's integration points are reflected in Jordan's interface contracts
- Jordan's module boundaries align with Alex's architecture
- Confidence indicators are consistent across artifacts

### 8.3 Error Handling (Agent-Level)

| Error Condition | Handler | Recovery |
|-----------------|---------|----------|
| Persona file missing (single-agent) | Lead | Log warning, continue with remaining personas. Degraded coverage. |
| Teammate spawn failure (agent teams) | Lead | Fall back to single-agent mode for that persona's work. |
| Teammate failure mid-analysis (agent teams) | Lead | Read existing artifacts from failed teammate, continue in single-agent mode (ADR-006). |
| Topic file missing/unreadable | Lead | Proceed with built-in knowledge. Topic files are guidance, not hard dependencies. |
| Artifact write failure | Writing persona (or lead) | Retry once. On second failure, warn user. Previous artifact version preserved. |
| meta.json read failure | Lead | Treat as fresh analysis. |
| meta.json write failure | Lead | Retry once. On second failure, warn user. Analysis continues but progress may not be recoverable. |

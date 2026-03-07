---
topic_id: "technical-analysis"
topic_name: "Technical Analysis"
primary_persona: "solutions-architect"
contributing_personas:
  - "business-analyst"
coverage_criteria:
  - "Codebase scan complete with keyword hits and file counts"
  - "At least 1 directly modified file identified"
  - "Blast radius assessed across 3 tiers (direct, transitive, side effects)"
  - "Entry points for implementation identified"
  - "Risk zones mapped with likelihood, impact, and mitigation"
  - "Implementation order defined with dependency chain"
artifact_sections:
  - artifact: "quick-scan.md"
    sections: ["2. Keywords", "3. File Count", "4. Final Scope"]
  - artifact: "impact-analysis.md"
    sections: ["1. Blast Radius", "2. Entry Points", "3. Implementation Order", "4. Risk Zones", "5. Summary"]
depth_guidance:
  brief:
    behavior: "High-level blast radius from codebase scan. Identify direct changes and major risks only."
    acceptance: "At least 1 directly modified file identified. Top-level risk assessment provided."
    inference_policy: "Infer transitive impact and risk zones from codebase structure. Tag inferences as Medium confidence."
  standard:
    behavior: "Detailed blast radius with dependency tracing. Map all three tiers. Identify entry points and implementation order."
    acceptance: "All coverage criteria met. Blast radius tables complete for all 3 tiers. Risk zones mapped with mitigations."
    inference_policy: "Infer Tier 3 side effects from module coupling analysis. Tag inferences as Medium confidence."
  deep:
    behavior: "Exhaustive impact mapping with file-level precision. Trace every dependency chain. Quantify risk with metrics."
    acceptance: "All coverage criteria met with file-level detail. Every affected file categorized. Implementation order dependency-verified."
    inference_policy: "Minimize inference. Verify each impact claim against actual codebase imports and references."
source_step_files:
  - "00-02"
  - "00-03"
  - "02-01"
  - "02-02"
  - "02-03"
  - "02-04"
---

## Analytical Knowledge

### Keyword Search

- Extract 3-5 key terms from the description (function names, file names, module names, config keys)
- Search codebase using Grep for each keyword
- Report hit counts and file locations
- Identify which hits are in production code, tests, or configuration
- Map module distribution of hits
- If zero hits: confirm this is truly new functionality

### File Count Estimation

- Classify each affected file: new, modify, test, config, docs, migration
- Map the dependency chain: if file A changes, do files B and C also need updates?
- Identify generated files or build artifacts that change as side effects
- Produce total file count with breakdown
- Assign confidence level: high (well-understood), medium (some unknowns), low (significant uncertainty)
- Classify final scope: small (1-5 files), medium (6-15 files), large (16+ files)

### Blast Radius Assessment

- **Tier 1 (Direct)**: Files that will be directly modified. For each: file path, module, change type (new/modify/delete), requirement traces.
- **Tier 2 (Transitive)**: Files that depend on or import the directly changed files. For each: file path, module, impact description, change type needed.
- **Tier 3 (Side Effects)**: Areas that may behave differently due to the change. For each: area, potential impact, risk level.
- Produce blast radius summary: direct modifications, new files, restructured files, transitive modifications, total affected.

### Entry Points

- Identify recommended starting point for implementation
- Provide rationale for the entry point choice
- Map the implementation order based on dependencies
- Flag parallel opportunities (steps that can be done concurrently with no file overlap)

### Risk Zones

- For each risk: unique ID, description, affected area, likelihood, impact, mitigation strategy
- Identify highest-risk areas and highest-impact risks
- Map test coverage in affected areas: what is covered, what is not
- Produce overall risk assessment: overall risk level, key concerns, go/no-go recommendation

### Impact Summary

- Executive summary of total files affected, risk level, and key decisions
- Decision log: key decisions made during impact analysis with rationale
- Implementation recommendations: ordered steps with risk level and parallel opportunities

## Validation Criteria

- At least one directly modified file is identified
- Transitive dependencies have been traced
- Blast radius is consistent with the quick-scan scope estimate
- At least 2 risk zones identified with mitigations
- Implementation order is dependency-consistent
- File count breakdown has been produced

## Artifact Instructions

- **quick-scan.md** Section 2: Keyword search results table (Keyword, Hits, Key Files)
- **quick-scan.md** Section 3: File count breakdown table (new, modify, test, config, docs)
- **quick-scan.md** Section 4: Final scope classification with summary rationale
- **impact-analysis.md** Section 1: Blast radius tables (Tier 1, 2, 3)
- **impact-analysis.md** Section 2: Entry points with rationale
- **impact-analysis.md** Section 3: Implementation order table (Order, FRs, Description, Risk, Parallel, Depends On)
- **impact-analysis.md** Section 4: Risk zone table (ID, Risk, Area, Likelihood, Impact, Mitigation)
- **impact-analysis.md** Section 5: Executive summary with metrics and go/no-go

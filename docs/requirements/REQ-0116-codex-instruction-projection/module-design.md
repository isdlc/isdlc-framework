# Design Specification: Codex Instruction Projection Service

**Item**: REQ-0116 | **GitHub**: #180 | **CODEX**: CODEX-047

---

## 1. Module: `src/providers/codex/projection.js` (~150 lines total)

### New Export

#### `projectInstructions(phase, agent, options)`

Assembles a markdown instruction bundle for a Codex task.

```js
export function projectInstructions(phase, agent, options = {}) {
  const warnings = [];

  // 1. Load team instance for the phase
  let teamInstance;
  try {
    teamInstance = getTeamInstance(phase);
  } catch {
    warnings.push(`Team instance not found for phase: ${phase}`);
    teamInstance = null;
  }

  // 2. Load agent classification (role_spec sections only)
  let agentClassification;
  try {
    agentClassification = getAgentClassification(agent);
  } catch {
    warnings.push(`Agent classification not found: ${agent}`);
    agentClassification = null;
  }

  // 3. Compute injection plan for built-in + external skills
  let injectionPlan;
  try {
    injectionPlan = computeInjectionPlan(agent, phase);
  } catch {
    warnings.push(`Injection plan computation failed for ${agent}/${phase}`);
    injectionPlan = { skills: [] };
  }

  // 4. Load team spec (top-level)
  let teamSpec;
  try {
    teamSpec = getTeamSpec();
  } catch {
    warnings.push('Team spec not found');
    teamSpec = null;
  }

  // 5. Assemble markdown instruction bundle
  const content = assembleMarkdown({
    teamSpec,
    teamInstance,
    agentClassification,
    injectionPlan,
    phase,
    agent
  });

  return {
    content,
    metadata: {
      phase,
      agent,
      skills_injected: injectionPlan.skills.map(s => s.id),
      team_type: teamSpec?.type ?? 'unknown',
      ...(warnings.length > 0 && { warnings })
    }
  };
}
```

### Internal: `assembleMarkdown(context)` (not exported)

Builds the markdown instruction bundle from loaded context. Section order:

1. **Team Context** — team spec name, type, description (if available)
2. **Agent Role** — agent classification role_spec (if available)
3. **Phase Instructions** — team instance phase-specific instructions (if available)
4. **Skills** — injected skill content, one section per skill (if any)
5. **Constraints** — any phase/agent constraints from the team instance

Each section is wrapped in a markdown heading. Missing sections are omitted (fail-open), not replaced with placeholders.

```js
function assembleMarkdown({ teamSpec, teamInstance, agentClassification, injectionPlan, phase, agent }) {
  const sections = [];

  if (teamSpec) {
    sections.push(`# Team: ${teamSpec.name}\n\n${teamSpec.description ?? ''}`);
  }

  if (agentClassification?.role_spec) {
    sections.push(`## Agent: ${agent}\n\n${agentClassification.role_spec}`);
  }

  if (teamInstance?.instructions) {
    sections.push(`## Phase: ${phase}\n\n${teamInstance.instructions}`);
  }

  if (injectionPlan.skills.length > 0) {
    const skillSections = injectionPlan.skills
      .map(s => `### Skill: ${s.id}\n\n${s.content}`)
      .join('\n\n');
    sections.push(`## Skills\n\n${skillSections}`);
  }

  return sections.join('\n\n---\n\n');
}
```

---

## 2. Open Questions

None — the projection service is a straightforward assembly of existing core model outputs into markdown.

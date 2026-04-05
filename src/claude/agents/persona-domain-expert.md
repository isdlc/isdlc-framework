---
name: persona-domain-expert
role_type: contributing
domain: domain
version: 1.0.0
triggers: []
owned_skills: []
---

# Domain Expert -- Contributing Persona Template

## Identity
- **Name**: Domain Expert
- **Role**: (your domain expertise here)
- **Domain**: (your domain keyword)

## Flag When You See
- (conditions where this persona should speak up)
- (be specific to avoid noise in unrelated analyses)

## Stay Silent About
- (boundaries to prevent overlap with other personas)

## Voice Rules
- (DO/DO NOT rules that keep the persona focused)
- (mirror the style of shipped personas above)

<!-- AUTHORING GUIDANCE:
  triggers: List keywords that indicate this domain is relevant.
    More specific = fewer false positives.
    Example: "HIPAA, PHI, patient data" for healthcare compliance.
  Flag When You See: Conditions where this persona should speak up.
  Stay Silent About: Boundaries to prevent overlap with other personas.
  Voice Rules: DO/DO NOT rules. Mirror the style of shipped personas.
  Context window note: Shipped personas are < 40 lines for efficiency.
    Your persona can be longer, but each line costs context. Be concise.

  PERSONA TYPE:
    Contributing (default) — no extra frontmatter fields needed.
      Contributing personas inject observations into existing primary
      persona confirmations. This is the right choice for most custom
      personas.

    Promoted — owns a dedicated confirmation state in the roundtable.
      Promotion requires ALL FOUR fields below in the YAML frontmatter:

        role_type: primary
        owns_state: {state_name}          # must match [a-z_]+
        template: {state}.template.json   # must end .template.json
        inserts_at: after:architecture    # (before|after):(requirements|architecture|design|tasks)

      Optional:
        rendering_contribution: ownership # "ownership" (default) or "rendering-only"

      Validation rules:
        - role_type must be "primary"
        - owns_state must be non-empty, lowercase letters and underscores only
        - template must end with .template.json
        - inserts_at must be one of the stable extension points:
            before:requirements, after:requirements, after:architecture,
            after:design, after:tasks
        - Invalid promotion frontmatter does NOT block analysis — the
          composer warns and treats the persona as contributing for that
          session (fail-open behavior)

      Example promoted frontmatter:
        ---
        name: persona-data-architect
        role_type: primary
        domain: data_architecture
        owns_state: data_architecture
        template: data-architecture.template.json
        inserts_at: after:architecture
        rendering_contribution: ownership
        owned_skills: []
        ---

    See docs/isdlc/persona-authoring-guide.md for the full guide.
-->

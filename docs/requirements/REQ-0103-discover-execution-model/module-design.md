# Module Design: REQ-0103 — Discover Execution Model

## modes.js
4 frozen mode objects:
- discover_existing: agent_groups ['core_analyzers', 'post_analysis', 'constitution_skills'], depth_levels ['standard', 'full']
- discover_new: agent_groups ['new_project_core', 'constitution_skills'], depth_levels []
- discover_incremental: agent_groups ['core_analyzers'], depth_levels []
- discover_deep: agent_groups ['core_analyzers', 'post_analysis', 'deep_standard', 'deep_full', 'constitution_skills'], depth_levels ['standard', 'full']

## agent-groups.js
7 frozen group objects mapping group ID to members array with agent names and parallelism mode.

## index.js
Re-exports + getDiscoverMode(id), getAgentGroup(id), listDiscoverModes(), listAgentGroups(). ~40 lines.

Total: ~120 lines.

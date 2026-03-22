# Module Design: REQ-0104 — Discover Interactive UX

## ux-flows.js
Frozen menu objects (firstTimeMenu, returningMenu) with option arrays.
Frozen walkthrough sequences per mode (existingWalkthrough, newWalkthrough, deepWalkthrough).
Each step: { id, label, agent_group, optional, review_gate }.

Exports: getMenu(menuId), getWalkthrough(modeId), listMenus()

~80 lines.

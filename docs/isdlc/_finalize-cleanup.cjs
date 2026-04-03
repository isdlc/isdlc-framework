const fs = require('fs');
const p = '.isdlc/state.json';
const s = JSON.parse(fs.readFileSync(p, 'utf8'));
const aw = s.active_workflow;
if (aw === null || aw === undefined) { console.log('No active_workflow'); process.exit(0); }
const entry = {
  type: aw.type,
  id: 'REQ-GH-220',
  description: aw.description,
  slug: aw.artifact_folder,
  source: aw.source,
  source_id: aw.source_id,
  status: 'completed',
  phases: aw.phases,
  phase_status: aw.phase_status,
  started_at: aw.started_at,
  completed_at: new Date().toISOString(),
  metrics: { total_phases: aw.phases.length, completed_phases: aw.phases.length }
};
s.workflow_history.unshift(entry);
s.active_workflow = null;
s.current_phase = null;
s.active_agent = null;
s.phases = {};
fs.writeFileSync(p, JSON.stringify(s, null, 2) + '\n');
console.log('Done: active_workflow moved to workflow_history, fields reset');

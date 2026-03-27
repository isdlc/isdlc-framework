/**
 * Backlog Module — Re-exports
 *
 * REQ-0083: Extract BacklogService + ItemStateService
 *
 * @module src/core/backlog
 */

export { generateSlug, composeDirName } from './slug.js';
export { detectSource } from './source-detection.js';
export {
  readMetaJson,
  writeMetaJson,
  deriveAnalysisStatus,
  deriveBacklogMarker
} from './item-state.js';
export {
  parseBacklogLine,
  updateBacklogMarker,
  appendToBacklog
} from './backlog-ops.js';
export {
  resolveItem,
  findBacklogItemByNumber,
  findByExternalRef,
  searchBacklogTitles,
  findDirForDescription
} from './item-resolution.js';
export {
  checkGhAvailability,
  searchGitHubIssues,
  createGitHubIssue
} from './github.js';

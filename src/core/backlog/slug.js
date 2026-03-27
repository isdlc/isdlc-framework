/**
 * Slug Generation
 * ================
 * URL-safe slug generation from free-text descriptions.
 *
 * Extracted from three-verb-utils.cjs (REQ-0083).
 * Traces: FR-001 (AC-001-01), VR-SLUG-001..004
 *
 * @module src/core/backlog/slug
 */

/**
 * Composes a requirement directory name from source metadata.
 *
 * - External sources (github, jira): {TYPE}-{source_id}-{slug}
 *   e.g. REQ-GH-208-generate-task-breakdown, BUG-AUTH-456-login-crash
 * - Manual (no external source): {TYPE}-{NNNN}-{slug}
 *   e.g. REQ-0001-add-payment-processing
 *
 * @param {string} itemType - "REQ" or "BUG"
 * @param {string} source - "github", "jira", or "manual"
 * @param {string|null} sourceId - e.g. "GH-208", "AUTH-456", or null
 * @param {string} descriptionSlug - Sanitized slug from generateSlug()
 * @param {string} [sequenceNumber] - Zero-padded 4-digit number (manual only)
 * @returns {string} Composed directory name
 */
export function composeDirName(itemType, source, sourceId, descriptionSlug, sequenceNumber) {
  const type = (itemType || 'REQ').toUpperCase();
  const slug = descriptionSlug || 'untitled-item';

  if (source === 'github' || source === 'jira') {
    if (!sourceId) {
      return `${type}-${sequenceNumber || '0001'}-${slug}`;
    }
    return `${type}-${sourceId}-${slug}`;
  }

  return `${type}-${sequenceNumber || '0001'}-${slug}`;
}

/**
 * Generates a URL-safe slug from a free-text description.
 * @param {string} description - Free-text item description
 * @returns {string} Sanitized slug (max 50 chars)
 */
export function generateSlug(description) {
  if (!description || typeof description !== 'string') {
    return 'untitled-item';
  }

  let slug = description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);

  if (!slug) {
    slug = 'untitled-item';
  }

  return slug;
}

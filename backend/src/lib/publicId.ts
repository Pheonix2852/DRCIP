import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a human-readable public reference for an entity.
 * Public references are for UX/logging only; UUID primary keys remain relational keys.
 * See docs/04_Database_Schema.md §2.
 */
export function publicId(prefix: string): string {
  return `${prefix}-${uuidv4().slice(0, 8).toUpperCase()}`;
}

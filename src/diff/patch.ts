/**
 * Apply diffs to ODIN documents.
 */

import type { OdinDocument } from '../types/document.js';
import type { OdinDiff } from '../types/diff.js';
import { PatchError } from '../types/errors.js';
import { OdinDocumentImpl } from '../types/document-impl.js';

/**
 * Apply a diff to a document, producing a new document.
 *
 * @param doc - Document to patch
 * @param diff - Diff to apply
 * @returns New document with diff applied
 * @throws {PatchError} If diff references non-existent paths for modifications
 */
export function patch(doc: OdinDocument, diff: OdinDiff): OdinDocument {
  // If diff is empty, return a copy of the original
  if (diff.isEmpty) {
    return cloneDocument(doc);
  }

  // Start with mutable copies
  const metadata = new Map(doc.metadata);
  const assignments = new Map(doc.assignments);
  const modifiers = new Map(doc.modifiers);

  // Apply deletions (paths with "$." prefix are metadata fields)
  for (const deletion of diff.deletions) {
    const path = deletion.path;
    if (path.startsWith('$.')) {
      metadata.delete(path.slice(2));
    } else {
      assignments.delete(path);
    }
    modifiers.delete(path);
  }

  // Apply moves
  for (const move of diff.moves) {
    const { fromPath, toPath } = move;

    // Get value from old path
    let value;
    if (fromPath.startsWith('$.')) {
      value = metadata.get(fromPath.slice(2));
      metadata.delete(fromPath.slice(2));
    } else {
      value = assignments.get(fromPath);
      assignments.delete(fromPath);
    }

    // Move modifiers too
    const pathModifiers = modifiers.get(fromPath);
    modifiers.delete(fromPath);

    // Set at new path
    if (value !== undefined) {
      if (toPath.startsWith('$.')) {
        metadata.set(toPath.slice(2), value);
      } else {
        assignments.set(toPath, value);
      }

      if (pathModifiers) {
        modifiers.set(toPath, pathModifiers);
      }
    }
  }

  // Apply modifications
  for (const mod of diff.modifications) {
    const { path, newValue } = mod;

    // Verify the path exists (for safety)
    const exists = path.startsWith('$.') ? metadata.has(path.slice(2)) : assignments.has(path);

    if (!exists) {
      throw new PatchError(`Path does not exist for modification: ${path}`, path);
    }

    if (path.startsWith('$.')) {
      metadata.set(path.slice(2), newValue);
    } else {
      assignments.set(path, newValue);
    }
  }

  // Apply additions
  for (const addition of diff.additions) {
    const { path, value } = addition;
    if (path.startsWith('$.')) {
      metadata.set(path.slice(2), value);
    } else {
      assignments.set(path, value);
    }
  }

  return new OdinDocumentImpl(
    metadata,
    assignments,
    modifiers,
    [...doc.imports],
    [...doc.schemas],
    [...doc.conditionals]
  );
}

/**
 * Create a shallow copy of a document.
 */
function cloneDocument(doc: OdinDocument): OdinDocument {
  return new OdinDocumentImpl(
    new Map(doc.metadata),
    new Map(doc.assignments),
    new Map(doc.modifiers),
    [...doc.imports],
    [...doc.schemas],
    [...doc.conditionals]
  );
}

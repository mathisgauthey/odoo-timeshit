import {MappingTarget} from "./azure-mapping-target.model";

/**
 * One pre-built association: take a work-item property and drop it into a
 * timesheet form field when creating a new entry from a work item.
 *
 * `source` is the work-item property to read:
 *   - `@id`: the work item id (from the page URL)
 *   - `@title`: the work item title
 *   - anything else: the text of a work-item field, matched against its
 *     on-page label (e.g. `Projet`, `Tâche`, etc.).
 */
export interface AzureFieldMapping {
  source: string;
  target: MappingTarget;
}

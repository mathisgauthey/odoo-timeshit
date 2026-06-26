import {AzurePrefillField} from "./azure-prefill-field.model";

/**
 * Hand-off written to storage by the background before it opens the popup
 * window, then consumed (and cleared) once by the Angular app on boot.
 */
export interface AzurePrefill {
  /** The work item this came from, for traceability / the reuse key. */
  workItemId: string;
  fields: AzurePrefillField[];
}

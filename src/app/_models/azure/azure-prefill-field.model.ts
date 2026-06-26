import {MappingTarget} from "./azure-mapping-target.model";

/** A single resolved value the popup should drop into the add/edit form. */
export interface AzurePrefillField {
  target: MappingTarget;
  /** The scraped text value. */
  value: string;
}

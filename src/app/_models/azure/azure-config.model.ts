import {AzureFieldMapping} from "./azure-field-mapping.model";

export interface AzureConfig {
  /** Base URL whose work-item pages get the timer widget, e.g. `https://devops.acme.local`. Empty disables the integration. */
  baseUrl: string;
  /**
   * Timesheet property matched against the work item id to find an existing
   * entry for today (the reuse key). A timesheet field technical name, e.g.
   * `name` (description) or a custom field like `partner_id`.
   */
  matchField: string;
  /** Pre-built associations applied when creating a new entry from a work item. */
  mappings: AzureFieldMapping[];
}


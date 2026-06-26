import {FieldType} from "./field-types";

/**
 * One instance-specific field added to a timesheet entry.
 *
 * Mirrors the subset of Odoo `fields_get` metadata we care about, plus a label.
 * The same shape is what AzureDevOps work-item fields will later be mapped onto,
 * so keep it generic: a technical `name`, a display `label`, an Odoo `type`, and
 * (for relational/selection types) the extra info needed to edit a value.
 */
export interface CustomFieldConfig {
  /** Technical field name on `account.analytic.line`, e.g. `partner_id`. */
  name: string;
  /** Human label shown in the form and list. */
  label: string;
  /** Odoo field type, e.g. `many2one`, `char`, `integer`, `boolean`, `date`, `selection`. */
  type: FieldType;
  /** Target model for `many2one` fields, e.g. `res.partner`. */
  relation?: string;
  /** `[value, label]` options for `selection` fields. */
  selection?: [string, string][];
}

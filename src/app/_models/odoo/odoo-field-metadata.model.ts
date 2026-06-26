import {FieldType} from "./field-types";

/** A field's metadata as returned by Odoo `fields_get`. */
export interface OdooFieldMetadata {
  /** Human label, e.g. "Partner Name", "Description", "Active". */
  string: string;
  /** Odoo field type, e.g. "many2one", "char", "boolean". */
  type: FieldType;
  /** Target model for relational fields (many2one/one2many/many2many). */
  relation?: string;
  /** Allowed `[value, label]` pairs for selection fields. */
  selection?: [string, string][];
}

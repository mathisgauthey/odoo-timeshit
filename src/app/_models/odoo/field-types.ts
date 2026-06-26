/** Odoo field types we render an editor for; others fall back to a text input. */
export const FieldType = {
  Many2one: 'many2one',
  Char: 'char',
  Text: 'text',
  Integer: 'integer',
  Float: 'float',
  Monetary: 'monetary',
  Boolean: 'boolean',
  Date: 'date',
  Datetime: 'datetime',
  Selection: 'selection',
} as const;

export type FieldType = (typeof FieldType)[keyof typeof FieldType];

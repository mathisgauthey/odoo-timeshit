/** The widget family used to edit a given Odoo field type. */
export const Widget = {
  Relation: 'relation',
  Number: 'number',
  Boolean: 'boolean',
  Date: 'date',
  Datetime: 'datetime',
  Selection: 'selection',
  Textarea: 'textarea',
  Text: 'text',
} as const;

export type Widget = (typeof Widget)[keyof typeof Widget];

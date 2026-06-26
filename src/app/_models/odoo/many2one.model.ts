/** Odoo many2one fields come back as a `[id, displayName]` tuple, or `false` when unset. */
export type Many2One = [number, string] | false;

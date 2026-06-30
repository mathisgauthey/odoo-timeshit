import {Many2One} from "./many2one.model";

/** A single timesheet line (`account.analytic.line`). */
export interface TimesheetEntry {
  id: number;
  name: string;
  /** ISO date, e.g. `2026-06-21`. */
  date: string;
  /** Logged duration in hours (float, e.g. 1.5 = 1h30). */
  unit_amount: number;
  /** Last-modified timestamp, UTC datetime e.g. `2026-06-21 14:30:00`. */
  write_date: string;
  project_id: Many2One;
  task_id: Many2One;
  employee_id: Many2One;
  helpdesk_ticket_id: Many2One;

  /** Instance-specific custom fields (see ConfigService), keyed by technical name. */
  [field: string]: unknown;
}

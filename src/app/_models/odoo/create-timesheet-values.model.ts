/**
 * Field values accepted when creating or updating a timesheet line. Many2one
 * fields take an id, or `false` to clear the link (used when editing switches
 * a line from a task to a ticket, or vice versa).
 */
export interface CreateTimesheetValues {
  name: string;
  date: string;
  unit_amount: number;
  project_id?: number;
  task_id?: number | false;
  helpdesk_ticket_id?: number | false;

  /** Instance-specific custom fields, keyed by technical name. */
  [field: string]: string | number | boolean | undefined;
}

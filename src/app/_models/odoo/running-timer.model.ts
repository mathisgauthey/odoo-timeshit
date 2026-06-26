import {Many2One} from "./many2one.model";

/** A timesheet line that currently has a running (or paused) timer. */
export interface RunningTimer {
  id: number;
  name: string;
  /** Hours already accumulated before the current running segment. */
  unit_amount: number;
  /** Server datetime ("YYYY-MM-DD HH:MM:SS", UTC) of the current segment start. */
  timer_start: string | false;
  /** Falsy while running; a datetime once paused. */
  timer_pause: string | boolean;
  is_timer_running: boolean;
  project_id: Many2One;
  task_id: Many2One;
}

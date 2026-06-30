import {RunningTimer} from "../../_models/odoo/running-timer.model";
import {Many2One} from "../../_models/odoo/many2one.model";

/**
 * Local snapshot of the active timer, persisted to `chrome.storage.local` so a
 * reopened popup ticks instantly and the Azure content-script widget can render
 * the right buttons without its own Odoo round-trip.
 *
 * This is the contract shared by every writer of the timer state: the popup's
 * {@link TimerService} and the background service worker (driven by the Azure
 * widget) both produce and consume exactly this shape under {@link TIMER_STORAGE_KEY}.
 */
export interface TimerState {
  lineId: number;
  name: string;
  projectName: string;
  taskName: string;
  /** Hours already logged before the current segment. */
  baseHours: number;
  /** Epoch ms when the current running segment started. */
  segmentStartMs: number;
  paused: boolean;
}

/** Storage key the timer state lives under; shared so popup and background agree. */
export const TIMER_STORAGE_KEY = 'timerState';

/**
 * Maps Odoo's authoritative running-timer record onto our local {@link TimerState},
 * or `null` when nothing is running. Both contexts reconcile against this so the
 * elapsed clock is always anchored to the server's segment start.
 */
export function timerStateFromRunning(running: RunningTimer | null): TimerState | null {
  if (!running) return null;
  const startMs = running.timer_start
    ? Date.parse(running.timer_start.replace(' ', 'T') + 'Z')
    : Date.now();
  const pause = running.timer_pause;
  const paused = typeof pause === 'string';
  // While paused, the line's `unit_amount` doesn't yet include the segment that
  // ran before the pause, so fold `timer_start -> timer_pause` into baseHours to
  // freeze the elapsed display at the right value (mirrors TimerService.pause()).
  const baseHours = paused
    ? running.unit_amount + Math.max(0, Date.parse(pause.replace(' ', 'T') + 'Z') - startMs) / 3_600_000
    : running.unit_amount;
  return {
    lineId: running.id,
    name: running.name || 'Untitled',
    projectName: label(running.project_id),
    taskName: label(running.task_id),
    baseHours,
    segmentStartMs: startMs,
    paused,
  };
}

/** Display name of a many2one tuple, or '' when unset. */
export function label(field: Many2One): string {
  return field ? field[1] : '';
}

/** Seconds -> "HH:MM:SS". */
export function formatHms(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

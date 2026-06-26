import {computed, inject, Injectable, signal} from '@angular/core';
import {formatHms, label, TIMER_STORAGE_KEY, TimerState, timerStateFromRunning} from './timer-state';
import {OdooService} from "../../_services/odoo/odoo.service";
import {StorageService} from "../../_services/storage.service";

/**
 * Single source of truth for the running timer, shared across the app.
 *
 * Owns the persisted timer state, the once-a-second tick, and the start/pause/
 * resume/stop calls. Both the dedicated timer tab and the always-visible top-bar
 * pill read the same signals from here, so they never drift apart. Mutating
 * methods throw on failure; callers decide how to surface the error.
 *
 * The state also lives in `chrome.storage.local` so the Azure content-script
 * widget (which drives the timer through the background service worker) and the
 * popup stay in sync: we subscribe to `storage.onChanged` and adopt any external
 * write, e.g. when the timer was started/stopped from a work-item page.
 */
@Injectable({providedIn: 'root'})
export class TimerService {
  readonly timer = signal<TimerState | null>(null);
  readonly busy = signal(false);
  private odoo = inject(OdooService);
  private storage = inject(StorageService);
  /** Ticks once a second to drive the elapsed display. */
  private readonly now = signal(Date.now());
  readonly elapsed = computed(() => {
    const t = this.timer();
    if (!t) return '00:00:00';
    const base = t.baseHours * 3600;
    const seconds = t.paused ? base : base + (this.now() - t.segmentStartMs) / 1000;
    return formatHms(seconds);
  });

  constructor() {
    setInterval(() => this.now.set(Date.now()), 1000);
    // Show any persisted timer immediately, then reconcile against Odoo.
    this.loadState().then(state => {
      if (state && !this.timer()) this.timer.set(state);
    });
    // Adopt timer changes made elsewhere (other popup, or the Azure widget via
    // the background worker). The service delivers these inside the zone.
    this.storage.onChanged<TimerState>(TIMER_STORAGE_KEY, state => this.timer.set(state));
  }

  /** Re-reads the authoritative running timer from Odoo. Safe to call any time. */
  async refresh(): Promise<void> {
    try {
      this.setState(timerStateFromRunning(await this.odoo.fetchRunningTimer()));
    } catch {
      // Logged out or offline: keep whatever local state we have.
    }
  }

  async start(entryId: number): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      // Read fresh accumulated hours, then start the timer and anchor our local clock.
      const fresh = await this.odoo.fetchTimesheetEntry(entryId);
      await this.odoo.startTimer(entryId);
      this.setState({
        lineId: entryId,
        name: fresh.name || 'Untitled',
        projectName: label(fresh.project_id),
        taskName: label(fresh.task_id),
        baseHours: fresh.unit_amount,
        segmentStartMs: Date.now(),
        paused: false,
      });
    } finally {
      this.busy.set(false);
    }
  }

  async pause(): Promise<void> {
    const t = this.timer();
    if (!t || t.paused || this.busy()) return;
    this.busy.set(true);
    try {
      await this.odoo.pauseTimer(t.lineId);
      // Freeze the elapsed value by folding the current segment into baseHours.
      const elapsedHours = t.baseHours + (Date.now() - t.segmentStartMs) / 3_600_000;
      this.setState({...t, baseHours: elapsedHours, paused: true});
    } finally {
      this.busy.set(false);
    }
  }

  async resume(): Promise<void> {
    const t = this.timer();
    if (!t || !t.paused || this.busy()) return;
    this.busy.set(true);
    try {
      await this.odoo.resumeTimer(t.lineId);
      this.setState({...t, segmentStartMs: Date.now(), paused: false});
    } finally {
      this.busy.set(false);
    }
  }

  async stop(): Promise<void> {
    const t = this.timer();
    if (!t || this.busy()) return;
    this.busy.set(true);
    try {
      await this.odoo.stopTimer(t.lineId);
      this.setState(null);
    } finally {
      this.busy.set(false);
    }
  }

  private setState(state: TimerState | null): void {
    this.timer.set(state);
    if (state) this.storage.set(TIMER_STORAGE_KEY, state);
    else this.storage.remove(TIMER_STORAGE_KEY);
  }

  private loadState(): Promise<TimerState | null> {
    return this.storage.get<TimerState>(TIMER_STORAGE_KEY);
  }
}

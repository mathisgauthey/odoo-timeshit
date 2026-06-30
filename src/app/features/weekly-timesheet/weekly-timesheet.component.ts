import {Component, computed, inject, OnInit, output, signal} from '@angular/core';
import {ProgressSpinnerModule} from 'primeng/progressspinner';
import {ConfirmationService, MessageService} from 'primeng/api';
import {TimerService} from '../timer/timer.service';
import {TimesheetEntry} from "../../_models/odoo/timesheet-entry.model";
import {OdooService} from "../../_services/odoo/odoo.service";
import {hoursToHhmm, parseDuration} from "../../_helpers/duration";
import {CustomFieldConfig} from "../../_models/odoo/custom-field-config.model";
import {escapeHtml} from "../../_helpers/html";
import {CustomFieldService} from "../../_services/custom-field.service";

const WEEKLY_TARGET_HOURS = 40;
const BUSINESS_DAYS_PER_WEEK = 5;
/** Daily target = weekly target spread across the business days (40h -> 8h). */
const DAILY_TARGET_HOURS = WEEKLY_TARGET_HOURS / BUSINESS_DAYS_PER_WEEK;

/** Entries that share a calendar day, plus that day's header info. */
interface DayGroup {
  /** ISO date of the day, used as the key when balancing. */
  date: string;
  label: string;
  totalHours: number;
  entries: TimesheetEntry[];
}

/** One entry's proposed duration change, shown in the balance confirmation. */
interface BalanceChange {
  entry: TimesheetEntry;
  beforeHours: number;
  afterHours: number;
}

/** One column of the Mon→Sun overview bar chart. */
interface DayBar {
  letter: string;
  hours: number;
  heightPct: number;
  isToday: boolean;
  isWeekend: boolean;
}

@Component({
  selector: 'app-weekly-timesheet',
  standalone: true,
  imports: [ProgressSpinnerModule],
  templateUrl: './weekly-timesheet.component.html',
})
export class WeeklyTimesheetComponent implements OnInit {
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly weeklyTargetHours = WEEKLY_TARGET_HOURS;
  readonly dailyTargetHours = DAILY_TARGET_HOURS;
  /** Asks the host to open the editor for this entry. */
  readonly edit = output<TimesheetEntry>();
  readonly timerSvc = inject(TimerService);
  /** Id of the entry currently being deleted, so its row buttons can disable. */
  readonly deletingId = signal<number | null>(null);
  /** Id of the entry whose duration is being saved, so its input can disable. */
  readonly savingDurationId = signal<number | null>(null);
  /** ISO date of the day currently being balanced, so its button can show progress. */
  readonly balancingDate = signal<string | null>(null);
  private readonly odoo = inject(OdooService);
  private readonly messages = inject(MessageService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly config = inject(CustomFieldService);
  /** Instance-specific fields to surface as chips on each entry. */
  readonly customFields = this.config.customFields;
  private readonly entries = signal<TimesheetEntry[]>([]);
  readonly totalHours = computed(() =>
    this.entries().reduce((sum, e) => sum + e.unit_amount, 0)
  );
  private readonly weekStart = signal(startOfWeek(new Date()));
  /** "Jun 15 - Jun 21" label for the current week. */
  readonly weekLabel = computed(() =>
    `${formatDayMonth(this.weekStart())} - ${formatDayMonth(addDays(this.weekStart(), 6))}`
  );
  private readonly todayIso = toIso(new Date());
  /** Entries grouped by day, newest day first (entries already come date-desc). */
  readonly groups = computed<DayGroup[]>(() => {
    const byDate = new Map<string, TimesheetEntry[]>();
    for (const e of this.entries()) {
      (byDate.get(e.date) ?? byDate.set(e.date, []).get(e.date)!).push(e);
    }
    return [...byDate.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, entries]) => ({
        date,
        label: date === this.todayIso ? `Today • ${formatDayMonth(date)}` : formatDayMonth(date),
        totalHours: entries.reduce((sum, e) => sum + e.unit_amount, 0),
        entries,
      }));
  });
  /** Hours logged per ISO date, derived once from the entry list. */
  private readonly hoursByDay = computed(() => {
    const totals: Record<string, number> = {};
    for (const e of this.entries()) {
      totals[e.date] = (totals[e.date] ?? 0) + e.unit_amount;
    }
    return totals;
  });
  /** Seven columns (Mon→Sun) for the overview bar chart. */
  readonly dayBars = computed<DayBar[]>(() => {
    const totals = this.hoursByDay();
    const letters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    return letters.map((letter, i) => {
      const day = addDays(this.weekStart(), i);
      const iso = toIso(day);
      const hours = totals[iso] ?? 0;
      return {
        letter,
        hours,
        heightPct: Math.min(100, Math.round((hours / DAILY_TARGET_HOURS) * 100)),
        isToday: iso === this.todayIso,
        isWeekend: i >= 5,
      };
    });
  });

  ngOnInit(): void {
    this.load();
  }

  /** Shift the view to the previous/next week and reload its entries. */
  goToPreviousWeek(): void {
    this.weekStart.set(addDays(this.weekStart(), -7));
    this.load();
  }

  goToNextWeek(): void {
    this.weekStart.set(addDays(this.weekStart(), 7));
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const start = toIso(this.weekStart());
      const end = toIso(addDays(this.weekStart(), 6));
      this.entries.set(await this.odoo.fetchWeeklyTimesheet(start, end));
    } catch (err: any) {
      this.error.set(String(err?.message ?? err));
    } finally {
      this.loading.set(false);
    }
  }

  /** Start tracking time on an existing entry, straight from the list. */
  async startTimer(entry: TimesheetEntry): Promise<void> {
    if (this.timerSvc.timer()) {
      this.messages.add({
        severity: 'warn',
        summary: 'A timer is already running',
        detail: 'Stop it before starting another.'
      });
      return;
    }
    try {
      await this.timerSvc.start(entry.id);
      this.messages.add({severity: 'success', summary: 'Timer started', detail: entry.name || 'Untitled'});
    } catch {
      // Request failures are toasted centrally by ErrorService.
    }
  }

  /** Pause the running timer (keeps it attached to its entry). */
  async pauseTimer(): Promise<void> {
    try {
      await this.timerSvc.pause();
    } catch {
      // Request failures are toasted centrally by ErrorService.
    }
  }

  /** Resume a paused timer. */
  async resumeTimer(): Promise<void> {
    try {
      await this.timerSvc.resume();
    } catch {
      // Request failures are toasted centrally by ErrorService.
    }
  }

  /** Stop the running timer and refresh the list so the saved hours show up. */
  async stopTimer(): Promise<void> {
    try {
      await this.timerSvc.stop();
      await this.load();
    } catch {
      // Request failures are toasted centrally by ErrorService.
    }
  }

  /**
   * Rescale a day's entries so they sum to the daily target, in 5-minute steps
   * (Odoo's granularity), weighted by each entry's current duration. Works in both
   * directions a day under target is scaled up, a day over target scaled down.
   * An entry that already holds more of the day keeps more of the target; entries
   * with no time are split evenly only when the whole day is empty.
   *
   * Opens the same confirm dialog as delete (its message renders the before/after
   * of each changed line as HTML); nothing is written until the user confirms.
   */
  balanceDay(group: DayGroup): void {
    if (this.balancingDate()) return;

    const targetSteps = Math.round(this.dailyTargetHours * 12); // 12 five-minute steps per hour
    const steps = distributeSteps(group.entries.map(e => e.unit_amount), targetSteps);
    const changes: BalanceChange[] = group.entries
      .map((entry, i) => ({entry, beforeHours: entry.unit_amount, afterHours: steps[i] / 12}))
      .filter(c => Math.abs(c.afterHours - c.beforeHours) > 1e-9);

    if (!changes.length) {
      this.messages.add({severity: 'info', summary: 'Already balanced', detail: group.label});
      return;
    }

    this.confirmation.confirm({
      header: 'Balance day?',
      message: this.balanceMessage(group, changes, steps.reduce((a, b) => a + b, 0) / 12),
      icon: 'pi pi-bullseye',
      acceptLabel: 'Apply',
      rejectLabel: 'Cancel',
      accept: () => this.applyBalance(group, changes),
    });
  }

  /** Ask for confirmation, then permanently delete the entry and refresh the list. */
  confirmDelete(entry: TimesheetEntry): void {
    this.confirmation.confirm({
      header: 'Delete timesheet entry?',
      message: `Are you sure you want to delete this timesheet entry — `
        + `"${entry.name || 'Untitled'}" on ${this.label(entry.project_id) || 'no project'} `
        + `(${this.formatHoursMinutes(entry.unit_amount)})?`,
      icon: 'pi pi-trash',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.delete(entry),
    });
  }

  /** "01:30" hours:minutes from a float number of hours, for the editable field. */
  formatHhmm(hours: number): string {
    return hoursToHhmm(hours);
  }

  /**
   * Persist an inline duration edit. Accepts the same formats as the editor
   * ("1.5", "1:30", "01:30"); reverts the field on empty/invalid/unchanged input.
   */
  async saveDuration(entry: TimesheetEntry, raw: string, input: HTMLInputElement): Promise<void> {
    const hours = parseDuration(raw);
    if (hours == null) {
      if (raw.trim()) {
        this.messages.add({severity: 'warn', summary: 'Invalid duration', detail: 'Use 1.5, 1:30 or 01:30.'});
      }
      input.value = hoursToHhmm(entry.unit_amount);
      return;
    }
    if (hours === entry.unit_amount) {
      input.value = hoursToHhmm(entry.unit_amount);
      return;
    }
    this.savingDurationId.set(entry.id);
    try {
      await this.odoo.updateTimesheet(entry.id, {unit_amount: hours});
      await this.load();
    } catch {
      // Request failures are toasted centrally by ErrorService.
      input.value = hoursToHhmm(entry.unit_amount);
    } finally {
      this.savingDurationId.set(null);
    }
  }

  /** "8h 00m" summary-style duration from a float number of hours. */
  formatHoursMinutes(hours: number): string {
    const totalMinutes = Math.round(hours * 60);
    return `${Math.floor(totalMinutes / 60)}h ${pad(totalMinutes % 60)}m`;
  }

  /** Display name of a many2one tuple (project, task, ticket...), or '' when unset. */
  label(field: TimesheetEntry['project_id']): string {
    return field ? field[1] : '';
  }

  /** A custom field's value rendered as a short chip label, or '' when empty. */
  customLabel(entry: TimesheetEntry, field: CustomFieldConfig): string {
    const raw = entry[field.name];
    if (raw == null || raw === false || raw === '') return '';
    if (field.type === 'many2one') return (raw as [number, string])[1];
    if (field.type === 'boolean') return field.label;
    if (field.type === 'selection') {
      return field.selection?.find(([value]) => value === raw)?.[1] ?? String(raw);
    }
    return String(raw);
  }

  /** Write the confirmed balance changes, then reload. */
  private async applyBalance(group: DayGroup, changes: BalanceChange[]): Promise<void> {
    this.balancingDate.set(group.date);
    try {
      await Promise.all(changes.map(c => this.odoo.updateTimesheet(c.entry.id, {unit_amount: c.afterHours})));
      await this.load();
      this.messages.add({
        severity: 'success',
        summary: 'Day balanced',
        detail: `${group.label} → ${this.dailyTargetHours}h`
      });
    } catch {
      // Request failures are toasted centrally by ErrorService.
    } finally {
      this.balancingDate.set(null);
    }
  }

  /**
   * Builds the confirm-dialog HTML body: one before → after row per changed line.
   * Uses CSS classes (see styles.css), not inline styles, Angular's sanitizer
   * strips `style` from `[innerHTML]`, but keeps `class`.
   */
  private balanceMessage(group: DayGroup, changes: BalanceChange[], totalAfterHours: number): string {
    const rows = changes.map(c => {
      const dir = c.afterHours >= c.beforeHours ? 'up' : 'down';
      return `<div class="balance-row">`
        + `<span class="balance-name">${escapeHtml(c.entry.name || 'Untitled')}</span>`
        + `<span class="balance-times">`
        + `<span class="balance-before">${this.formatHhmm(c.beforeHours)}</span> &rarr; `
        + `<span class="balance-after ${dir}">${this.formatHhmm(c.afterHours)}</span></span></div>`;
    }).join('');
    const count = `${changes.length} ${changes.length === 1 ? 'entry' : 'entries'}`;
    return `<div class="balance-intro">${escapeHtml(group.label)} &mdash; adjusting ${count} to reach `
      + `${this.dailyTargetHours}h, in 5-min steps weighted by current time.</div>`
      + rows
      + `<div class="balance-total"><span>New day total</span>`
      + `<span class="balance-times">${this.formatHoursMinutes(totalAfterHours)}</span></div>`;
  }

  private async delete(entry: TimesheetEntry): Promise<void> {
    this.deletingId.set(entry.id);
    try {
      await this.odoo.deleteTimesheet(entry.id);
      this.messages.add({severity: 'success', summary: 'Entry deleted', detail: entry.name || 'Untitled'});
      await this.load();
    } catch {
      // Request failures are toasted centrally by ErrorService.
    } finally {
      this.deletingId.set(null);
    }
  }
}

/**
 * Apportions `target` whole steps across `weights`, proportional to each weight,
 * summing to exactly `target`. Uses the largest-remainder method so rounding never
 * loses or gains a step; falls back to an even split when every weight is zero.
 */
function distributeSteps(weights: number[], target: number): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const sumW = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map(w => (sumW > 0 ? (target * w) / sumW : target / n));
  const base = raw.map(r => Math.floor(r));
  const leftover = target - base.reduce((a, b) => a + b, 0);
  // Hand the rounding leftover to the entries with the largest fractional parts.
  const byRemainder = raw
    .map((r, i) => ({i, frac: r - Math.floor(r)}))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < leftover; k++) base[byRemainder[k].i]++;
  return base;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Monday 00:00 of the week containing `d`. */
function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const mondayOffset = (date.getDay() + 6) % 7; // Sun=0 -> 6, Mon=1 -> 0
  date.setDate(date.getDate() - mondayOffset);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d: Date, days: number): Date {
  const date = new Date(d);
  date.setDate(date.getDate() + days);
  return date;
}

/** Local ISO date (YYYY-MM-DD) without timezone drift. */
function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "Jun 21" from a Date or ISO date string. */
function formatDayMonth(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(`${d}T00:00:00`) : d;
  return date.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
}

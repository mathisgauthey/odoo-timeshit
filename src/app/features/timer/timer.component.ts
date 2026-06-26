import {Component, inject, OnInit, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {DropdownModule} from 'primeng/dropdown';
import {ButtonModule} from 'primeng/button';
import {ProgressSpinnerModule} from 'primeng/progressspinner';
import {TimerService} from './timer.service';
import {TimesheetEntry} from "../../_models/odoo/timesheet-entry.model";
import {OdooService} from "../../_services/odoo/odoo.service";

@Component({
  selector: 'app-timer',
  standalone: true,
  imports: [FormsModule, DropdownModule, ButtonModule, ProgressSpinnerModule],
  templateUrl: './timer.component.html',
})
export class TimerComponent implements OnInit {
  readonly loading = signal(true);
  readonly entries = signal<TimesheetEntry[]>([]);
  selected: TimesheetEntry | null = null;
  readonly timerSvc = inject(TimerService);
  /** Re-exposed for the template so it keeps reading `timer()` / `elapsed()` / `busy()`. */
  readonly timer = this.timerSvc.timer;
  readonly elapsed = this.timerSvc.elapsed;
  readonly busy = this.timerSvc.busy;
  private odoo = inject(OdooService);

  // Request failures are toasted centrally by ErrorService; here we only keep
  // the UI consistent (loading flags, refreshed lists) when a call fails.

  async ngOnInit(): Promise<void> {
    try {
      const [entries] = await Promise.all([
        this.odoo.fetchCurrentWeekTimesheet(),
        this.timerSvc.refresh(),
      ]);
      this.entries.set(entries);
    } catch {
      // Already toasted; leave the picker empty.
    } finally {
      this.loading.set(false);
    }
  }

  async start(): Promise<void> {
    if (!this.selected) return;
    const entry = this.selected;
    await this.timerSvc.start(entry.id).then(() => (this.selected = null)).catch(() => {
    });
  }

  async pause(): Promise<void> {
    await this.timerSvc.pause().catch(() => {
    });
  }

  async resume(): Promise<void> {
    await this.timerSvc.resume().catch(() => {
    });
  }

  async stop(): Promise<void> {
    try {
      await this.timerSvc.stop();
      this.entries.set(await this.odoo.fetchCurrentWeekTimesheet());
    } catch {
      // Already toasted.
    }
  }
}

import {Component, effect, inject, signal} from '@angular/core';
import {LoginComponent} from "./login/login.component";
import {ToastModule} from "primeng/toast";
import {ConfirmDialogModule} from "primeng/confirmdialog";
import {AddOrEditTimesheetComponent} from "./features/add-or-edit-timesheet/add-or-edit-timesheet.component";
import {TimerComponent} from "./features/timer/timer.component";
import {TimesheetEntry} from "./_models/odoo/timesheet-entry.model";
import {TimerService} from "./features/timer/timer.service";
import {AuthService} from "./_services/auth.service";
import {OdooService} from "./_services/odoo/odoo.service";
import {WeeklyTimesheetComponent} from "./features/weekly-timesheet/weekly-timesheet.component";
import {AZURE_PREFILL_KEY} from "./_constants/storage-keys";
import {StorageService} from "./_services/storage.service";
import {Tab} from "./_models/tab-selector";
import {APP_TITLE} from "./_constants/app-constants";
import {SettingsComponent} from "./_settings/settings/settings.component";

import {AzurePrefill} from "./_models/azure/azure-prefill.model";

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [LoginComponent, WeeklyTimesheetComponent, AddOrEditTimesheetComponent, TimerComponent, SettingsComponent, ToastModule, ConfirmDialogModule, SettingsComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = APP_TITLE;
  readonly activeTab = signal<Tab>(Tab.Timesheet);
  /** Whether the custom-fields settings screen is open. */
  readonly settingsOpen = signal(false);
  /** The entry the "Add" tab is editing, or null to add a new one. */
  readonly editingEntry = signal<TimesheetEntry | null>(null);
  /** Pre-fill for a new entry handed over from an Azure work item, consumed once. */
  readonly azurePrefill = signal<AzurePrefill | null>(null);
  readonly timerSvc = inject(TimerService);
  protected readonly Tab = Tab;
  private readonly auth = inject(AuthService);
  readonly loggedIn = this.auth.loggedIn;
  private readonly odoo = inject(OdooService);
  private readonly storage = inject(StorageService);

  constructor() {
    // Once logged in, pick up any timer that's already running server-side.
    effect(() => {
      if (this.loggedIn()) this.timerSvc.refresh();
    });
    // If the popup was opened from an Azure work item, land on a pre-filled Add form.
    void this.consumeAzurePrefill();
  }

  setTab(tab: Tab): void {
    this.activeTab.set(tab);
  }

  /** Open the editor pre-filled with an existing entry. */
  startEdit(entry: TimesheetEntry): void {
    this.editingEntry.set(entry);
    this.activeTab.set(Tab.AddOrEdit);
  }

  /** Open a blank "Add" form (clears any in-progress edit or Azure pre-fill). */
  newEntry(): void {
    this.editingEntry.set(null);
    this.azurePrefill.set(null);
    this.activeTab.set(Tab.AddOrEdit);
  }

  /**
   * Bottom-nav action: while a timer runs, edit the line it's tracking;
   * otherwise open a blank "Add" form.
   */
  async addOrEditEntry(): Promise<void> {
    const timer = this.timerSvc.timer();
    if (!timer) {
      this.newEntry();
      return;
    }
    try {
      this.startEdit(await this.odoo.fetchTimesheetEntry(timer.lineId));
    } catch {
      this.newEntry();
    }
  }

  /** Editor finished with an edit: drop back to the (refreshed) list. */
  onEditorClosed(): void {
    this.editingEntry.set(null);
    this.azurePrefill.set(null);
    this.activeTab.set(Tab.Timesheet);
  }

  /** Timer started from the editor: clear the Azure pre-fill and show the timer. */
  onTimerStarted(): void {
    this.editingEntry.set(null);
    this.azurePrefill.set(null);
    this.setTab(Tab.Timer);
  }

  logout(): void {
    this.auth.logout();
  }

  /** Reads (and clears) any Azure hand-off, opening the Add tab pre-filled. */
  private async consumeAzurePrefill(): Promise<void> {
    const prefill = await this.storage.get<AzurePrefill>(AZURE_PREFILL_KEY);
    if (!prefill) return;
    await this.storage.remove(AZURE_PREFILL_KEY);
    this.editingEntry.set(null);
    this.azurePrefill.set(prefill);
    this.activeTab.set(Tab.AddOrEdit);
  }
}

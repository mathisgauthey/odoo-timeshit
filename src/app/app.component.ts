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
import {DebugInfoComponent} from "./debug/debug-info/debug-info.component";

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [LoginComponent, WeeklyTimesheetComponent, AddOrEditTimesheetComponent, TimerComponent, SettingsComponent, ToastModule, ConfirmDialogModule, DebugInfoComponent],
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
  /** True when this app is the standalone window opened from an Azure work item. */
  private isAzureWindow = false;

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
    if (this.closeIfAzureWindow()) return;
    this.editingEntry.set(null);
    this.azurePrefill.set(null);
    this.setTab(Tab.Timer);
  }

  /** New entry saved from the editor: close the Azure window, if that's what this is. */
  onSaved(): void {
    this.closeIfAzureWindow();
  }

  logout(): void {
    this.auth.logout();
  }

  /** Reads (and clears) any Azure hand-off, opening the Add tab pre-filled. */
  private async consumeAzurePrefill(): Promise<void> {
    const prefill = await this.storage.get<AzurePrefill>(AZURE_PREFILL_KEY);
    if (!prefill) return;
    await this.storage.remove(AZURE_PREFILL_KEY);
    this.isAzureWindow = true;
    this.editingEntry.set(null);
    this.azurePrefill.set(prefill);
    this.activeTab.set(Tab.AddOrEdit);
    this.fitAndCenterWindow();
  }

  /**
   * The Azure hand-off opens this app as a standalone popup window. Chrome sizes
   * that window's *outer* bounds, so the fixed 800×600 content (see styles.css)
   * ends up clipped by the title bar. Correct the outer bounds so the content is
   * exactly 800×600, then center the window on the screen.
   */
  private fitAndCenterWindow(): void {
    const chrome = (globalThis as any).chrome;
    if (!chrome?.windows) return;
    const width = 800 + (window.outerWidth - window.innerWidth);
    const height = 600 + (window.outerHeight - window.innerHeight);
    const left = Math.max(0, Math.round((screen.availWidth - width) / 2));
    const top = Math.max(0, Math.round((screen.availHeight - height) / 2));
    chrome.windows.getCurrent((win: any) => {
      if (win?.id != null) chrome.windows.update(win.id, {width, height, left, top});
    });
  }

  /** Closes the standalone Azure editor window; returns true when it was one. */
  private closeIfAzureWindow(): boolean {
    if (!this.isAzureWindow) return false;
    window.close();
    return true;
  }
}

import {Component, inject, input, OnInit, output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {AutoCompleteModule, AutoCompleteSelectEvent} from 'primeng/autocomplete';
import {SelectButtonModule} from 'primeng/selectbutton';
import {InputTextModule} from 'primeng/inputtext';
import {InputTextareaModule} from 'primeng/inputtextarea';
import {ButtonModule} from 'primeng/button';
import {ConfirmationService, MessageService} from 'primeng/api';
import {TimerService} from '../timer/timer.service';
import {NamedRecord} from "../../_models/odoo/named-record.models";
import {TimesheetEntry} from "../../_models/odoo/timesheet-entry.model";
import {LinkedRecord} from "../../_models/odoo/linked-record.models";
import {OdooService} from "../../_services/odoo/odoo.service";
import {hoursToHhmm, parseDuration} from "../../_helpers/duration";
import {CreateTimesheetValues} from "../../_models/odoo/create-timesheet-values.model";
import {Many2One} from "../../_models/odoo/many2one.model";
import {CustomFieldService} from "../../_services/custom-field.service";
import {CustomFieldComponent} from "../../_settings/custom-fields-settings/custom-field/custom-field.component";

import {AzurePrefill} from "../../_models/azure/azure-prefill.model";

/**
 * Which pair of links the entry uses. Both modes log against a `project.project`
 * (shown as "Project" or "Assistance"); the second field is either a
 * `project.task` or a `helpdesk.ticket`.
 */
type EntryMode = 'project' | 'assistance';

@Component({
  selector: 'app-add-or-edit-timesheet',
  standalone: true,
  imports: [
    FormsModule,
    AutoCompleteModule,
    SelectButtonModule,
    InputTextModule,
    InputTextareaModule,
    ButtonModule,
    CustomFieldComponent,
  ],
  templateUrl: './add-or-edit-timesheet.component.html',
})
export class AddOrEditTimesheetComponent implements OnInit {
  readonly modes = [
    {label: 'Project / Task', value: 'project'},
    {label: 'Assistance / Ticket', value: 'assistance'},
  ];
  /** When set, the form edits this existing line instead of creating a new one. */
  readonly entry = input<TimesheetEntry | null>(null);
  /** When set (and not editing), pre-fills a new entry from an Azure work item. */
  readonly azurePrefill = input<AzurePrefill | null>(null);
  mode: EntryMode = 'project';
  date = todayIso();
  description = '';
  project: NamedRecord | null = null;
  /**
   * Task and ticket are held independently so a work item can pre-fill both, and
   * toggling the mode swaps which one the single autocomplete shows without
   * losing the other. Only the active mode's value is saved (see {@link buildValues}).
   */
  task: NamedRecord | null = null;
  ticket: NamedRecord | null = null;
  /**
   * Targets that an Azure pre-fill couldn't resolve to a record, keyed by field
   * (`project`/`task`/`ticket` or a custom field name) → the unmatched text. The
   * field is flagged in the form so the user knows to search or create it.
   */
  prefillErrors: Record<string, string> = {};
  /** What the user sees/types in the duration field ("2:30", "02:30" or "2.5"). */
  timeText = '';
  /** Parsed duration in hours, kept live for validation and saving. */
  hours: number | null = null;
  projectSuggestions: NamedRecord[] = [];
  secondarySuggestions: LinkedRecord[] = [];
  /** Live values for the configured custom fields, keyed by technical name. */
  customValues: Record<string, any> = {};
  saving = false;
  starting = false;
  deleting = false;
  /** Id of the line being edited, or null in create mode. */
  editingId: number | null = null;
  /** Emitted once a timer has started, so the host can switch to the timer tab. */
  readonly timerStarted = output<void>();
  /** Emitted when an edit finishes (saved or cancelled), so the host can leave the editor. */
  readonly closed = output<void>();
  private odoo = inject(OdooService);
  private messages = inject(MessageService);
  private confirmation = inject(ConfirmationService);
  private timerSvc = inject(TimerService);
  private config = inject(CustomFieldService);
  /** The instance-specific fields to render below the core ones. */
  readonly customFields = this.config.customFields;

  get editing(): boolean {
    return this.editingId != null;
  }

  get title(): string {
    return this.editing ? 'Edit Entry' : 'New Entry';
  }

  get saveLabel(): string {
    return this.editing ? 'Save Changes' : 'Save Entry';
  }

  get projectLabel(): string {
    return this.mode === 'project' ? 'PROJECT' : 'ASSISTANCE';
  }

  get secondaryLabel(): string {
    return this.mode === 'project' ? 'TASK' : 'TICKET';
  }

  /** The single autocomplete is backed by `task` or `ticket` depending on the mode. */
  get secondary(): NamedRecord | null {
    return this.mode === 'project' ? this.task : this.ticket;
  }

  set secondary(value: NamedRecord | null) {
    if (this.mode === 'project') this.task = value;
    else this.ticket = value;
  }

  /** Which prefill-error key the second field maps to, given the current mode. */
  get secondaryErrorKey(): string {
    return this.mode === 'project' ? 'task' : 'ticket';
  }

  get canSave(): boolean {
    return !this.busy && !!this.project && !!this.description.trim() && !!this.hours && this.hours > 0;
  }

  /** A timer accumulates its own hours, so it only needs the project + description. */
  get canStartTimer(): boolean {
    return !this.busy && !!this.project && !!this.description.trim();
  }

  private get busy(): boolean {
    return this.saving || this.starting || this.deleting;
  }

  /** Clears a field's pre-fill error once the user touches it. */
  clearPrefillError(key: string): void {
    if (this.prefillErrors[key] != null) delete this.prefillErrors[key];
  }

  ngOnInit(): void {
    const entry = this.entry();
    if (entry) {
      this.prefill(entry);
      return;
    }
    const azure = this.azurePrefill();
    if (azure) void this.applyAzurePrefill(azure);
  }

  /**
   * Switching modes just swaps which link the autocomplete shows; task and ticket
   * keep their own values (only the active one is saved). Drop the now-irrelevant
   * suggestions so the dropdown reloads against the right model.
   */
  onModeChange(): void {
    this.secondarySuggestions = [];
  }

  async searchProjects(event: { query: string }): Promise<void> {
    this.projectSuggestions = await this.odoo.searchProjects(event.query);
  }

  async searchSecondary(event: { query: string }): Promise<void> {
    // Once a project is picked, scope the task/ticket list to it.
    const projectId = this.project?.id;
    this.secondarySuggestions = this.mode === 'project'
      ? await this.odoo.searchTasks(event.query, projectId)
      : await this.odoo.searchTickets(event.query, projectId);
  }

  /** Picking a task/ticket fills in its project when none was chosen yet. */
  onSecondarySelect(event: AutoCompleteSelectEvent): void {
    this.clearPrefillError(this.secondaryErrorKey);
    const selected = event.value as LinkedRecord;
    if (!this.project && selected.project_id) {
      this.project = toRecord(selected.project_id);
    }
  }

  /** Re-parse the duration on every keystroke so validation stays live. */
  onTimeInput(value: string): void {
    this.timeText = value;
    this.hours = parseDuration(value);
  }

  /** On blur, normalize whatever was typed ("2.5", "2:30") to a tidy "02:30". */
  onTimeBlur(): void {
    if (this.hours != null) this.timeText = hoursToHhmm(this.hours);
  }

  async save(): Promise<void> {
    if (!this.canSave) return;

    this.saving = true;
    try {
      const values = this.buildValues(this.hours!);
      if (this.editingId != null) {
        await this.odoo.updateTimesheet(this.editingId, values);
        this.closed.emit();
      } else {
        await this.odoo.createTimesheet(values);
        this.messages.add({severity: 'success', summary: 'Entry saved'});
        this.reset();
      }
    } catch {
      // Request failures are toasted centrally by ErrorService.
    } finally {
      this.saving = false;
    }
  }

  /** Start a timer on this entry (creating the line first when adding a new one). */
  async startTimer(): Promise<void> {
    if (!this.canStartTimer) return;

    this.starting = true;
    try {
      const id = this.editingId ?? await this.odoo.createTimesheet(this.buildValues(0));
      await this.timerSvc.start(id);
      this.clearForm();
      this.timerStarted.emit();
    } catch {
      // Request failures are toasted centrally by ErrorService.
    } finally {
      this.starting = false;
    }
  }

  /** Ask for confirmation, then permanently delete the line being edited. */
  confirmDelete(): void {
    if (this.editingId == null) return;

    this.confirmation.confirm({
      header: 'Delete timesheet entry?',
      message: `Are you sure you want to delete this timesheet entry: `
        + `"${this.description.trim() || 'Untitled'}" on ${this.project?.name || 'no project'} `
        + `(${this.hours != null ? hoursToHhmm(this.hours) : '00:00'})?`,
      icon: 'pi pi-trash',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.delete(),
    });
  }

  reset(): void {
    // While editing, Cancel/Reset hands control back to the host instead of
    // wiping into a blank create form.
    if (this.editing) {
      this.closed.emit();
      return;
    }
    this.clearForm();
  }

  /**
   * Best-effort pre-fill of a new entry from an Azure work item. Scalar values
   * (description, text/number custom fields) are set directly; relational ones
   * (project, task, ticket, many2one custom fields) are resolved by name-search
   * against their model, picking an exact name match or the first result.
   *
   * Task and ticket are resolved into their own slots, so a work item that maps
   * both still keeps both (only the active mode is saved). When a relational
   * lookup finds nothing, the field is flagged via {@link prefillErrors} so the
   * user knows to search or create it. The mode lands on whichever of task/ticket
   * resolved, preferring task.
   */
  private async applyAzurePrefill(prefill: AzurePrefill): Promise<void> {
    const ordered = [...prefill.fields].sort((a, b) => prefillRank(a.target) - prefillRank(b.target));
    for (const {target, value} of ordered) {
      const text = value?.trim();
      if (!text) continue;
      if (target === 'description') {
        this.description = this.description ? `${this.description} ${text}` : text;
      } else if (target === 'project') {
        this.project = await this.resolveOrFlag(this.odoo.searchProjects(text), text, 'project');
      } else if (target === 'task') {
        this.task = await this.resolveOrFlag(this.odoo.searchTasks(text, this.project?.id), text, 'task');
      } else if (target === 'ticket') {
        this.ticket = await this.resolveOrFlag(this.odoo.searchTickets(text, this.project?.id), text, 'ticket');
      } else {
        const field = this.customFields().find(f => f.name === target);
        if (!field) continue;
        if (field.type === 'many2one' && field.relation) {
          this.customValues[target] = await this.resolveOrFlag(this.odoo.searchRecords(field.relation, text), text, target);
        } else if (field.type === 'boolean') {
          this.customValues[target] = /^(true|1|yes|oui)$/i.test(text);
        } else {
          this.customValues[target] = text;
        }
      }
    }
    // Show the field the work item actually carried, preferring a task over a ticket.
    if (this.task) this.mode = 'project';
    else if (this.ticket) this.mode = 'assistance';
  }

  /**
   * Resolves a name-search to a record (exact name match, else first hit). When
   * nothing matches, records the unmatched text under `errorKey` so the form can
   * flag the field for manual search/creation, and returns null.
   */
  private async resolveOrFlag(search: Promise<NamedRecord[]>, query: string, errorKey: string): Promise<NamedRecord | null> {
    try {
      const results = await search;
      const lower = query.toLowerCase();
      const match = results.find(r => r.name.toLowerCase() === lower) ?? results[0] ?? null;
      if (match) delete this.prefillErrors[errorKey];
      else this.prefillErrors[errorKey] = query;
      return match;
    } catch {
      this.prefillErrors[errorKey] = query;
      return null;
    }
  }

  private async delete(): Promise<void> {
    if (this.editingId == null) return;

    this.deleting = true;
    try {
      await this.odoo.deleteTimesheet(this.editingId);
      this.messages.add({severity: 'success', summary: 'Entry deleted'});
      this.closed.emit();
    } catch {
      // Request failures are toasted centrally by ErrorService.
    } finally {
      this.deleting = false;
    }
  }

  /** Assemble the create payload from the form, with the given logged hours. */
  private buildValues(hours: number): CreateTimesheetValues {
    const values: CreateTimesheetValues = {
      name: this.description.trim(),
      date: this.date,
      unit_amount: hours,
      project_id: this.project!.id,
    };
    // Send only the active mode's link and explicitly null the other. Task and
    // ticket are mutually exclusive on a line, so even if a work item pre-filled
    // both, we never send them together.
    if (this.mode === 'project') {
      values.task_id = this.task?.id ?? false;
      values.helpdesk_ticket_id = false;
    } else {
      values.helpdesk_ticket_id = this.ticket?.id ?? false;
      values.task_id = false;
    }

    // Append the configured custom fields: many2one sends an id (or false to
    // clear), everything else sends its scalar (empty/null clears to false).
    for (const field of this.customFields()) {
      const value = this.customValues[field.name];
      if (field.type === 'many2one') {
        values[field.name] = value?.id ?? false;
      } else {
        values[field.name] = value === '' || value == null ? false : value;
      }
    }
    return values;
  }

  /** Wipe the form back to a blank create state, without any navigation side effects. */
  private clearForm(): void {
    this.description = '';
    this.project = null;
    this.task = null;
    this.ticket = null;
    this.prefillErrors = {};
    this.customValues = {};
    this.hours = null;
    this.timeText = '';
  }

  /** Populate the form from an existing line so it can be edited. */
  private prefill(entry: TimesheetEntry): void {
    this.editingId = entry.id;
    this.mode = entry.helpdesk_ticket_id ? 'assistance' : 'project';
    this.date = entry.date;
    this.description = entry.name ?? '';
    this.project = toRecord(entry.project_id);
    this.task = toRecord(entry.task_id);
    this.ticket = toRecord(entry.helpdesk_ticket_id);
    this.hours = entry.unit_amount;
    this.timeText = hoursToHhmm(entry.unit_amount);

    // Map each custom field's stored value into the editor's expected shape.
    for (const field of this.customFields()) {
      const raw = entry[field.name];
      if (field.type === 'many2one') {
        this.customValues[field.name] = toRecord(raw as Many2One);
      } else if (field.type === 'boolean') {
        this.customValues[field.name] = raw === true;
      } else {
        this.customValues[field.name] = raw === false || raw == null ? null : raw;
      }
    }
  }
}

/** Prefill ordering: resolve the project before task/ticket so their search can scope to it. */
function prefillRank(target: string): number {
  if (target === 'project') return 0;
  if (target === 'task' || target === 'ticket') return 2;
  return 1;
}

/** A many2one `[id, name]` tuple as an autocomplete-ready record, or null when unset. */
function toRecord(field: Many2One): NamedRecord | null {
  return field ? {id: field[0], name: field[1]} : null;
}

/** Local ISO date (YYYY-MM-DD) for today, without timezone drift. */
function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

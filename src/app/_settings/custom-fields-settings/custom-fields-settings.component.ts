import {Component, inject} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {ButtonModule} from 'primeng/button';
import {InputTextModule} from 'primeng/inputtext';
import {DropdownModule} from 'primeng/dropdown';
import {MessageService} from 'primeng/api';
import {TIMESHEET_MODEL} from "../../_constants/odoo-models";
import {CustomFieldConfig} from "../../_models/odoo/custom-field-config.model";
import {OdooService} from "../../_services/odoo/odoo.service";
import {CustomFieldService} from "../../_services/custom-field.service";
import {LoadingService} from "../../_services/loading.service";
import {FieldType} from "../../_models/odoo/field-types";

/**
 * Config panel for the instance-specific custom timesheet fields.
 *
 * Add a field by its technical name; "Detect" introspects the Odoo model to fill
 * in the type, label and (for relations) the target model, all of which stay
 * editable. The saved list drives the editor and the weekly list.
 */
@Component({
  selector: 'app-custom-fields-settings',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, DropdownModule, AsyncPipe],
  templateUrl: './custom-fields-settings.component.html',
})
export class CustomFieldsSettingsComponent {
  readonly config = inject(CustomFieldService);
  readonly typeOptions = Object.values(FieldType).map(t => ({label: t, value: t}));
  /** The field currently being added or edited, or null when just listing. */
  draft: CustomFieldConfig | null = null;
  loadingService = inject(LoadingService)
  /** Original name when editing, so a rename can drop the old entry. */
  protected editingOriginalName: string | null = null;
  protected readonly FieldType = FieldType;
  private readonly odoo = inject(OdooService);
  private readonly messages = inject(MessageService);

  /** True once the draft has both a non-blank technical name and label. */
  get canSave(): boolean {
    return !!this.draft?.name.trim() && !!this.draft?.label.trim();
  }

  /** Opens a blank draft for adding a new field. */
  startAdd(): void {
    this.draft = {name: '', label: '', type: FieldType.Many2one};
    this.editingOriginalName = null;
  }

  /** Opens a draft pre-filled from an existing field, remembering its original name. */
  startEdit(field: CustomFieldConfig): void {
    this.draft = {...field};
    this.editingOriginalName = field.name;
  }

  /** Discards the current draft and returns to the plain list view. */
  cancelDraft(): void {
    this.draft = null;
    this.editingOriginalName = null;
  }

  /** Introspect the Odoo timesheet model to auto-fill the draft's type/label/relation. */
  async detect(): Promise<void> {
    const draft = this.draft;
    const name = draft?.name.trim();
    if (!draft || !name) return;
    await this.loadingService.executeWithLoading(async () => {
      const meta = await this.odoo.describeField(TIMESHEET_MODEL, name);
      if (!meta) {
        this.messages.add({severity: 'warn', summary: 'Field not found', detail: name});
        return;
      }
      this.draft = {
        ...draft,
        label: draft.label.trim() || meta.string || name,
        type: meta.type,
        relation: meta.relation,
        selection: meta.selection,
      };
    }, () => {
      // The error handler has already toasted the failure; swallow it.
    });
  }

  /**
   * Persists the draft: trims its name/label, clears the relation for non-relational
   * types, drops the old entry on a rename, then upserts and closes the draft.
   */
  async save(): Promise<void> {
    if (!this.draft || !this.canSave) return;
    const field: CustomFieldConfig = {...this.draft, name: this.draft.name.trim(), label: this.draft.label.trim()};
    if (field.type !== FieldType.Many2one) field.relation = undefined;
    if (this.editingOriginalName && this.editingOriginalName !== field.name) {
      await this.config.removeField(this.editingOriginalName);
    }
    await this.config.upsertField(field);
    this.cancelDraft();
  }

  /** Deletes the configured field with the given technical name. */
  remove(name: string): void {
    this.config.removeField(name);
  }
}

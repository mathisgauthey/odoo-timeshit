import {Component, inject, input, model} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {AutoCompleteModule, AutoCompleteSelectEvent} from 'primeng/autocomplete';
import {InputTextModule} from 'primeng/inputtext';
import {InputTextareaModule} from 'primeng/inputtextarea';
import {DropdownModule} from 'primeng/dropdown';
import {CheckboxModule} from 'primeng/checkbox';
import {NamedRecord} from "../../../_models/odoo/named-record.models";
import {CustomFieldConfig} from "../../../_models/odoo/custom-field-config.model";
import {OdooService} from "../../../_services/odoo/odoo.service";
import {FieldType} from "../../../_models/odoo/field-types";
import {Widget} from "../../../_models/widget";

/** A relational suggestion; `createName` marks the synthetic "create new" row. */
interface RelationOption extends NamedRecord {
  createName?: string;
}

/**
 * Renders one custom field as the right input for its Odoo type, two-way bound
 * via `value`.
 */
@Component({
  selector: 'app-custom-field',
  standalone: true,
  imports: [FormsModule, AutoCompleteModule, InputTextModule, InputTextareaModule, DropdownModule, CheckboxModule],
  templateUrl: './custom-field.component.html',
})
export class CustomFieldComponent {
  readonly field = input.required<CustomFieldConfig>();
  readonly value = model<any>(null);
  /** When true, the field is flagged red: e.g. an Azure pre-fill found no match. */
  readonly invalid = input(false);
  suggestions: RelationOption[] = [];
  protected readonly Widget = Widget;
  private readonly odoo = inject(OdooService);

  /** Which input to show for this field's Odoo type. */
  get widget(): Widget {
    switch (this.field().type) {
      case FieldType.Many2one:
        return Widget.Relation;
      case FieldType.Integer:
      case FieldType.Float:
      case FieldType.Monetary:
        return Widget.Number;
      case FieldType.Boolean:
        return Widget.Boolean;
      case FieldType.Date:
        return Widget.Date;
      case FieldType.Datetime:
        return Widget.Datetime;
      case FieldType.Selection:
        return Widget.Selection;
      case FieldType.Text:
        return Widget.Text;
      default:
        return Widget.Text;
    }
  }

  /** `[{label, value}]` options for a selection field's dropdown. */
  get selectOptions(): { label: string; value: string }[] {
    return (this.field().selection ?? []).map(([value, label]) => ({label, value}));
  }

  /**
   * Fetches relational matches for the typed query and, when nothing matches the
   * name exactly, appends a synthetic "create new" row so the user can add it inline.
   */
  async search(event: { query: string }): Promise<void> {
    const relation = this.field().relation;
    if (!relation) return;
    const matches = await this.odoo.searchRecords(relation, event.query);
    const query = event.query.trim();
    const exists = matches.some(m => m.name.toLowerCase() === query.toLowerCase());
    // Offer to create when nothing matches the typed name exactly.
    this.suggestions = query && !exists
      ? [...matches, {id: 0, name: `Create "${query}"`, createName: query}]
      : matches;
  }

  /** Creating from the synthetic row makes the record, then selects the real one. */
  async onSelect(event: AutoCompleteSelectEvent): Promise<void> {
    const option = event.value as RelationOption;
    const relation = this.field().relation;
    if (!option.createName || !relation) return;
    try {
      const id = await this.odoo.createNamedRecord(relation, option.createName);
      this.value.set({id, name: option.createName});
    } catch {
      // Creation failure is toasted centrally by ErrorService; just clear the pick.
      this.value.set(null);
    }
  }
}

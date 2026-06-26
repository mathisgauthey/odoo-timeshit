import {Component, computed, inject, OnInit} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ButtonModule} from 'primeng/button';
import {InputTextModule} from 'primeng/inputtext';
import {DropdownModule} from 'primeng/dropdown';
import {MessageService} from 'primeng/api';
import {CustomFieldService} from "../../_services/custom-field.service";
import {AzureSettingsService} from "../../_services/azure-settings.service";
import {AzureConfig} from "../../_models/azure/azure-config.model";
import {AzureFieldMapping} from "../../_models/azure/azure-field-mapping.model";
import {SOURCE_ID, SOURCE_TITLE} from "../../_constants/azure/azure-constants";

/**
 * Settings panel for the Azure DevOps integration: the base URL whose work-item
 * pages get the timer widget, which timesheet property is matched against the
 * work item id to reuse an existing entry, and the pre-built field associations
 * applied when creating a new entry from a work item.
 */
@Component({
  selector: 'app-azure-settings',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, DropdownModule],
  templateUrl: './azure-settings.component.html',
})
export class AzureSettingsComponent implements OnInit {
  readonly sourceId = SOURCE_ID;
  readonly sourceTitle = SOURCE_TITLE;
  /** Working copy edited in the form; persisted on Save. */
  draft: AzureConfig = {baseUrl: '', matchField: 'name', mappings: []};
  saving = false;
  private readonly azure = inject(AzureSettingsService);
  private readonly config = inject(CustomFieldService);
  /** Timesheet properties the work item id can be matched against. */
  readonly matchOptions = computed(() => [
    {label: 'Description', value: 'name'},
    {label: 'Project', value: 'project_id'},
    {label: 'Task', value: 'task_id'},
    {label: 'Ticket', value: 'helpdesk_ticket_id'},
    ...this.config.customFields().map(f => ({label: f.label, value: f.name})),
  ]);
  /** Where a mapped work-item value can land in the add/edit form. */
  readonly targetOptions = computed(() => [
    {label: 'Description', value: 'description'},
    {label: 'Project / Assistance', value: 'project'},
    {label: 'Task', value: 'task'},
    {label: 'Ticket', value: 'ticket'},
    ...this.config.customFields().map(f => ({label: f.label, value: f.name})),
  ]);
  private readonly messages = inject(MessageService);

  ngOnInit(): void {
    this.azure.ready.then(() => {
      const c = this.azure.config();
      this.draft = {...c, mappings: c.mappings.map(m => ({...m}))};
    });
  }

  addMapping(): void {
    this.draft.mappings = [...this.draft.mappings, {source: SOURCE_ID, target: 'description'}];
  }

  removeMapping(mapping: AzureFieldMapping): void {
    this.draft.mappings = this.draft.mappings.filter(m => m !== mapping);
  }

  async save(): Promise<void> {
    this.saving = true;
    try {
      await this.azure.save({
        baseUrl: this.draft.baseUrl.trim(),
        matchField: this.draft.matchField,
        mappings: this.draft.mappings.filter(m => m.source.trim()),
      });
      this.messages.add({severity: 'success', summary: 'Azure settings saved'});
    } finally {
      this.saving = false;
    }
  }
}

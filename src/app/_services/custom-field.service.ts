import {inject, Injectable, signal} from '@angular/core';
import {CustomFieldConfig} from "../_models/odoo/custom-field-config.model";
import {CUSTOM_FIELDS_KEY} from "../_constants/storage-keys";
import {StorageService} from "./storage.service";

/**
 * Holds the list of custom timesheet fields for this Odoo instance, persisted to
 * `chrome.storage.local`. Everything that needs to know "which extra fields exist"
 * (the editor, the weekly list, the Odoo fetches) reads from here.
 */
@Injectable({providedIn: 'root'})
export class CustomFieldService {
  readonly customFields = signal<CustomFieldConfig[]>([]);
  /** Resolves once the persisted config has loaded; awaited before fetches. */
  readonly ready: Promise<void>;
  private readonly storage = inject(StorageService);

  /** Kicks off the initial load and exposes its promise as {@link ready}. */
  constructor() {
    this.ready = this.load();
  }

  /** Technical names of the configured fields, for Odoo `fields` lists. */
  fieldNames(): string[] {
    return this.customFields().map(f => f.name);
  }

  /** Adds a field, or replaces one with the same name in place, and persists. */
  async upsertField(field: CustomFieldConfig): Promise<void> {
    const fields = this.customFields();
    const index = fields.findIndex(f => f.name === field.name);
    const next = index >= 0
      ? fields.map((f, i) => (i === index ? field : f))
      : [...fields, field];
    await this.setFields(next);
  }

  /** Removes the field with the given technical name and persists. */
  async removeField(name: string): Promise<void> {
    await this.setFields(this.customFields().filter(f => f.name !== name));
  }

  /** Updates the in-memory signal and writes the new list to storage. */
  private async setFields(fields: CustomFieldConfig[]): Promise<void> {
    this.customFields.set(fields);
    await this.storage.set(CUSTOM_FIELDS_KEY, fields);
  }

  /** Hydrates the signal from persisted storage; leaves it empty if nothing is stored. */
  private async load(): Promise<void> {
    const stored = await this.storage.get<CustomFieldConfig[]>(CUSTOM_FIELDS_KEY);
    if (stored) this.customFields.set(stored);
  }
}

import {inject, Injectable} from '@angular/core';
import {OdooJson2Api,} from './odoo-json2-api';
import {CustomFieldService} from "../custom-field.service";
import {OdooFieldMetadata} from "../../_models/odoo/odoo-field-metadata.model";
import {NamedRecord} from "../../_models/odoo/named-record.models";
import {LinkedRecord} from "../../_models/odoo/linked-record.models";
import {CreateTimesheetValues} from "../../_models/odoo/create-timesheet-values.model";
import {RunningTimer} from "../../_models/odoo/running-timer.model";
import {OdooCredentials} from "../../_models/odoo/odoo-credentials.credentials";
import {TimesheetEntry} from "../../_models/odoo/timesheet-entry.model";
import {CREDENTIALS_KEY} from "../../_constants/storage-keys";
import {ErrorService} from "../error.service";
import {StorageService} from "../storage.service";
import {currentWeekRange} from "../../_helpers/currentWeekRange";

/**
 * App-facing Odoo gateway.
 *
 * Builds an {@link OdooJson2Api} from the credentials stored at login
 * (`chrome.storage.local`) and exposes the high-level calls the UI needs.
 * Components inject this rather than constructing an API client themselves, so
 * credential plumbing lives in one place.
 *
 * Login is the one call that can't read from storage (no credentials are stored
 * yet), so {@link verifyCredentials} takes the candidate credentials directly;
 * everything post-login resolves them through {@link getApi}.
 */
@Injectable({providedIn: 'root'})
export class OdooService {
  private readonly config = inject(CustomFieldService);
  private readonly errors = inject(ErrorService);
  private readonly storage = inject(StorageService);

  /**
   * Verifies a candidate set of credentials by fetching the user context.
   *
   * Unlike every other call, this builds the client from the passed-in
   * credentials rather than from storage, since login runs before anything is
   * persisted. Errors propagate to the caller and through the central handler.
   *
   * @param creds - The candidate credentials to verify.
   * @returns A promise that resolves with the user context from Odoo.
   */
  async verifyCredentials(creds: OdooCredentials): Promise<any> {
    const api = new OdooJson2Api(creds.odooBaseUrl, creds.apiKey, e => this.errors.handle(e));
    return api.getContext();
  }

  /**
   * Resolves the stored timesheet lines for the given inclusive date range.
   *
   * @param startDate - The start date of the range (inclusive)
   * @param endDate - The end date of the range (inclusive)
   * @returns A promise that resolves with an array of timesheet entries
   */
  async fetchWeeklyTimesheet(startDate: string, endDate: string): Promise<TimesheetEntry[]> {
    await this.config.ready;
    const api = await this.getApi();
    return api.fetchWeeklyTimesheet(startDate, endDate, this.config.fieldNames());
  }

  /**
   * Retrieves project autocomplete suggestions for the given query.
   *
   * @param query - The search query string
   * @returns A promise that resolves with an array of matching named records
   */
  async searchProjects(query: string): Promise<NamedRecord[]> {
    return (await this.getApi()).searchProjects(query);
  }

  /**
   * Retrieves task autocomplete suggestions, optionally scoped to a project.
   *
   * @param query - The search query string
   * @param projectId - Optional project ID to scope the search results
   * @returns A promise that resolves with an array of matching linked records
   */
  async searchTasks(query: string, projectId?: number): Promise<LinkedRecord[]> {
    return (await this.getApi()).searchTasks(query, projectId);
  }

  /**
   * Retrieves helpdesk ticket autocomplete suggestions, optionally scoped to a project.
   *
   * @param query - The search query string
   * @param projectId - Optional project ID to scope the search results
   * @returns A promise that resolves with an array of matching linked records
   */
  async searchTickets(query: string, projectId?: number): Promise<LinkedRecord[]> {
    return (await this.getApi()).searchTickets(query, projectId);
  }

  /**
   * Performs a name-search on any model (autocomplete source for relational custom fields).
   *
   * @param model - The Odoo model name to search
   * @param query - The search query string
   * @returns A promise that resolves with an array of matching named records
   */
  async searchRecords(model: string, query: string): Promise<NamedRecord[]> {
    return (await this.getApi()).searchRecords(model, query);
  }

  /**
   * Creates a record on any model from just a name.
   *
   * @param model - The Odoo model name
   * @param name - The name value for the new record
   * @returns A promise that resolves with the ID of the newly created record
   */
  async createNamedRecord(model: string, name: string): Promise<number> {
    return (await this.getApi()).createNamedRecord(model, name);
  }

  /**
   * Introspects a field on a model (used to auto-detect a custom field's type).
   *
   * @param model - The Odoo model name
   * @param name - The field name to introspect
   * @returns A promise that resolves with field metadata, or null if the field is not found
   */
  async describeField(model: string, name: string): Promise<OdooFieldMetadata | null> {
    return (await this.getApi()).describeField(model, name);
  }

  /**
   * Creates a timesheet line.
   *
   * @param values - The values object containing timesheet data
   * @returns A promise that resolves with the ID of the newly created timesheet entry
   */
  async createTimesheet(values: CreateTimesheetValues): Promise<number> {
    return (await this.getApi()).createTimesheet(values);
  }

  /**
   * Updates an existing timesheet line in place.
   *
   * @param id - The ID of the timesheet entry to update
   * @param values - The partial values object containing fields to update
   * @returns A promise that resolves when the update is complete
   */
  async updateTimesheet(id: number, values: Partial<CreateTimesheetValues>): Promise<void> {
    await (await this.getApi()).updateTimesheet(id, values);
  }

  /**
   * Permanently deletes a timesheet line.
   *
   * @param id - The ID of the timesheet entry to delete
   * @returns A promise that resolves when the deletion is complete
   */
  async deleteTimesheet(id: number): Promise<void> {
    await (await this.getApi()).deleteTimesheet(id);
  }

  /**
   * Retrieves timesheet lines for the current Mon→Sun week (used as the timer's task picker).
   *
   * @returns A promise that resolves with an array of timesheet entries for the current week
   */
  async fetchCurrentWeekTimesheet(): Promise<TimesheetEntry[]> {
    await this.config.ready;
    const {startDate, endDate} = currentWeekRange();
    return (await this.getApi()).fetchWeeklyTimesheet(startDate, endDate, this.config.fieldNames());
  }

  /**
   * Reads a single timesheet line by ID, including configured custom fields.
   *
   * @param id - The ID of the timesheet entry to fetch
   * @returns A promise that resolves with the timesheet entry
   */
  async fetchTimesheetEntry(id: number): Promise<TimesheetEntry> {
    await this.config.ready;
    return (await this.getApi()).fetchTimesheetEntry(id, this.config.fieldNames());
  }

  /**
   * Retrieves the user's running or paused timer.
   *
   * @returns A promise that resolves with the running timer object, or null if nothing is currently running
   */
  async fetchRunningTimer(): Promise<RunningTimer | null> {
    return (await this.getApi()).fetchRunningTimer();
  }

  /**
   * Starts a timer for the given timesheet entry.
   *
   * @param id - The ID of the timesheet entry to start the timer for
   * @returns A promise that resolves when the timer has been started
   */
  async startTimer(id: number): Promise<void> {
    await (await this.getApi()).startTimer(id);
  }

  /**
   * Pauses the timer for the given timesheet entry.
   *
   * @param id - The ID of the timesheet entry to pause the timer for
   * @returns A promise that resolves when the timer has been paused
   */
  async pauseTimer(id: number): Promise<void> {
    await (await this.getApi()).pauseTimer(id);
  }

  /**
   * Resumes the timer for the given timesheet entry.
   *
   * @param id - The ID of the timesheet entry to resume the timer for
   * @returns A promise that resolves when the timer has been resumed
   */
  async resumeTimer(id: number): Promise<void> {
    await (await this.getApi()).resumeTimer(id);
  }

  /**
   * Stops the timer for the given timesheet entry.
   *
   * @param id - The ID of the timesheet entry to stop the timer for
   * @returns A promise that resolves when the timer has been stopped
   */
  async stopTimer(id: number): Promise<void> {
    await (await this.getApi()).stopTimer(id);
  }

  /**
   * Retrieves an instance of the OdooJson2Api using stored credentials from local storage.
   *
   * If the credentials are missing or invalid, the promise is rejected with an error.
   * Routes every request's failures through the central error handler.
   *
   * @returns A promise that resolves with an instance of OdooJson2Api or rejects with an authentication error
   * @throws Error when credentials are not found in storage
   */
  private async getApi(): Promise<OdooJson2Api> {
    const creds = await this.storage.get<OdooCredentials>(CREDENTIALS_KEY);
    if (!creds) throw new Error('Not authenticated');
    // Route every request's failures through the central handler
    return new OdooJson2Api(creds.odooBaseUrl, creds.apiKey, e => this.errors.handle(e));
  }
}


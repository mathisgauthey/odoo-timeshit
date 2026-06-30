import {OdooFieldMetadata} from "../../_models/odoo/odoo-field-metadata.model";
import {NamedRecord} from "../../_models/odoo/named-record.models";
import {LinkedRecord} from "../../_models/odoo/linked-record.models";
import {CreateTimesheetValues} from "../../_models/odoo/create-timesheet-values.model";
import {RunningTimer} from "../../_models/odoo/running-timer.model";
import {OdooHttpError} from "../../_models/odoo/odoo-http-error.model";
import {
  GET_CONTEXT,
  ODOO_CREATE,
  ODOO_DELETE,
  ODOO_READ,
  ODOO_SEARCH,
  ODOO_UPDATE
} from "../../_constants/odoo-methods";
import {HELPDESK_MODEL, PROJECT_MODEL, TASK_MODEL, TIMESHEET_MODEL, USER_MODEL} from "../../_constants/odoo-models";
import {TimesheetEntry} from "../../_models/odoo/timesheet-entry.model";
import {RUNNING_TIMER_FIELDS, TIMESHEET_FIELDS} from "../../_constants/odoo-query-fields";

export class OdooJson2Api {
  /**
   * @param baseUrl - The base URL of the Odoo server.
   * @param apiKey - The API key for authentication.
   * @param database - Optional database name to connect to.
   * @param onError - Invoked with every {@link OdooHttpError} before it is thrown,
   *   so a central handler can toast / log out. The error still propagates to the
   *   caller for control flow.
   */
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly onError?: (error: OdooHttpError) => void,
  ) {
  }

  /**
   * Fetches the current user context. Used to verify credentials at login.
   *
   * @returns The user context.
   */
  getContext(): Promise<any> {
    return this.call(USER_MODEL, GET_CONTEXT);
  }

  /**
   * Fetches timesheet lines within an inclusive date range, newest first.
   *
   * @param startDate - The start date (inclusive).
   * @param endDate - The end date (inclusive).
   * @param extraFields - Additional fields to fetch beyond default timesheet fields.
   *
   * @returns An array of timesheet entries.
   */
  fetchWeeklyTimesheet(startDate: string, endDate: string, extraFields: string[] = []): Promise<TimesheetEntry[]> {
    return this.call(TIMESHEET_MODEL, ODOO_SEARCH, {
      domain: [
        ['date', '>=', startDate],
        ['date', '<=', endDate],
      ],
      fields: [...TIMESHEET_FIELDS, ...extraFields],
      order: 'date desc',
    });
  }

  /**
   * Runs an arbitrary domain search against the timesheet model, newest first.
   * Used by the background worker to find a line to reuse for an Azure work item.
   *
   * @param domain - The domain filter for the search.
   * @param extraFields - Additional fields to fetch beyond default timesheet fields.
   * @param limit - Maximum number of results to return. Defaults to 80.
   *
   * @returns An array of timesheet entries.
   */
  searchTimesheet(domain: unknown[], extraFields: string[] = [], limit = 80): Promise<TimesheetEntry[]> {
    return this.call(TIMESHEET_MODEL, ODOO_SEARCH, {
      domain,
      fields: [...TIMESHEET_FIELDS, ...extraFields],
      order: 'date desc',
      limit,
    });
  }

  /**
   * Introspects a single field on a model: its type, label, relation and selection.
   *
   * @param model - The name of the Odoo model.
   * @param name - The name of the field to describe.
   *
   * @returns The field metadata, or null if the field does not exist.
   */
  async describeField(model: string, name: string): Promise<OdooFieldMetadata | null> {
    const result = await this.call(model, 'fields_get', {
      allfields: [name],
      attributes: ['string', 'type', 'relation', 'selection'],
    });
    return result?.[name] ?? null;
  }

  /**
   * Name-search any model (autocomplete source for relational custom fields).
   *
   * @param model - The name of the Odoo model to search.
   * @param query - The search query string.
   *
   * @returns An array of named records matching the query.
   */
  searchRecords(model: string, query: string): Promise<NamedRecord[]> {
    return this.searchByName(model, query);
  }

  /**
   * Creates a record on any model from just a name and returns its new id.
   *
   * @param model - The name of the Odoo model.
   * @param name - The name of the record to create.
   *
   * @returns The ID of the newly created record.
   */
  async createNamedRecord(model: string, name: string): Promise<number> {
    const result = await this.call(model, ODOO_CREATE, {vals_list: {name}});
    return Array.isArray(result) ? result[0] : result;
  }

  /**
   * Autocomplete source for the project field (`project.project`).
   *
   * @param query - The search query string.
   *
   * @returns An array of named records for projects matching the query.
   */
  searchProjects(query: string): Promise<NamedRecord[]> {
    return this.searchByName(PROJECT_MODEL, query);
  }

  /**
   * Autocomplete source for the task field (`project.task`), optionally scoped to a project.
   *
   * @param query - The search query string.
   * @param projectId - Optional project ID to limit results to a specific project.
   *
   * @returns An array of linked records for tasks matching the query.
   */
  searchTasks(query: string, projectId?: number): Promise<LinkedRecord[]> {
    return this.searchLinkedByName(TASK_MODEL, query, projectId);
  }

  /**
   * Autocomplete source for the helpdesk ticket field (`helpdesk.ticket`), optionally scoped to a project.
   *
   * @param query - The search query string.
   * @param projectId - Optional project ID to limit results to a specific project.
   *
   * @returns An array of linked records for tickets matching the query.
   */
  searchTickets(query: string, projectId?: number): Promise<LinkedRecord[]> {
    return this.searchLinkedByName(HELPDESK_MODEL, query, projectId);
  }

  /**
   * Creates a timesheet line and returns its new id.
   *
   * @param values - The values for the new timesheet entry.
   *
   * @returns The ID of the newly created timesheet entry.
   */
  async createTimesheet(values: CreateTimesheetValues): Promise<number> {
    const result = await this.call(TIMESHEET_MODEL, ODOO_CREATE, {vals_list: values});
    return Array.isArray(result) ? result[0] : result;
  }

  /**
   * Updates an existing timesheet line in place.
   *
   * @param id - The ID of the timesheet entry to update.
   * @param values - The values to update on the timesheet entry.
   */
  async updateTimesheet(id: number, values: Partial<CreateTimesheetValues>): Promise<void> {
    await this.call(TIMESHEET_MODEL, ODOO_UPDATE, {ids: [id], vals: values});
  }

  /**
   * Permanently deletes a timesheet line.
   *
   * @param id - The ID of the timesheet entry to delete.
   */
  async deleteTimesheet(id: number): Promise<void> {
    await this.call(TIMESHEET_MODEL, ODOO_DELETE, {ids: [id]});
  }

  /**
   * Reads a single timesheet line by id (used to read fresh `unit_amount`).
   *
   * @param id - The ID of the timesheet entry to fetch.
   * @param extraFields - Additional fields to fetch beyond default timesheet fields.
   *
   * @returns The timesheet entry.
   */
  async fetchTimesheetEntry(id: number, extraFields: string[] = []): Promise<TimesheetEntry> {
    const result = await this.call(TIMESHEET_MODEL, ODOO_READ, {
      ids: [id],
      fields: [...TIMESHEET_FIELDS, ...extraFields]
    });
    return result[0];
  }

  /**
   * Returns the user's currently running/paused timer line, or null if none.
   *
   * @returns The running timer entry, or null if no timer is running.
   */
  async fetchRunningTimer(): Promise<RunningTimer | null> {
    // `is_timer_running` is false while paused (Odoo: timer_start AND NOT
    // timer_pause), and `timer_pause` has no search method so it can't be
    // queried directly.
    // A line keeps its timer record until stopped (stop
    // unlinks it), so match on the searchable `user_timer_id` relation to get
    // both running and paused timers, then prefer the running one.
    const result: RunningTimer[] = await this.call(TIMESHEET_MODEL, ODOO_SEARCH, {
      domain: [['user_timer_id', '!=', false]],
      fields: RUNNING_TIMER_FIELDS,
    });
    if (!result?.length) return null;
    return result.find(t => t.is_timer_running) ?? result[0];
  }

  /**
   * Starts the timer on a timesheet line.
   *
   * @param id - The ID of the timesheet entry.
   *
   * @returns The result from the Odoo server.
   */
  startTimer(id: number): Promise<any> {
    return this.call(TIMESHEET_MODEL, 'action_timer_start', {ids: [id]});
  }

  /**
   * Pauses the running timer on a timesheet line.
   *
   * @param id - The ID of the timesheet entry.
   *
   * @returns The result from the Odoo server.
   */
  pauseTimer(id: number): Promise<any> {
    return this.call(TIMESHEET_MODEL, 'action_timer_pause', {ids: [id]});
  }

  /**
   * Resumes a paused timer on a timesheet line.
   *
   * @param id - The ID of the timesheet entry.
   *
   * @returns The result from the Odoo server.
   */
  resumeTimer(id: number): Promise<any> {
    return this.call(TIMESHEET_MODEL, 'action_timer_resume', {ids: [id]});
  }

  /**
   * Stops the timer on a timesheet line, persisting the elapsed time to Odoo.
   *
   * @param id - The ID of the timesheet entry.
   *
   * @returns The result from the Odoo server.
   */
  stopTimer(id: number): Promise<any> {
    return this.call(TIMESHEET_MODEL, 'action_timer_stop', {ids: [id]});
  }

  /**
   * Case-insensitive `name` search (OR exact id), returning the top matches as `[id, name]` records.
   *
   * @param model - The name of the Odoo model to search.
   * @param query - The search query string.
   *
   * @returns An array of named records matching the query.
   */
  private searchByName(model: string, query: string): Promise<NamedRecord[]> {
    return this.call(model, ODOO_SEARCH, {
      domain: this.nameOrIdDomain(query),
      fields: ['id', 'name'],
      order: 'name asc',
      limit: 20,
    });
  }

  /**
   * Like {@link searchByName}, but also reads each record's `project_id` and can
   * restrict the results to a single project. Used for tasks and tickets, which
   * both belong to a project.
   *
   * @param model - The name of the Odoo model to search.
   * @param query - The search query string.
   * @param projectId - Optional project ID to limit results to a specific project.
   *
   * @returns An array of linked records matching the query.
   */
  private searchLinkedByName(model: string, query: string, projectId?: number): Promise<LinkedRecord[]> {
    const domain: unknown[] = this.nameOrIdDomain(query);
    if (projectId != null) domain.push(['project_id', '=', projectId]);
    return this.call(model, ODOO_SEARCH, {
      domain,
      fields: ['id', 'name', 'project_id'],
      order: 'name asc',
      limit: 20,
    });
  }

  /**
   * Domain matching the record `name` (case-insensitive), OR its exact id when the
   * query is a plain integer, so typing "1234" finds the record with that id as
   * well as any whose name contains "1234". The id branch is prepended with `|`
   * (prefix-notation OR); a trailing `project_id` leaf is then ANDed implicitly.
   *
   * @param query - The search query string.
   *
   * @returns An array representing the Odoo domain filter.
   */
  private nameOrIdDomain(query: string): unknown[] {
    const nameLeaf = ['name', 'ilike', query];
    const trimmed = query.trim();
    if (/^\d+$/.test(trimmed)) {
      return ['|', ['id', '=', Number(trimmed)], nameLeaf];
    }
    return [nameLeaf];
  }

  /**
   * Executes a remote method call to the specified model and method using Odoo's JSON-RPC API.
   *
   * @param model - The name of the Odoo model to interact with.
   * @param method - The name of the method to invoke on the model.
   * @param args - The arguments to pass to the method. Defaults to an empty object.
   *
   * @returns The response from the server parsed as JSON.
   *
   * @throws {@link OdooHttpError} If a network error occurs or the server response indicates an error.
   */
  private async call(model: string, method: string, args: any = {}): Promise<any> {
    const url = `${this.baseUrl.replace(/\/+$/, '')}/json/2/${model}/${method}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': `Bearer ${this.apiKey}`,
    };

    let response: Response;
    try {
      response = await fetch(url, {method: 'POST', headers, body: JSON.stringify(args)});
    } catch {
      throw this.fail(new OdooHttpError(0, 'Network error'));
    }

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        // No (or non-JSON) error body; that's fine.
      }
      throw this.fail(new OdooHttpError(response.status, response.statusText, body));
    }

    return response.json();
  }

  /**
   * Notifies the central error handler, then returns the error so callers can `throw this.fail(...)`.
   *
   * @param error - The error to handle and return.
   *
   * @returns The same error that was passed in.
   */
  private fail(error: OdooHttpError): OdooHttpError {
    this.onError?.(error);
    return error;
  }
}

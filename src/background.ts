/**
 * Extension service worker.
 *
 * Two jobs:
 *  - `export {}` keeps this a module so main.ts can `import()` it in dev mode
 *    (against the chrome shim); harmless in the real service-worker build.
 *  - It is the Odoo gateway for the Azure DevOps content script. A content
 *    script can't call Odoo directly (cross-origin requests inherit the host
 *    page's CORS/CSP), so the work-item widget messages us and we run the
 *    timesheet lookups and timer actions here, where the extension origin
 *    applies. Timer mutations also write the shared `timerState` so an open
 *    popup stays in sync (see TimerService).
 */
import {OdooJson2Api} from "./app/_services/odoo/odoo-json2-api";
import {TIMER_STORAGE_KEY, TimerState, timerStateFromRunning} from "./app/features/timer/timer-state";
import {getStorage, loadAzureConfig, removeStorage, setStorage} from './app/_helpers/storage';
import {TimesheetEntry} from "./app/_models/odoo/timesheet-entry.model";
import {AZURE_PREFILL_KEY, CREDENTIALS_KEY} from "./app/_constants/storage-keys";
import {OdooCredentials} from "./app/_models/odoo/odoo-credentials.credentials";
import {CustomFieldConfig} from "./app/_models/odoo/custom-field-config.model";
import {AzurePrefill} from "./app/_models/azure/azure-prefill.model";

export {};

/** Minimal entry shape the content-script "today" picker renders. */
interface PickerEntry {
  id: number;
  label: string;
}

const chrome = (globalThis as any).chrome;

chrome?.runtime?.onMessage.addListener((message: any, _sender: any, sendResponse: any) => {
  if (!message || typeof message.action !== 'string' || !message.action.startsWith('azure:')) return false;

  // Every handler is async; reply through sendResponse and keep the channel open.
  handle(message)
    .then(data => sendResponse({ok: true, data}))
    .catch((err: any) => sendResponse({ok: false, error: String(err?.message ?? err)}));
  return true;
});

// Pin the running timer onto the toolbar icon. The badge follows the shared
// `timerState`, so it tracks the timer no matter who started it (popup, the
// Azure widget, another window). A storage write also wakes a suspended worker,
// which is exactly when we need to refresh the badge.
chrome?.storage?.onChanged.addListener((changes: any, area: string) => {
  if (area !== 'local' || !(TIMER_STORAGE_KEY in changes)) return;
  syncBadge(changes[TIMER_STORAGE_KEY].newValue ?? null);
});
getStorage<TimerState>(TIMER_STORAGE_KEY).then(syncBadge);

/**
 * Shows a coloured dot on the action icon while a timer is active, matching the
 * popup's timer badge: primary purple while running, secondary slate while paused.
 * Colours mirror the PrimeNG aura-light-purple theme's --primary-color /
 * --text-color-secondary (a badge can't read CSS vars, so they're hardcoded).
 */
function syncBadge(state: TimerState | null): void {
  const action = chrome?.action;
  if (!action) return;
  if (!state) {
    action.setBadgeText({text: ''});
    action.setTitle?.({title: ''});
    return;
  }
  action.setBadgeText({
    text: state.paused
      ? '⏸'
      : '⏵'
  });
  action.setBadgeBackgroundColor({
    color: state.paused
      ? '#64748b'
      : '#8B5CF6'
  });
  action.setBadgeTextColor?.({color: '#ffffff'});
  action.setTitle?.({
    title: `${state.paused
      ? 'Paused'
      : 'Timer running'} — ${state.name}`
  });
}

async function handle(message: any): Promise<unknown> {
  switch (message.action) {
    case 'azure:todayEntries':
      return todayEntries();
    case 'azure:findEntry':
      return findEntry(String(message.workItemId));
    case 'azure:getTimerState':
      return getTimerState();
    case 'azure:startTimer':
      return timerAction('startTimer', message.lineId);
    case 'azure:pauseTimer':
      return timerAction('pauseTimer', message.lineId);
    case 'azure:resumeTimer':
      return timerAction('resumeTimer', message.lineId);
    case 'azure:stopTimer':
      return timerAction('stopTimer', message.lineId);
    case 'azure:openEditor':
      return openEditor(message.prefill);
    default:
      throw new Error(`Unknown action: ${message.action}`);
  }
}

/** Today's timesheet lines, as `{id, label}` for the widget's picker. */
async function todayEntries(): Promise<PickerEntry[]> {
  const api = await getApi();
  const today = todayIso();
  const entries = await api.fetchWeeklyTimesheet(today, today, await fieldNames());
  return entries.map(e => ({id: e.id, label: pickerLabel(e)}));
}

/**
 * The user's timesheet line for today whose configured match field contains the
 * work item id, or null. This is the "reuse" key: launching a timer on a work
 * item that already has an entry today picks that entry back up.
 */
async function findEntry(workItemId: string): Promise<TimesheetEntry | null> {
  if (!workItemId) return null;
  const api = await getApi();
  const cfg = await loadAzureConfig();
  const matchField = cfg.matchField || 'name';
  const result = await api.searchTimesheet(
    [['date', '=', todayIso()], [matchField, 'ilike', workItemId]],
    await fieldNames(),
    1,
  );
  return result[0] ?? null;
}

/** The current running/paused timer mapped to our shared state, or null. */
async function getTimerState(): Promise<TimerState | null> {
  const api = await getApi();
  const state = timerStateFromRunning(await api.fetchRunningTimer());
  await writeTimerState(state);
  return state;
}

/** Runs a timer action on a line, then republishes the authoritative state. */
async function timerAction(
  method: 'startTimer' | 'pauseTimer' | 'resumeTimer' | 'stopTimer',
  lineId: unknown,
): Promise<TimerState | null> {
  const id = Number(lineId);
  if (!Number.isFinite(id)) throw new Error('Missing line id');
  const api = await getApi();
  await api[method](id);
  // Re-read so the elapsed clock is anchored to the server's segment start.
  const state = timerStateFromRunning(await api.fetchRunningTimer());
  await writeTimerState(state);
  return state;
}

/**
 * Stash the mapped work-item values and open the popup as a standalone window,
 * pre-filled on the add/edit form. Reuses the whole Angular UI rather than
 * duplicating a form in the content script.
 */
async function openEditor(prefill: AzurePrefill): Promise<void> {
  await setStorage(AZURE_PREFILL_KEY, prefill);
  const url = chrome.runtime.getURL('index.html');
  await new Promise<void>(resolve => {
    chrome.windows.create({url, type: 'popup', width: 800, height: 900}, () => resolve());
  });
}

/** Writes (or clears) the shared timer state so the popup picks it up. */
function writeTimerState(state: TimerState | null): Promise<void> {
  return state ? setStorage(TIMER_STORAGE_KEY, state) : removeStorage(TIMER_STORAGE_KEY);
}

/** Builds an Odoo API client from stored credentials; rejects if logged out. */
async function getApi(): Promise<OdooJson2Api> {
  const creds = await getStorage<OdooCredentials>(CREDENTIALS_KEY);
  if (!creds) throw new Error('Not authenticated: log in through the extension popup first.');
  return new OdooJson2Api(creds.odooBaseUrl, creds.loginMode, creds.apiKey);
}

/** Technical names of the configured custom fields, for Odoo `fields` lists. */
async function fieldNames(): Promise<string[]> {
  const fields = await getStorage<CustomFieldConfig[]>('customFields');
  return (fields ?? []).map(f => f.name);
}

/** A timesheet line rendered as a one-line picker label. */
function pickerLabel(e: TimesheetEntry): string {
  const project = e.project_id ? e.project_id[1] : 'No project';
  const second = e.task_id ? e.task_id[1] : (e.helpdesk_ticket_id ? e.helpdesk_ticket_id[1] : '');
  const name = e.name || 'Untitled';
  return second ? `${name} — ${project} / ${second}` : `${name} — ${project}`;
}

/** Local ISO date (YYYY-MM-DD) for today, without timezone drift. */
function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

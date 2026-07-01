/**
 * Azure DevOps work-item content script.
 *
 * Injects a small toolbar widget, a "today's entries" picker plus Start / Pause /
 * Stop buttons, to the left of the work item's Save & Close button. All Odoo work
 * (finding a line to reuse, driving the timer) is delegated to the background
 * service worker via messages, because a content script can't call Odoo directly
 * (cross-origin requests inherit the host page's CORS/CSP).
 *
 * Creating a brand-new entry is delegated to the existing Angular popup: we scrape
 * the configured work-item fields, hand them to the background, and it opens the
 * editor pre-filled, no form is duplicated here.
 *
 * The widget only appears on pages under the configured base URL whose URL is a
 * work-item edit page. Azure DevOps is a SPA, so we poll the URL and (re)inject as
 * the user navigates between work items.
 */
import {formatHms, TIMER_STORAGE_KEY, TimerState} from "./app/features/timer/timer-state";
import {SOURCE_ID, SOURCE_TITLE} from "./app/_constants/azure/azure-constants";
import {AzurePrefill} from "./app/_models/azure/azure-prefill.model";
import {loadAzureConfig} from "./app/_helpers/storage";


const chrome = (globalThis as any).chrome;

/** Marker id on the injected host element, so we never double-inject. */
const HOST_ID = 'odoo-timeshit-azure-widget';

interface PickerEntry {
  id: number;
  label: string;
}

let workItemId = '';
let running: TimerState | null = null;
let busy = false;
let todayList: PickerEntry[] = [];
let selectedId: number | null = null;
let statusText = '';

void init();

async function init(): Promise<void> {
  if (!chrome?.runtime) return;
  const cfg = await loadAzureConfig();
  if (!cfg.baseUrl || !originMatches(cfg.baseUrl)) return;

  // Adopt timer changes published by the background (or the popup) right away.
  chrome.storage?.onChanged.addListener((changes: any, area: string) => {
    if (area !== 'local' || !(TIMER_STORAGE_KEY in changes)) return;
    running = changes[TIMER_STORAGE_KEY].newValue ?? null;
    render();
  });

  // Drive the elapsed display once a second while running.
  setInterval(() => {
    if (running && !running.paused) renderElapsed();
  }, 1000);

  // Azure DevOps is a SPA: poll for navigation between work items and for the
  // (late-rendered) toolbar we anchor to.
  setInterval(syncWithPage, 800);
  syncWithPage();
}

/** Reconcile the widget with the current URL and DOM on every tick. */
function syncWithPage(): void {
  const id = parseWorkItemId();
  if (id !== workItemId) {
    workItemId = id;
    removeWidget();
    selectedId = null;
    statusText = '';
    if (id) void loadData();
  }
  // (Re)anchor the widget every tick. ensureWidget is idempotent and tracks the
  // *active* toolbar, so this transparently handles: the late-rendered toolbar,
  // Azure tearing down and rebuilding the form on navigation, and the taskboard
  // stacking a fresh work-item dialog over the previous (hidden) one when you
  // follow a parent link.
  if (workItemId) ensureWidget();
}

// ---------------------------------------------------------------------------
// Work-item scraping
// ---------------------------------------------------------------------------

/** The work item id from the page URL, or '' when this isn't a work-item page. */
function parseWorkItemId(): string {
  const fromPath = /_workitems\/(?:edit\/)?(\d+)/.exec(location.pathname);
  if (fromPath) return fromPath[1];
  const fromQuery = new URLSearchParams(location.search).get('workitem');
  return fromQuery && /^\d+$/.test(fromQuery) ? fromQuery : '';
}

/** Reads a configured mapping source from the page: `@id`, `@title`, or a field label. */
function scrapeSource(source: string): string {
  const token = source.trim();
  if (token === SOURCE_ID) return workItemId;
  if (token === SOURCE_TITLE) return scrapeTitle();
  // `@id`/`@title` are the only reserved tokens; a leading `@` on anything else
  // is a natural-but-wrong field-label prefix, so tolerate it.
  return scrapeFieldByLabel(token.startsWith('@') ? token.slice(1) : token);
}

function scrapeTitle(): string {
  const input = document.querySelector<HTMLInputElement>(
    '.work-item-form-title input, input.work-item-title-textbox, .work-item-title-textfield input',
  );
  return input?.value?.trim() || '';
}

/**
 * Reads a work-item field by its label, returning the first non-empty match.
 *
 * Matches against the visible control label (e.g. "Projet", "Tâche") linked to
 * its input via `for`, and against the input's own `aria-label` (e.g. a field
 * shown as "Projet" carries `aria-label="Projet"`). The
 * volatile `witc_NN` ids are useless to match on, so we never key off them.
 */
function scrapeFieldByLabel(label: string): string {
  const want = normalize(label);
  const candidates: HTMLInputElement[] = [];

  document.querySelectorAll<HTMLLabelElement>('label.workitemcontrol-label').forEach(el => {
    if (normalize(el.textContent ?? '') !== want) return;
    const forId = el.getAttribute('for');
    const input = forId ? document.getElementById(forId) as HTMLInputElement | null : null;
    if (input) candidates.push(input);
  });
  document.querySelectorAll<HTMLInputElement>('input[aria-label]').forEach(input => {
    if (normalize(input.getAttribute('aria-label') ?? '') === want) candidates.push(input);
  });

  for (const input of candidates) {
    const value = input.value?.trim();
    if (value) return value;
  }
  return '';
}

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

async function buildPrefill(): Promise<AzurePrefill> {
  const cfg = await loadAzureConfig();
  const fields = cfg.mappings
    .map(m => ({target: m.target, value: scrapeSource(m.source)}))
    .filter(f => f.value);
  return {workItemId, fields};
}

// ---------------------------------------------------------------------------
// Background messaging
// ---------------------------------------------------------------------------

function send<T>(message: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (res: any) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) return reject(new Error(lastError.message));
      if (!res?.ok) return reject(new Error(res?.error ?? 'Request failed'));
      resolve(res.data as T);
    });
  });
}

/** Loads the picker list and current timer, and pre-selects a reusable entry. */
async function loadData(): Promise<void> {
  try {
    todayList = await send<PickerEntry[]>({action: 'azure:todayEntries'});
    running = await send<TimerState | null>({action: 'azure:getTimerState'});
    const match = await send<{ id: number } | null>({action: 'azure:findEntry', workItemId});
    if (match) selectedId = match.id;
    statusText = '';
  } catch (err: any) {
    statusText = String(err?.message ?? err);
  }
  render();
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function onStart(): Promise<void> {
  if (busy || running) return;
  setBusy(true);
  try {
    let lineId = selectedId;
    if (!lineId) {
      const match = await send<{ id: number } | null>({action: 'azure:findEntry', workItemId});
      lineId = match?.id ?? null;
    }
    if (lineId == null) {
      // No existing entry: hand off to the popup, pre-filled, to create one.
      await send({action: 'azure:openEditor', prefill: await buildPrefill()});
    } else {
      running = await send<TimerState | null>({action: 'azure:startTimer', lineId});
    }
    statusText = '';
  } catch (err: any) {
    statusText = String(err?.message ?? err);
  } finally {
    setBusy(false);
  }
}

async function onPauseResume(): Promise<void> {
  if (busy || !running) return;
  const action = running.paused ? 'azure:resumeTimer' : 'azure:pauseTimer';
  setBusy(true);
  try {
    running = await send<TimerState | null>({action, lineId: running.lineId});
    statusText = '';
  } catch (err: any) {
    statusText = String(err?.message ?? err);
  } finally {
    setBusy(false);
  }
}

async function onStop(): Promise<void> {
  if (busy || !running) return;
  setBusy(true);
  try {
    running = await send<TimerState | null>({action: 'azure:stopTimer', lineId: running.lineId});
    selectedId = null;
    // The list's accumulated hours changed; refresh it.
    todayList = await send<PickerEntry[]>({action: 'azure:todayEntries'});
    statusText = '';
  } catch (err: any) {
    statusText = String(err?.message ?? err);
  } finally {
    setBusy(false);
  }
}

function setBusy(value: boolean): void {
  busy = value;
  render();
}

// ---------------------------------------------------------------------------
// DOM widget (shadow DOM, so Azure's stylesheet can't bleed in or out)
// ---------------------------------------------------------------------------

const TOOLBAR_SELECTOR =
  '.work-item-form-toolbar, .work-item-form-headerContent .menu-bar, .work-item-form-header .menu-bar';

/**
 * The toolbar of the currently *active* work-item form, or null if none is
 * rendered yet. The taskboard keeps previously-opened work-item dialogs in the
 * DOM (hidden) when you stack a new one via a parent link, so we can't just take
 * the first match: we filter to visible, non-`aria-hidden` toolbars and prefer
 * the last (the topmost / most recently opened dialog).
 */
function findToolbarAnchor(): Element | null {
  const usable = Array.from(document.querySelectorAll(TOOLBAR_SELECTOR)).filter(isLiveAnchor);
  return usable.at(-1) ?? null;
}

/** A toolbar is usable if it's laid out and not inside a hidden/inert dialog. */
function isLiveAnchor(el: Element): boolean {
  if (el.closest('[aria-hidden="true"], [inert]')) return false;
  const rect = (el as HTMLElement).getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Ensures exactly one widget exists, anchored in the active toolbar. Idempotent:
 * a no-op when already correctly placed, and re-anchors when Azure has rebuilt
 * the form or moved focus to a different (stacked) dialog.
 */
function ensureWidget(): void {
  const anchor = findToolbarAnchor();
  if (!anchor) return; // active toolbar not rendered yet; a later tick retries

  const existing = document.getElementById(HOST_ID);
  if (existing) {
    if (existing.parentElement === anchor) return; // already in the right place
    existing.remove(); // stale: was anchored in a torn-down or hidden dialog
  }

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.display = 'inline-flex';
  host.style.alignItems = 'center';
  anchor.insertBefore(host, anchor.firstChild);

  const shadow = host.attachShadow({mode: 'open'});
  const style = document.createElement('style');
  style.textContent = WIDGET_CSS;
  const root = document.createElement('div');
  root.className = 'ots';
  shadow.append(style, root);

  render();
}

function removeWidget(): void {
  document.getElementById(HOST_ID)?.remove();
}

function root(): HTMLElement | null {
  const host = document.getElementById(HOST_ID);
  return host?.shadowRoot?.querySelector('.ots') as HTMLElement | null;
}

function render(): void {
  const el = root();
  if (!el) return;

  if (running) {
    el.innerHTML = `
      <span class="ots-tag">odoo</span>
      <span class="ots-elapsed" data-elapsed>${elapsedText(running)}</span>
      <span class="ots-task" title="${escapeHtml(running.name)}">${escapeHtml(running.name)}</span>
      <button class="ots-btn ots-icon" data-act="pauseResume" ${busy ? 'disabled' : ''} title="${running.paused ? 'Resume' : 'Pause'}">${running.paused ? '⏵' : '⏸'}</button>
      <button class="ots-btn ots-icon ots-stop" data-act="stop" ${busy ? 'disabled' : ''} title="Stop &amp; save">■</button>
    `;
  } else {
    const options = [
      `<option value="">Auto-detect / new entry…</option>`,
      ...todayList.map(e => `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${escapeHtml(e.label)}</option>`),
    ].join('');
    el.innerHTML = `
      <span class="ots-tag">odoo</span>
      <select class="ots-select" data-act="select" ${busy ? 'disabled' : ''}>${options}</select>
      <button class="ots-btn ots-start" data-act="start" ${busy ? 'disabled' : ''} title="Start timer">⏵ Start</button>
    `;
  }
  if (statusText) {
    const msg = document.createElement('span');
    msg.className = 'ots-status';
    msg.textContent = statusText;
    msg.title = statusText;
    el.appendChild(msg);
  }
  wire(el);
}

/** Cheap targeted update of just the elapsed text, for the per-second tick. */
function renderElapsed(): void {
  const el = root();
  const span = el?.querySelector('[data-elapsed]');
  if (span && running) span.textContent = elapsedText(running);
}

function wire(el: HTMLElement): void {
  el.querySelector('[data-act="start"]')?.addEventListener('click', () => void onStart());
  el.querySelector('[data-act="pauseResume"]')?.addEventListener('click', () => void onPauseResume());
  el.querySelector('[data-act="stop"]')?.addEventListener('click', () => void onStop());
  el.querySelector('[data-act="select"]')?.addEventListener('change', (e: Event) => {
    const value = (e.target as HTMLSelectElement).value;
    selectedId = value ? Number(value) : null;
  });
}

function elapsedText(t: TimerState): string {
  const base = t.baseHours * 3600;
  const seconds = t.paused ? base : base + (Date.now() - t.segmentStartMs) / 1000;
  return formatHms(seconds);
}

function originMatches(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).origin === location.origin;
  } catch {
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => (
    {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c] as string
  ));
}

const WIDGET_CSS = `
.ots {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 10px;
  font-family: -apple-system, Segoe UI, Roboto, sans-serif;
  font-size: 12px;
  color: #1f2330;
}
.ots-tag {
  font-weight: 700;
  color: #7c4dff;
  text-transform: uppercase;
  letter-spacing: .04em;
}
.ots-select {
  max-width: 240px;
  height: 26px;
  border: 1px solid #c8c8d0;
  border-radius: 6px;
  padding: 0 6px;
  background: #fff;
  font-size: 12px;
}
.ots-elapsed {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  min-width: 64px;
}
.ots-task {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #5a5f6e;
}
.ots-btn {
  height: 26px;
  min-width: 28px;
  padding: 0 8px;
  border: 1px solid #7c4dff;
  border-radius: 6px;
  background: #7c4dff;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  line-height: 1;
}
.ots-icon {
  width: 28px;
  min-width: 28px;
  padding: 0;
  /* The pause glyph is two chars (❚❚) vs stop's single ■; a fixed square keeps
     both buttons identical regardless of glyph width. */
}
.ots-btn:hover { background: #6a3df0; }
.ots-btn:disabled { opacity: .5; cursor: default; }
.ots-stop { background: #fff; color: #d33; border-color: #d33; }
.ots-stop:hover { background: #fff0f0; }
.ots-status {
  color: #d33;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
`;

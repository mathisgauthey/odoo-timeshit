/**
 * Dev-only stand-in for the parts of the `chrome.*` extension API the app uses.
 *
 * When running under `ng serve` there is no extension runtime, so
 * `(globalThis as any).chrome` is undefined and every `chrome.storage` /
 * `chrome.runtime` call throws.
 *
 * This installs a fake `chrome` on `globalThis`
 * that is backed by `localStorage`, letting us debug the Angular app in a plain
 * browser tab with HMR instead of attaching a remote debugger to the extension.
 *
 * It intentionally mimics the real MV3 callback-style API the app relies on:
 *   - chrome.storage.local.get / set / remove / clear
 *   - chrome.storage.onChanged.addListener
 *   - chrome.runtime.onMessage.addListener + chrome.runtime.sendMessage
 *
 * `localStorage` is shared across tabs on the same origin, so opening two tabs
 * roughly mimics popup <-> background sharing the same storage area.
 */

const PREFIX = '__chrome_local__:';

type StorageChange = { oldValue?: any; newValue?: any };
type ChangeListener = (changes: Record<string, StorageChange>, areaName: string) => void;
type MessageListener = (message: any, sender: any, sendResponse: (response?: any) => void) => boolean | void;

function readAll(): Record<string, any> {
  const out: Record<string, any> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(PREFIX)) continue;
    try {
      out[key.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(key)!);
    } catch {
      // ignore malformed entries
    }
  }
  return out;
}

function readKey(key: string): any {
  const raw = localStorage.getItem(PREFIX + key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function buildLocalStorageArea() {
  const changeListeners: ChangeListener[] = [];

  function emit(changes: Record<string, StorageChange>): void {
    if (Object.keys(changes).length === 0) return;
    for (const listener of changeListeners) listener(changes, 'local');
  }

  const local = {
    // chrome.storage.local.get(keys, callback)
    // keys may be: null/undefined (all), string, string[], or an object of defaults.
    get(keys: any, callback?: (items: Record<string, any>) => void): Promise<Record<string, any>> | void {
      let result: Record<string, any> = {};

      if (keys === null || keys === undefined) {
        result = readAll();
      } else if (typeof keys === 'string') {
        const v = readKey(keys);
        if (v !== undefined) result[keys] = v;
      } else if (Array.isArray(keys)) {
        for (const k of keys) {
          const v = readKey(k);
          if (v !== undefined) result[k] = v;
        }
      } else if (typeof keys === 'object') {
        for (const k of Object.keys(keys)) {
          const v = readKey(k);
          result[k] = v !== undefined ? v : keys[k]; // honor supplied defaults
        }
      }

      if (callback) {
        callback(result);
        return;
      }
      return Promise.resolve(result);
    },

    // chrome.storage.local.set(items, callback?)
    set(items: Record<string, any>, callback?: () => void): Promise<void> | void {
      const changes: Record<string, StorageChange> = {};
      for (const key of Object.keys(items)) {
        const oldValue = readKey(key);
        const newValue = items[key];
        localStorage.setItem(PREFIX + key, JSON.stringify(newValue));
        changes[key] = {oldValue, newValue};
      }
      emit(changes);
      if (callback) {
        callback();
        return;
      }
      return Promise.resolve();
    },

    // chrome.storage.local.remove(keys, callback?)
    remove(keys: string | string[], callback?: () => void): Promise<void> | void {
      const list = Array.isArray(keys) ? keys : [keys];
      const changes: Record<string, StorageChange> = {};
      for (const key of list) {
        const oldValue = readKey(key);
        if (oldValue === undefined) continue;
        localStorage.removeItem(PREFIX + key);
        changes[key] = {oldValue, newValue: undefined};
      }
      emit(changes);
      if (callback) {
        callback();
        return;
      }
      return Promise.resolve();
    },

    // chrome.storage.local.clear(callback?)
    clear(callback?: () => void): Promise<void> | void {
      const all = readAll();
      const changes: Record<string, StorageChange> = {};
      for (const key of Object.keys(all)) {
        localStorage.removeItem(PREFIX + key);
        changes[key] = {oldValue: all[key], newValue: undefined};
      }
      emit(changes);
      if (callback) {
        callback();
        return;
      }
      return Promise.resolve();
    },
  };

  return {
    local,
    onChanged: {
      addListener: (cb: ChangeListener) => changeListeners.push(cb),
      removeListener: (cb: ChangeListener) => {
        const i = changeListeners.indexOf(cb);
        if (i >= 0) changeListeners.splice(i, 1);
      },
    },
  };
}

function buildRuntime() {
  const messageListeners: MessageListener[] = [];

  return {
    onMessage: {
      addListener: (cb: MessageListener) => messageListeners.push(cb),
      removeListener: (cb: MessageListener) => {
        const i = messageListeners.indexOf(cb);
        if (i >= 0) messageListeners.splice(i, 1);
      },
    },

    // chrome.runtime.sendMessage(message, callback?)
    // Dispatches to in-page listeners (background.ts runs in the same context in dev).
    sendMessage(message: any, callback?: (response?: any) => void): void {
      const sender = {id: 'dev-shim', url: location.href};
      for (const listener of messageListeners) {
        listener(message, sender, (response?: any) => callback?.(response));
        // A listener returning `true` keeps sendResponse alive for async use,
        // matching real MV3 semantics. Nothing else to do here.
      }
    },

    // Some code paths read these; provide harmless stubs.
    id: 'dev-shim',
    getURL: (path: string) => new URL(path, location.href).href,
    lastError: undefined as undefined | { message: string },
  };
}

/**
 * Installs the shim when no real extension API is present.
 * Safe to call unconditionally, it no-ops inside a real extension.
 */
export function installChromeShimIfNeeded(): void {
  const g = globalThis as any;
  if (g.chrome?.storage?.local) return; // real extension runtime is in charge

  g.chrome = {
    ...(g.chrome ?? {}),
    storage: buildLocalStorageArea(),
    runtime: buildRuntime(),
  };

  console.info('[chrome-shim] Using localStorage-backed chrome.* shim (dev mode).');
}

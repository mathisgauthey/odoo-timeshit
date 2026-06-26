/**
 * Promise wrappers over `chrome.storage.local`, usable from every extension
 * context (popup, background service worker, content script). The callback-style
 * MV3 API is awkward to await directly, so the whole app goes through these.
 *
 * Each no-ops gracefully when no `chrome.storage` is present (e.g. a unit test
 * that never installed the dev shim), resolving to `null`/`void`.
 */

import {AzureConfig} from "../_models/azure/azure-config.model";
import {AZURE_CONFIG_KEY} from "../_constants/storage-keys";
import {DEFAULT_AZURE_CONFIG} from "../_constants/azure/azure-constants";

/** Reads a single key, resolving to its value or `null` when absent. */
export function getStorage<T>(key: string): Promise<T | null> {
  const chrome = (globalThis as any).chrome;
  return new Promise(resolve => {
    if (!chrome?.storage?.local) return resolve(null);
    chrome.storage.local.get([key], (res: any) => resolve(res?.[key] ?? null));
  });
}

/** Writes a single key. */
export function setStorage(key: string, value: unknown): Promise<void> {
  const chrome = (globalThis as any).chrome;
  return new Promise(resolve => {
    if (!chrome?.storage?.local) return resolve();
    chrome.storage.local.set({[key]: value}, () => resolve());
  });
}

/** Removes a single key. */
export function removeStorage(key: string): Promise<void> {
  const chrome = (globalThis as any).chrome;
  return new Promise(resolve => {
    if (!chrome?.storage?.local) return resolve();
    chrome.storage.local.remove(key, () => resolve());
  });
}

/** Loads the persisted Azure config, falling back to disabled defaults. */
export async function loadAzureConfig(): Promise<AzureConfig> {
  const stored = await getStorage<Partial<AzureConfig>>(AZURE_CONFIG_KEY);
  return {...DEFAULT_AZURE_CONFIG, ...stored};
}

/** Persists the Azure config. */
export function saveAzureConfig(config: AzureConfig): Promise<void> {
  return setStorage(AZURE_CONFIG_KEY, config);
}

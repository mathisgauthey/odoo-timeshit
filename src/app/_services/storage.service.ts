import {inject, Injectable, NgZone} from '@angular/core';
import {getStorage, removeStorage, setStorage} from '../_helpers/storage';

/**
 * Angular-facing wrapper over `chrome.storage.local`, the single place the popup
 * app reaches persisted state. The reads/writes delegate to the standalone
 * helpers in `_helpers/storage.ts`; the service's own contribution is the
 * `NgZone`-aware change notification, which the plain helpers cannot provide.
 *
 * The MV3 storage API fires change events outside Angular's zone, so `onChanged`
 * re-enters it, sparing every consumer from re-implementing that. Non-Angular
 * contexts (the background service worker and the content script, plus the
 * plain-TS `azure.ts` they share) cannot use DI and keep using the helpers
 * directly instead.
 *
 * Every method no-ops gracefully when no `chrome.storage` is present (e.g. a
 * unit test that never installed the dev shim), resolving to `null`/`void`.
 */
@Injectable({providedIn: 'root'})
export class StorageService {
  private readonly zone = inject(NgZone);

  private get chrome(): any {
    return (globalThis as any).chrome;
  }

  /** Reads a single key, resolving to its value or `null` when absent. */
  get<T>(key: string): Promise<T | null> {
    return getStorage<T>(key);
  }

  /** Writes a single key. */
  set(key: string, value: unknown): Promise<void> {
    return setStorage(key, value);
  }

  /** Removes a single key. */
  remove(key: string): Promise<void> {
    return removeStorage(key);
  }

  /**
   * Subscribes to changes of a single key in the `local` area, delivering the
   * new value (or `null` when the key was removed). The callback runs inside
   * Angular's zone, Chrome fires storage events outside it, so signal writes
   * wouldn't refresh the view otherwise. Returns an unsubscribe function.
   */
  onChanged<T>(key: string, callback: (value: T | null) => void): () => void {
    const chrome = this.chrome;
    const listener = (changes: any, area: string) => {
      if (area !== 'local' || !(key in changes)) return;
      this.zone.run(() => callback(changes[key].newValue ?? null));
    };
    chrome?.storage?.onChanged.addListener(listener);
    return () => chrome?.storage?.onChanged.removeListener(listener);
  }
}

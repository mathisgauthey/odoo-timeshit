import {Injectable, signal} from "@angular/core";
import {AzureConfig} from "../_models/azure/azure-config.model";
import {DEFAULT_AZURE_CONFIG} from "../_constants/azure/azure-constants";
import {loadAzureConfig, saveAzureConfig} from "../_helpers/storage";

/**
 * Reactive holder for the Azure DevOps integration config, persisted to
 * `chrome.storage.local`. Only the settings screen mutates it; the content
 * script and background read the same key directly through the plain helpers in
 * `azure.ts`. Mirrors {@link ConfigService}'s shape for consistency.
 */
@Injectable({providedIn: 'root'})
export class AzureSettingsService {
  readonly config = signal<AzureConfig>(DEFAULT_AZURE_CONFIG);
  /** Resolves once the persisted config has loaded. */
  readonly ready: Promise<void>;

  constructor() {
    this.ready = loadAzureConfig().then(cfg => this.config.set(cfg));
  }

  /** Replaces the whole config and persists it. */
  async save(config: AzureConfig): Promise<void> {
    this.config.set(config);
    await saveAzureConfig(config);
  }
}

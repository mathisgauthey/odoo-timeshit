import {AzureConfig} from "../../_models/azure/azure-config.model";

/** Source token for the work item id (from the page URL). */
export const SOURCE_ID = '@id';
/** Source token for the work item title. */
export const SOURCE_TITLE = '@title';
/**
 * Default configuration object for Azure integration.
 */
export const DEFAULT_AZURE_CONFIG: AzureConfig = {
  baseUrl: '',
  matchField: 'name',
  mappings: [],
};

import {Component, output} from '@angular/core';
import {CustomFieldsSettingsComponent} from "../custom-fields-settings/custom-fields-settings.component";
import {AzureSettingsComponent} from "../azure-settings/azure-settings.component";

/**
 * Settings screen shell: a header with a back button and the stack of
 * self-contained settings panels (custom fields, Azure DevOps integration).
 */
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CustomFieldsSettingsComponent, AzureSettingsComponent],
  templateUrl: './settings.component.html',
})
export class SettingsComponent {
  readonly goBack = output<void>();
}

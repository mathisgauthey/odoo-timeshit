# Odoo Timeshit

> Because filling out timesheets is the daily shit we all have to deal with.

**Odoo Timeshit** is a Chrome extension that lets you create, edit, and time your Odoo timesheet entries without ever leaving your browser tab. With autocomplete, a built-in timer synced to Odoo, and Azure DevOps integration, it removes the constant round trip to the Odoo web interface so you can stay focused on what actually matters: your work as a developer, not as an accountant.

## Why

The Odoo web timesheet UI is slow to navigate, breaks your flow, and forces you to re-enter the context you already have open in your work item tracker. This extension brings timesheet management to where you already are, and pulls in the data you already have.

## Features

### Authentication

Two ways to connect to your Odoo instance:

- **API key (Odoo v19+ JSON-2 API)**: provide a Base URL, Database, Username, and API Key.
- **Existing session cookie**: reuse the credentials already stored in your browser by providing only a Base URL.

All connection details are stored in the extension's local storage.

### Configuration

- **Custom fields**: map as many `account.analytic.line` custom fields as your Odoo instance defines. For each field, you choose its display name and its type (date, text, time, or number / model ID) so that input and autocomplete behave correctly.
- **Azure DevOps integration**: set your Azure DevOps URL and define how Azure work items map onto timesheet entries:
  - Pick the `account.analytic.line` field used to match against the Azure work item's key for existing entry recognition.
  - Pick which Azure work item fields auto-fill from which timesheet entry fields.

### Popup

The extension popup is organized into tabs.

#### Weekly timesheet

Review and edit the current week's timesheet in a table, just like the Odoo web view:

- Date
- Project & task (or assistance & ticket)
- Description
- Time spent
- Custom fields

From this view you can:

- Click an entry to edit it.
- Adjust time spent inline.
- Delete an entry.
- **Rebalance a day** automatically so its entries add up to your required daily hours.
- Navigate between weeks.
- Start a timer directly on any entry.

#### Add / edit an entry

Create a new entry or edit an existing one, with the same fields as the weekly view. Fields backed by an Odoo model provide a live search dropdown that returns matching records (searchable by name or exact ID), scoped where relevant (e.g. tasks scoped to their project).

From here you can save the entry, or start a timer on the spot when creating one. This tab can also be opened from the weekly view for a specific entry, or for the entry currently being timed.

#### Timer

Track time live against the selected entry:

- Start, pause, and resume.
- Stop to save the accumulated time to the entry.
- The timer runs on the Odoo side and is mirrored to the extension's local storage for display.
- The toolbar badge reflects the current timer state at a glance.

Timers can also be started from the weekly view or during entry creation.

### Azure DevOps integration

On any Azure DevOps work item page, the extension injects a task selector with start/stop timer controls. Configured work item fields are passed into the timesheet entry as placeholders, so the matching Odoo record can be looked up automatically when creating a new one with a dedicated popup.

## Installation

Choose whichever fits you:

- **Build it yourself**: see [Development](#development), then load the generated `dist/odoo-timeshit` folder via `chrome://extensions` with Developer mode enabled.
- **From a release**: download the latest build from the [Releases](../../releases) page and load it the same way with Developer mode enabled.
- **Chrome Web Store**: if and when it gets published there. (No promises.)

## Development

Requirements: Node.js and npm.

```bash
npm install        # install dependencies
npm run watch      # build to dist/odoo-timeshit and rebuild on change
npm run build      # one-off production build
npm test           # run unit tests
```

Load the unpacked extension from `dist/odoo-timeshit` in `chrome://extensions` with Developer mode enabled.

### Angular development for pop up

Use [start.run.xml](.run/start.run.xml) alongside [Debug Angular.run.xml](.run/Debug%20Angular.run.xml) for clean and easy pop up debugging using [chrome-shim.ts](src/app/dev/chrome-shim.ts) to replace Chrome APIs.

Or install the extension locally, launch a Chrome browser using something like [launch-chrome-debug.sh](scripts/launch-chrome-debug.sh) and then debug it using [watch.run.xml](.run/watch.run.xml) alongside [Debug Extension.run.xml](.run/Debug%20Extension.run.xml).

## Tech stack and aknowledgments

- **Angular 17**: Application framework
- **PrimeNG** (Aura Light Purple theme): UI components library
- **Tailwind CSS**: CSS library
- **Odoo JSON-2 API (v19+)** or the legacy web API: Backend communication
- **Chrome Manifest V3**: Extension platform (background service worker and content script)

Thanks a lot to [JeB](https://www.justjeb.com/profile/jeb/profile) for his [wonderful guide](https://www.justjeb.com/post/chrome-extension-with-angular-from-zero-to-a-little-hero) about building a Chrome extension with Angular.

Thanks a lot to Jetbrains Rider for their awesome IDE. I can't use anything else to do my work nowadays and it is fair to say how grateful I am that they provie Rider for Open Source projects like this one.

## Licensing with GNU General Public License v3.0

Permissions of this strong copyleft license are conditioned on making available complete source code of licensed works and modifications, which include larger works using a licensed work, under the same license. Copyright and license notices must be preserved. Contributors provide an express grant of patent rights. More informations [here](https://choosealicense.com/licenses/gpl-3.0/) or in the [LICENSE file](LICENSE);

Permissions:		
✓Commercial use
✓Distribution
✓Modification
✓Patent use
✓Private use

Conditions:
ⓘDisclose source
ⓘLicense and copyright notice
ⓘSame license
ⓘState changes

Limitations:
✕Liability
✕Warranty


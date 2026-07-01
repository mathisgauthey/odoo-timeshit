import {Component, signal} from '@angular/core';
import {DialogModule} from "primeng/dialog";
import {ProgressSpinnerModule} from "primeng/progressspinner";
import {REPO_URL} from "../../_constants/app-constants";

/** One changelog bullet, split so the conventional-commit scope can be styled. */
interface ChangeItem {
  scope?: string;
  text: string;
}

/** A `### Features` / `### Bug Fixes` group within a release. */
interface ChangeGroup {
  title: string;
  items: ChangeItem[];
}

/** A single released version parsed out of docs/CHANGELOG.md. */
interface ReleaseNote {
  version: string;
  date: string;
  url?: string;
  groups: ChangeGroup[];
}

/** How many releases to show at most. */
const MAX_RELEASES = 10;

/**
 * Modal showing the latest release notes, parsed at runtime from the shipped
 * `CHANGELOG.md` (copied to the build root as an asset — see angular.json).
 * Opened imperatively via a template ref: `<app-release-notes #rn/>` + `rn.open()`.
 */
@Component({
  selector: 'app-release-notes',
  standalone: true,
  imports: [DialogModule, ProgressSpinnerModule],
  templateUrl: './release-notes.component.html',
})
export class ReleaseNotesComponent {
  readonly visible = signal(false);
  readonly releases = signal<ReleaseNote[]>([]);
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly changelogUrl = `${REPO_URL}/blob/main/docs/CHANGELOG.md`;

  open(): void {
    this.visible.set(true);
    void this.load();
  }

  /** Fetches and parses the changelog once; subsequent opens reuse the result. */
  private async load(): Promise<void> {
    if (this.releases().length || this.loading()) return;
    this.loading.set(true);
    this.failed.set(false);
    try {
      const runtime = (globalThis as any).chrome?.runtime;
      const url = runtime?.getURL ? runtime.getURL('CHANGELOG.md') : 'CHANGELOG.md';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.releases.set(this.parse(await res.text()));
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** Parses the conventional-changelog markdown into the latest {@link MAX_RELEASES}. */
  private parse(markdown: string): ReleaseNote[] {
    const releases: ReleaseNote[] = [];
    let release: ReleaseNote | null = null;
    let group: ChangeGroup | null = null;

    for (const line of markdown.split('\n')) {
      // Release header: "## [1.5.0](url) (2026-07-01)" or "## 1.0.0 (2026-06-26)".
      const header = /^##\s+(.+)$/.exec(line);
      if (header) {
        if (releases.length >= MAX_RELEASES) break;
        release = this.parseHeader(header[1]);
        releases.push(release);
        group = null;
        continue;
      }
      if (!release) continue;

      // Section header: "### Features".
      const section = /^###\s+(.+)$/.exec(line);
      if (section) {
        group = {title: section[1].trim(), items: []};
        release.groups.push(group);
        continue;
      }

      // Bullet line: "* **scope:** description ([hash](url))".
      const bullet = /^\*\s+(.+)$/.exec(line);
      if (bullet) {
        if (!group) {
          group = {title: '', items: []};
          release.groups.push(group);
        }
        group.items.push(this.parseItem(bullet[1]));
      }
    }
    return releases;
  }

  private parseHeader(raw: string): ReleaseNote {
    const linked = /^\[([^\]]+)]\(([^)]+)\)\s*(?:\((.+)\))?/.exec(raw);
    if (linked) return {version: linked[1], url: linked[2], date: linked[3] ?? '', groups: []};
    const plain = /^(\S+)\s*(?:\((.+)\))?/.exec(raw);
    return {version: plain?.[1] ?? raw, date: plain?.[2] ?? '', groups: []};
  }

  private parseItem(raw: string): ChangeItem {
    const text = raw
      .replace(/\s*\(\[[0-9a-f]{7,}]\([^)]+\)\)/i, '')          // drop "([hash](url))"
      .replace(/,?\s*closes\s+(\[#\d+]\([^)]+\)\s*)+/i, '')     // drop "closes [#n](url)…"
      .replace(/`([^`]+)`/g, '$1')                              // unwrap `inline code`
      .trim();
    const scoped = /^\*\*([^:*]+):\*\*\s*(.*)$/.exec(text);
    if (scoped) return {scope: scoped[1].trim(), text: scoped[2].trim()};
    return {text};
  }
}

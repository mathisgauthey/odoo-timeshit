import {Component, inject, signal} from '@angular/core';
import {DialogModule} from "primeng/dialog";
import {Button} from "primeng/button";
import {MessageService} from "primeng/api";
import {APP_VERSION, BUG_REPORT_URL, DOC_URL, FEATURE_REQUEST_URL} from "../../_constants/app-constants";

/** A single labelled debug fact, rendered as a row and copied as a markdown bullet. */
interface DebugFact {
  label: string;
  value: string;
}

/**
 * Modal listing environment/debug facts (OS, browser, extension version) with a
 * one-click "copy as markdown" button and shortcuts to the docs and the bug /
 * feature issue templates. Meant to be dropped into a host template and opened
 * imperatively via a template reference: `<app-debug-info #dbg/>` + `dbg.open()`.
 */
@Component({
  selector: 'app-debug-info',
  standalone: true,
  imports: [DialogModule, Button],
  templateUrl: './debug-info.component.html',
})
export class DebugInfoComponent {
  readonly visible = signal(false);
  readonly appVersion = APP_VERSION;
  readonly docUrl = DOC_URL;
  readonly bugReportUrl = BUG_REPORT_URL;
  readonly featureRequestUrl = FEATURE_REQUEST_URL;
  readonly facts: DebugFact[] = this.collectFacts();
  private readonly messages = inject(MessageService);

  open(): void {
    this.visible.set(true);
  }

  /** Copies the debug facts to the clipboard as a markdown bullet list. */
  async copyAsMarkdown(): Promise<void> {
    const markdown = this.facts.map(f => `- **${f.label}:** ${f.value}`).join('\n');
    try {
      await navigator.clipboard.writeText(markdown);
      this.messages.add({severity: 'success', summary: 'Copied', detail: 'Debug info copied as markdown.'});
    } catch {
      this.messages.add({severity: 'error', summary: 'Copy failed', detail: 'Could not access the clipboard.'});
    }
  }

  /**
   * Copies the debug info as markdown (so it can be pasted straight into the
   * issue), toasts, then opens the target template after a short beat so the
   * toast is seen before the new tab takes focus.
   */
  async copyAndOpen(event: MouseEvent, url: string): Promise<void> {
    event.preventDefault();
    await this.copyAsMarkdown();
    setTimeout(() => window.open(url, '_blank', 'noopener,noreferrer'), 600);
  }

  private collectFacts(): DebugFact[] {
    const ua = navigator.userAgent;
    return [
      {label: 'Extension version', value: this.appVersion},
      {label: 'OS', value: this.detectOs(ua)},
      {label: 'Browser', value: this.detectBrowser(ua)},
      {label: 'User agent', value: ua},
    ];
  }

  private detectOs(ua: string): string {
    if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
    if (/Windows/.test(ua)) return 'Windows';
    if (/Mac OS X/.test(ua)) return 'macOS';
    if (/CrOS/.test(ua)) return 'ChromeOS';
    if (/Android/.test(ua)) return 'Android';
    if (/Linux/.test(ua)) return 'Linux';
    return 'Unknown';
  }

  private detectBrowser(ua: string): string {
    // Order matters: Chromium forks all advertise "Chrome/…", so match the more
    // specific tokens first and fall back to plain Chrome.
    const patterns: [RegExp, string][] = [
      [/Edg\/([\d.]+)/, 'Edge'],
      [/OPR\/([\d.]+)/, 'Opera'],
      [/Vivaldi\/([\d.]+)/, 'Vivaldi'],
      [/Firefox\/([\d.]+)/, 'Firefox'],
      [/Chrome\/([\d.]+)/, 'Chrome'],
    ];
    for (const [re, name] of patterns) {
      const m = ua.match(re);
      if (m) return `${name} ${m[1]}`;
    }
    return 'Unknown';
  }
}

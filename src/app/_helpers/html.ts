/**
 * Escapes the five HTML-significant characters. Used when building the balance
 * confirm-dialog message: that dialog renders its message as HTML (`escape=false`)
 * so it can show a styled before/after, which means any user-provided text
 * (entry names) must be escaped first.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => (
    {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c] as string
  ));
}

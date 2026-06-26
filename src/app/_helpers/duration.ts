/**
 * Duration helpers shared by the editor and the weekly list, so a duration
 * typed as "2:30", "02:30" or "2.5" is parsed and rendered identically wherever
 * the user can edit logged hours.
 */

/** 1.5 -> "01:30" (both parts zero-padded). */
export function hoursToHhmm(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`;
}

/**
 * Parses a duration written either as H:MM ("2:30", "02:30") or as decimal
 * hours ("2.5", "2,5"). Returns hours, or null when the text isn't usable.
 */
export function parseDuration(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.includes(':')) {
    const match = /^(\d+):([0-5]?\d)$/.exec(trimmed);
    return match ? parseInt(match[1], 10) + parseInt(match[2], 10) / 60 : null;
  }

  const decimal = Number(trimmed.replace(',', '.'));
  return isFinite(decimal) && decimal >= 0 ? decimal : null;
}

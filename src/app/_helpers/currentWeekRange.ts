import {WeekLimits} from "../_models/week-limits.model";

/**
 * Calculates the current week's date range from Monday to Sunday in ISO format.
 *
 * @return {Object} An object containing the start and end dates of the current week.
 *                  `start` represents the Monday date, and `end` represents the Sunday date.
 */
export function currentWeekRange(): WeekLimits {
  const pad = (n: number) => String(n).padStart(2, '0');
  const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  return {startDate: toIso(monday), endDate: toIso(sunday)};
}

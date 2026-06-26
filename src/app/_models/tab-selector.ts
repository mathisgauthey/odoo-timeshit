/** Bottom-nav destinations. */
export const Tab = {
  Timesheet: 'timesheet',
  AddOrEdit: 'add-or-edit',
  Timer: 'timer',
} as const;

export type Tab = (typeof Tab)[keyof typeof Tab];

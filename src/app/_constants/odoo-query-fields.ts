export const TIMESHEET_FIELDS = [
  'id', 'name', 'date', 'unit_amount', 'write_date',
  'project_id', 'task_id', 'employee_id', 'helpdesk_ticket_id',
];
export const RUNNING_TIMER_FIELDS = [
  'id', 'name', 'unit_amount',
  'timer_start', 'timer_pause', 'is_timer_running', 'project_id', 'task_id',
];
/**
 * Argument keys that `call_kw` expects as its single leading *positional* arg,
 * in priority order. A call carries at most one of these; the rest of the
 * argument object is passed as `kwargs`. See {@link OdooJson2Api.callViaCookie}.
 */
export const CALL_KW_POSITIONAL = ['ids', 'vals_list'] as const;

/**
 * Core add/edit form fields a scraped work-item value can land in. `Task` and
 * `Ticket` are distinct because they write different Odoo fields (`task_id` vs
 * `helpdesk_ticket_id`) and only one is sent per entry (see the editor's mode).
 */
export const MappingTarget = {
  Description: 'description',
  Project: 'project',
  Task: 'task',
  Ticket: 'ticket',
} as const;

/**
 * Where a scraped value lands: one of the core targets above, or the technical
 * name of a configured custom field (any other string).
 */
export type MappingTarget = (typeof MappingTarget)[keyof typeof MappingTarget] | (string & {});

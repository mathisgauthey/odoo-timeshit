export const LoginMode = {
  API: 'api',
  Cookie: 'cookie'
} as const;

export type LoginMode = (typeof LoginMode)[keyof typeof LoginMode];

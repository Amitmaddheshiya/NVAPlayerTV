/**
 * User-area routing helpers. Every user-type account gets its own URL
 * prefix so the account origin is visible in the address bar:
 *   /user/*       — normal standalone user
 *   /duser/*      — dealer customer (d-user)
 *   /sub-user/*   — sub-user of a normal user
 *   /dsub-user/*  — sub-user of a dealer customer (d-sub-user)
 */
export type UserArea = 'user' | 'duser' | 'sub-user' | 'dsub-user';

export const USER_AREAS: UserArea[] = ['user', 'duser', 'sub-user', 'dsub-user'];

export const getUserArea = (user: any): UserArea => {
  const t = user?.accountType;
  if (t === 'd-user') return 'duser';
  if (t === 'd-sub-user') return 'dsub-user';
  if (t === 'sub-user' || user?.role === 'sub-user' || user?.isSubUser) return 'sub-user';
  return 'user';
};

export const areaBasePath = (area: UserArea): string => `/${area}`;

export const areaHomePath = (area: UserArea): string => `/${area}/dashboard`;

export const readStoredUser = (): any => {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
};

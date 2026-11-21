import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';

export type PermissionModule = 'devices' | 'groups' | 'library' | 'settings' | 'subUsers';

/**
 * Restricts a route to a permission module for sub-users.
 * Admins and normal (non-sub) users always pass — only sub-users are gated.
 */
export const requirePermission = (module: PermissionModule) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (req.userRole === 'admin' || !req.isSubUser) {
      next();
      return;
    }
    if (req.permissions?.[module] === false) {
      res.status(403).json({ error: `Access denied: '${module}' permission is not granted for this account` });
      return;
    }
    next();
  };
};

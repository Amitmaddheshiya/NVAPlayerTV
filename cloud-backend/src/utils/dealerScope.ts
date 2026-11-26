import User from '../models/User';
import { cacheGet, cacheSet, cacheDel } from '../config/redis';

/**
 * Dealer scope helpers.
 *
 * A dealer's tree = the dealer account + every customer account created under
 * it (role 'user' with parentId = dealer). Sub-users of those customers never
 * own resources directly — their work accrues to the customer (effectiveUserId
 * = parentId), so [dealer, ...customers] already covers the whole tree.
 */

const SCOPE_TTL_SECONDS = 60;

/** All user ids whose resources a dealer may see/manage: self + customers. */
export const getDealerScopeUserIds = async (dealerId: string): Promise<string[]> => {
  const cacheKey = `dealerScope:${dealerId}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch { /* fall through to DB */ }
  }
  const customers = await User.find({ parentId: dealerId, role: 'user' }).select('_id').lean();
  const ids = [String(dealerId), ...customers.map((u: any) => String(u._id))];
  await cacheSet(cacheKey, JSON.stringify(ids), SCOPE_TTL_SECONDS);
  return ids;
};

/** Drop the cached scope after customer create/update/delete. */
export const invalidateDealerScope = async (dealerId?: string | null): Promise<void> => {
  if (dealerId) await cacheDel(`dealerScope:${dealerId}`);
};

/**
 * Resolve the dealer account governing a user, if any.
 * - dealer → itself
 * - customer (parentId → dealer) → that dealer
 * - sub-user (parentId → customer) → customer's dealer (grandparent)
 * - everyone else → null
 */
export const resolveDealerForUser = async (userId?: string | null): Promise<any | null> => {
  if (!userId) return null;
  const user = await User.findById(userId).select('role parentId').lean();
  if (!user) return null;
  if ((user as any).role === 'dealer') return User.findById(userId).select('-password').lean();
  const parentId = (user as any).parentId ? String((user as any).parentId) : null;
  if (!parentId) return null;
  const parent = await User.findById(parentId).select('role parentId').lean();
  if (!parent) return null;
  if ((parent as any).role === 'dealer') return User.findById(parentId).select('-password').lean();
  // sub-user → parent is a customer → check grandparent
  const grandParentId = (parent as any).parentId ? String((parent as any).parentId) : null;
  if (!grandParentId) return null;
  const grandParent = await User.findById(grandParentId).select('role').lean();
  if ((grandParent as any)?.role === 'dealer') return User.findById(grandParentId).select('-password').lean();
  return null;
};

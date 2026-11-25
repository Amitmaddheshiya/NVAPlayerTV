import mongoose from 'mongoose';
import User from '../models/User';
import Media from '../models/Media';

/**
 * Monthly storage reconciliation.
 *
 * `user.storageUsed` is maintained incrementally (recordUpload / delete /
 * purge). Drift can accumulate from crashed uploads, manual DB edits, or
 * bugs. This job recomputes the true sum of Media.size per owner and fixes
 * storageUsed when it diverges. Retained-but-archived media
 * (deletedFromLibrary=true) still occupies disk until purge, so it counts
 * toward the sum — matching how storageUsed treats it.
 */
export const reconcileStorageUsage = async (): Promise<{ checked: number; fixed: number; drifted: { userId: string; stored: number; actual: number }[] }> => {
  const sums = await Media.aggregate([
    { $match: { uploadedBy: { $exists: true, $ne: null } } },
    { $group: { _id: '$uploadedBy', total: { $sum: '$size' } } },
  ]);

  const actualByUser = new Map<string, number>();
  for (const row of sums) {
    actualByUser.set(String(row._id), Number(row.total || 0));
  }

  // Users with media OR a non-zero counter — catch both directions of drift.
  const users = await User.find({
    $or: [
      { storageUsed: { $gt: 0 } },
      { _id: { $in: [...actualByUser.keys()].map((id) => new mongoose.Types.ObjectId(id)) } },
    ],
  }).select('_id storageUsed email').lean();

  const drifted: { userId: string; stored: number; actual: number }[] = [];
  let fixed = 0;

  for (const user of users) {
    const userId = String(user._id);
    const actual = actualByUser.get(userId) || 0;
    const stored = Number((user as any).storageUsed || 0);
    if (stored === actual) continue;

    drifted.push({ userId, stored, actual });
    // Only auto-fix small drift; large drift gets logged for manual review
    // rather than silently rewriting billing-relevant counters.
    const drift = Math.abs(stored - actual);
    const driftRatio = stored > 0 ? drift / stored : 1;
    if (driftRatio <= 0.05 || drift <= 1024 * 1024) {
      await User.findByIdAndUpdate(user._id, { $set: { storageUsed: actual } });
      fixed += 1;
      console.log(`[StorageReconcile] Fixed user ${user.email || userId}: storageUsed ${stored} -> ${actual}`);
    } else {
      console.warn(`[StorageReconcile] Large drift for user ${user.email || userId}: stored=${stored} actual=${actual} — manual review needed`);
    }
  }

  if (drifted.length) {
    console.log(`[StorageReconcile] Done: ${users.length} users checked, ${drifted.length} drifted, ${fixed} auto-fixed`);
  }
  return { checked: users.length, fixed, drifted };
};

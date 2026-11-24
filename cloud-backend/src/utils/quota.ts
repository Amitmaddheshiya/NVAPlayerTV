import User, { IUser } from '../models/User';
import GlobalConfig from '../models/GlobalConfig';
import Device from '../models/Device';

/**
 * Per-account usage quotas (billing control).
 *
 * Counters live on the OWNER account (effectiveUserId) so sub-user activity
 * counts toward the parent. All monthly counters reset together when
 * `uploadUsageMonth` rolls over — call `ensureUsageMonth` before checking.
 *
 * Limits come from the GlobalConfig singleton so admins can tune them
 * without deploys.
 */

export const getUsageMonth = (): string => new Date().toISOString().slice(0, 7);

/** Reset monthly counters if the billing month rolled over. Mutates+saves user. */
export const ensureUsageMonth = async (user: IUser): Promise<void> => {
  const month = getUsageMonth();
  if (user.uploadUsageMonth !== month) {
    user.uploadUsageMonth = month;
    user.currentMonthUpload = 0;
    user.monthlyUploadOps = 0;
    user.monthlyAssignOps = 0;
    await user.save();
  }
};

export interface UploadQuotaCheck {
  ok: boolean;
  error?: string;
  status?: number;
}

const GB = 1024 * 1024 * 1024;

/**
 * Check storage + monthly-bytes + monthly-ops quotas for an upload of
 * `incomingBytes`. Call BEFORE writing the file; call `recordUpload` after
 * the Media doc is saved.
 */
export const checkUploadQuota = async (
  ownerId: string,
  incomingBytes: number
): Promise<UploadQuotaCheck> => {
  const [user, config] = await Promise.all([
    User.findById(ownerId),
    (GlobalConfig as any).getConfig(),
  ]);
  if (!user) return { ok: true }; // owner missing — nothing to enforce against

  await ensureUsageMonth(user);

  const storageLimitBytes = Number(config.storageLimitGB || 1) * GB;
  const usedStorage = Number(user.storageUsed || 0);
  if (usedStorage + incomingBytes > storageLimitBytes) {
    const remainingMB = Math.max(0, (storageLimitBytes - usedStorage) / 1024 / 1024).toFixed(1);
    return {
      ok: false,
      status: 400,
      error: `Storage limit exceeded. Your library limit is ${config.storageLimitGB} GB with ${remainingMB} MB remaining. Delete unused files or upgrade your plan.`,
    };
  }

  const monthlyLimitBytes = Number(config.monthlyUploadLimitGB || 10) * GB;
  if (Number(user.currentMonthUpload || 0) + incomingBytes > monthlyLimitBytes) {
    return {
      ok: false,
      status: 400,
      error: `Monthly upload limit exceeded (${config.monthlyUploadLimitGB} GB/month). Try again next month or upgrade your plan.`,
    };
  }

  const opsLimit = Number(config.monthlyUploadOpsLimit || 10);
  if (Number(user.monthlyUploadOps || 0) >= opsLimit) {
    return {
      ok: false,
      status: 429,
      error: `Monthly upload limit reached (${opsLimit} uploads/month). Failed or cancelled uploads do not count — this resets at the start of next month.`,
    };
  }

  return { ok: true };
};

/** Increment counters after a successful upload. */
export const recordUpload = async (ownerId: string, bytes: number): Promise<void> => {
  await User.findByIdAndUpdate(ownerId, {
    $inc: {
      storageUsed: bytes,
      currentMonthUpload: bytes,
      monthlyUploadOps: 1,
    },
    $set: { uploadUsageMonth: getUsageMonth() },
  });
};

export interface AssignQuotaCheck {
  ok: boolean;
  error?: string;
  status?: number;
}

/** Check monthly assignment-operation quota. 1 API call = 1 op. */
export const checkAssignQuota = async (ownerId: string): Promise<AssignQuotaCheck> => {
  const [user, config] = await Promise.all([
    User.findById(ownerId),
    (GlobalConfig as any).getConfig(),
  ]);
  if (!user) return { ok: true };

  await ensureUsageMonth(user);

  const opsLimit = Number(config.monthlyAssignOpsLimit || 15);
  if (Number(user.monthlyAssignOps || 0) >= opsLimit) {
    return {
      ok: false,
      status: 429,
      error: `Monthly assignment limit reached (${opsLimit} assignments/month). This resets at the start of next month.`,
    };
  }
  return { ok: true };
};

/** Increment assignment counter after a successful assign/configure call. */
export const recordAssign = async (ownerId: string): Promise<void> => {
  await User.findByIdAndUpdate(ownerId, {
    $inc: { monthlyAssignOps: 1 },
    $set: { uploadUsageMonth: getUsageMonth() },
  });
};

/** Max devices a user account may hold (admin assignment paths). */
export const checkDeviceLimit = async (ownerId: string, addingCount: number): Promise<{ ok: boolean; error?: string; limit?: number; current?: number }> => {
  const [current, config] = await Promise.all([
    Device.countDocuments({ assignedUserId: ownerId }),
    (GlobalConfig as any).getConfig(),
  ]);
  const limit = Number(config.maxDevicesPerUser || 4);
  if (current + addingCount > limit) {
    return {
      ok: false,
      limit,
      current,
      error: `Device limit reached. Your plan allows ${limit} TV(s); you currently have ${current}. Remove a device or upgrade your plan.`,
    };
  }
  return { ok: true, limit, current };
};

import { Request, Response } from 'express';
import GlobalConfig from '../models/GlobalConfig';
import { AuthRequest } from '../middleware/auth.middleware';

export const getConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const config = await (GlobalConfig as any).getConfig();
    res.json(config);
  } catch (error) {
    console.error('Get config error:', error);
    res.status(500).json({ error: 'Failed to fetch config' });
  }
};

export const updateConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { monthlyUploadLimitGB, singleUploadLimitMB, storageLimitGB, monthlyUploadOpsLimit, monthlyAssignOpsLimit, maxDevicesPerUser, archivedMediaRetentionDays, apkVersion, apkUrl } = req.body;

    const config = await (GlobalConfig as any).getConfig();

    if (monthlyUploadLimitGB !== undefined) config.monthlyUploadLimitGB = monthlyUploadLimitGB;
    if (singleUploadLimitMB !== undefined) config.singleUploadLimitMB = singleUploadLimitMB;
    if (storageLimitGB !== undefined) config.storageLimitGB = storageLimitGB;
    if (monthlyUploadOpsLimit !== undefined) config.monthlyUploadOpsLimit = monthlyUploadOpsLimit;
    if (monthlyAssignOpsLimit !== undefined) config.monthlyAssignOpsLimit = monthlyAssignOpsLimit;
    if (maxDevicesPerUser !== undefined) config.maxDevicesPerUser = maxDevicesPerUser;
    if (archivedMediaRetentionDays !== undefined) config.archivedMediaRetentionDays = archivedMediaRetentionDays;
    if (apkVersion !== undefined) config.apkVersion = apkVersion;
    if (apkUrl !== undefined) config.apkUrl = apkUrl;

    await config.save();

    res.json(config);
  } catch (error) {
    console.error('Update config error:', error);
    res.status(500).json({ error: 'Failed to update config' });
  }
};

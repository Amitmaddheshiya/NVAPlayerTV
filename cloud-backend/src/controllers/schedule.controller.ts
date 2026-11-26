import { Response } from 'express';
import mongoose from 'mongoose';
import ScheduleTemplate from '../models/Schedule';
import Device from '../models/Device';
import Group from '../models/Group';
import { AuthRequest } from '../middleware/auth.middleware';
import { processConfigForStorage } from '../utils/configProcessor';
import { syncScheduleForTarget } from '../services/schedule.service';

const MAX_TEMPLATES_PER_TARGET = 20;
// New templates use only scoped rules. Existing stored fullDay rules remain
// readable/playable by the TV scheduler, but cannot be newly created/updated.
const VALID_MODES = ['dayWise', 'dateWise', 'timeWise'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Resolve which account owns a schedule target (device/group) for this request.
 * For dealers this is the customer account inside their tree that owns the
 * target — schedules always belong to the target's real owner, never the dealer.
 */
const resolveTargetOwner = async (req: AuthRequest, targetType: string, targetId: string): Promise<{ ok: boolean; error?: string; ownerId?: string }> => {
  if (targetType === 'device') {
    const device = await Device.findOne({ deviceId: targetId }).select('deviceId assignedUserId').lean();
    if (!device) return { ok: false, error: 'Device not found' };
    const owner = String((device as any).assignedUserId || '');
    if (!owner) return { ok: false, error: 'Access denied: device is not assigned to your account' };
    if (req.userRole === 'admin') return { ok: true, ownerId: owner };
    if (req.userRole === 'dealer') {
      return (req.scopeUserIds || []).map(String).includes(owner)
        ? { ok: true, ownerId: owner }
        : { ok: false, error: 'Access denied: device is outside your dealer scope' };
    }
    if (owner !== String(req.effectiveUserId || req.userId)) {
      return { ok: false, error: 'Access denied: device is not assigned to your account' };
    }
    if (req.isSubUser && !(req.resourceAccess?.devices || []).includes(String(targetId))) {
      return { ok: false, error: 'Access denied: device is outside your assigned resources' };
    }
    return { ok: true, ownerId: owner };
  }

  const group = await Group.findById(targetId).select('ownerId devices').lean();
  if (!group) return { ok: false, error: 'Group not found' };
  if (req.userRole === 'admin') return { ok: true };

  let owner = (group as any).ownerId ? String((group as any).ownerId) : '';
  if (!owner) {
    // Legacy group: single owning account inferred from its devices.
    const groupDevices = Array.isArray((group as any).devices) ? (group as any).devices : [];
    if (!groupDevices.length) return { ok: false, error: 'Access denied: group does not belong to your account' };
    const deviceOwners = await Device.find({ deviceId: { $in: groupDevices } }).distinct('assignedUserId');
    const validOwners = [...new Set(deviceOwners.filter(Boolean).map(String))];
    if (validOwners.length !== 1) return { ok: false, error: 'Access denied: group does not belong to your account' };
    const allOwned = await Device.countDocuments({ deviceId: { $in: groupDevices }, assignedUserId: validOwners[0] }) === groupDevices.length;
    if (!allOwned) return { ok: false, error: 'Access denied: group does not belong to your account' };
    owner = validOwners[0];
  }

  if (req.userRole === 'dealer') {
    if (!(req.scopeUserIds || []).map(String).includes(owner)) {
      return { ok: false, error: 'Access denied: group is outside your dealer scope' };
    }
  } else if (owner !== String(req.effectiveUserId || req.userId)) {
    return { ok: false, error: 'Access denied: group does not belong to your account' };
  }
  if (req.isSubUser && !(req.resourceAccess?.groups || []).includes(String((group as any)._id))) {
    return { ok: false, error: 'Access denied: group is outside your assigned resources' };
  }
  return { ok: true, ownerId: owner };
};

const subUserModuleAllowed = (req: AuthRequest, targetType: string): boolean => {
  if (req.userRole === 'admin' || !req.isSubUser) return true;
  const module = targetType === 'group' ? 'groups' : 'devices';
  return req.permissions?.[module as keyof NonNullable<AuthRequest['permissions']>] !== false;
};

const validateSchedule = (schedule: any): string | null => {
  if (!schedule || typeof schedule !== 'object') return 'Schedule configuration is required';
  if (!VALID_MODES.includes(schedule.mode)) return 'Invalid schedule mode';
  const days = Array.isArray(schedule.days) ? schedule.days.map(Number).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6) : [];
  if (schedule.mode === 'dayWise' && !days.length) return 'Select at least one day for day-wise schedule';
  if (schedule.mode === 'dateWise') {
    const dates = Array.isArray(schedule.dates) ? schedule.dates.filter((d: any) => typeof d === 'string' && DATE_RE.test(d)) : [];
    if (!dates.length) return 'Select at least one date for date-wise schedule';
  }
  const start = String(schedule.startTime || '').trim();
  const end = String(schedule.endTime || '').trim();
  if (start && !TIME_RE.test(start)) return 'Invalid start time (use HH:mm)';
  if (end && !TIME_RE.test(end)) return 'Invalid end time (use HH:mm)';
  if (schedule.mode === 'timeWise' && (!start || !end)) return 'Start and end time are required for time-wise schedule';
  if (Boolean(start) !== Boolean(end)) return 'Enter both start and end times, or leave both empty';
  return null;
};

const sanitizeSchedule = (input: any) => ({
  mode: input.mode,
  days: Array.isArray(input.days) ? [...new Set(input.days.map(Number).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6))] : [],
  dates: Array.isArray(input.dates) ? [...new Set(input.dates.filter((d: any) => typeof d === 'string' && DATE_RE.test(d)))].sort() : [],
  startTime: input.startTime ? String(input.startTime).trim() : undefined,
  endTime: input.endTime ? String(input.endTime).trim() : undefined,
});

export const getScheduleTemplates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { targetType, targetId } = req.query;
    if (!targetType || !targetId) {
      res.status(400).json({ error: 'targetType and targetId are required' });
      return;
    }
    const access = await resolveTargetOwner(req, String(targetType), String(targetId));
    if (!access.ok) {
      res.status(access.error === 'Device not found' || access.error === 'Group not found' ? 404 : 403).json({ error: access.error });
      return;
    }
    const ownerClause = req.userRole === 'admin'
      ? {}
      : { ownerId: new mongoose.Types.ObjectId(access.ownerId) };
    const templates = await ScheduleTemplate.find({ ...ownerClause, targetType: String(targetType), targetId: String(targetId) }).sort({ createdAt: -1 }).lean();
    res.json({ data: templates, limit: MAX_TEMPLATES_PER_TARGET, count: templates.length });
  } catch (error) {
    console.error('Get schedule templates error:', error);
    res.status(500).json({ error: 'Failed to fetch schedule templates' });
  }
};

export const createScheduleTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, targetType, targetId, config, schedule, enabled } = req.body;
    if (!name || !targetType || !targetId || !config) {
      res.status(400).json({ error: 'name, targetType, targetId and config are required' });
      return;
    }
    if (!['device', 'group'].includes(targetType)) {
      res.status(400).json({ error: 'targetType must be device or group' });
      return;
    }
    if (!subUserModuleAllowed(req, targetType)) {
      res.status(403).json({ error: `Access denied: '${targetType === 'group' ? 'groups' : 'devices'}' permission is not granted` });
      return;
    }
    const scheduleError = validateSchedule(schedule);
    if (scheduleError) {
      res.status(400).json({ error: scheduleError });
      return;
    }
    const access = await resolveTargetOwner(req, targetType, String(targetId));
    if (!access.ok) {
      res.status(access.error === 'Device not found' || access.error === 'Group not found' ? 404 : 403).json({ error: access.error });
      return;
    }

    // Schedules belong to the target's real owner (a customer for dealers).
    const ownerId = req.userRole === 'admin' ? undefined : new mongoose.Types.ObjectId(access.ownerId);
    const existingCount = await ScheduleTemplate.countDocuments({ targetType, targetId: String(targetId), ...(ownerId ? { ownerId } : {}) });
    if (existingCount >= MAX_TEMPLATES_PER_TARGET) {
      res.status(400).json({ error: `Schedule limit reached (${MAX_TEMPLATES_PER_TARGET} templates per target)` });
      return;
    }

    const processed = await processConfigForStorage(config, req.userRole === 'admin' ? undefined : access.ownerId);
    if (processed.error || !processed.config) {
      res.status(processed.status || 400).json({ error: processed.error || 'Invalid configuration' });
      return;
    }
    delete (processed.config as any).schedule;

    const template = await ScheduleTemplate.create({
      name: String(name).trim(),
      targetType,
      targetId: String(targetId),
      ownerId,
      config: processed.config,
      schedule: sanitizeSchedule(schedule),
      enabled: enabled !== false,
    });

    await syncScheduleForTarget(targetType, String(targetId));
    res.status(201).json(template);
  } catch (error) {
    console.error('Create schedule template error:', error);
    res.status(500).json({ error: 'Failed to create schedule template' });
  }
};

export const updateScheduleTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const template = await ScheduleTemplate.findById(req.params.id);
    if (!template) {
      res.status(404).json({ error: 'Schedule template not found' });
      return;
    }
    if (req.userRole !== 'admin' && String(template.ownerId || '') !== String(req.effectiveUserId || req.userId) && req.userRole !== 'dealer') {
      res.status(404).json({ error: 'Schedule template not found' });
      return;
    }
    if (!subUserModuleAllowed(req, template.targetType)) {
      res.status(403).json({ error: 'Access denied for this schedule target' });
      return;
    }
    const targetAccess = await resolveTargetOwner(req, template.targetType, template.targetId);
    if (!targetAccess.ok) {
      res.status(403).json({ error: targetAccess.error || 'Access denied for this schedule target' });
      return;
    }
    // The template must belong to the target's real owner account.
    if (req.userRole !== 'admin' && String(template.ownerId || '') !== String(targetAccess.ownerId || '')) {
      res.status(404).json({ error: 'Schedule template not found' });
      return;
    }

    const { name, config, schedule, enabled } = req.body;
    if (name !== undefined) template.name = String(name).trim();
    if (enabled !== undefined) template.enabled = !!enabled;
    if (schedule !== undefined) {
      const scheduleError = validateSchedule(schedule);
      if (scheduleError) {
        res.status(400).json({ error: scheduleError });
        return;
      }
      template.schedule = sanitizeSchedule(schedule) as any;
    }
    if (config !== undefined) {
      const processed = await processConfigForStorage(config, req.userRole === 'admin' ? undefined : targetAccess.ownerId);
      if (processed.error || !processed.config) {
        res.status(processed.status || 400).json({ error: processed.error || 'Invalid configuration' });
        return;
      }
      delete (processed.config as any).schedule;
      template.config = processed.config;
    }
    await template.save();

    await syncScheduleForTarget(template.targetType, template.targetId);
    res.json(template);
  } catch (error) {
    console.error('Update schedule template error:', error);
    res.status(500).json({ error: 'Failed to update schedule template' });
  }
};

export const deleteScheduleTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const template = await ScheduleTemplate.findById(req.params.id);
    if (!template) {
      res.status(404).json({ error: 'Schedule template not found' });
      return;
    }
    if (!subUserModuleAllowed(req, template.targetType)) {
      res.status(403).json({ error: 'Access denied for this schedule target' });
      return;
    }
    const targetAccess = await resolveTargetOwner(req, template.targetType, template.targetId);
    if (!targetAccess.ok) {
      res.status(403).json({ error: targetAccess.error || 'Access denied for this schedule target' });
      return;
    }
    // The template must belong to the target's real owner account.
    if (req.userRole !== 'admin' && String(template.ownerId || '') !== String(targetAccess.ownerId || '')) {
      res.status(404).json({ error: 'Schedule template not found' });
      return;
    }
    const { targetType, targetId } = template;
    await ScheduleTemplate.findByIdAndDelete(template._id);
    await syncScheduleForTarget(targetType, targetId);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete schedule template error:', error);
    res.status(500).json({ error: 'Failed to delete schedule template' });
  }
};

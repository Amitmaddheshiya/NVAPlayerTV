import { Request, Response } from 'express';
import Schedule from '../models/Schedule';

export const getSchedules = async (req: Request, res: Response): Promise<void> => {
  try {
    const schedules = await Schedule.find().sort({ createdAt: -1 });
    res.json(schedules);
  } catch (error) {
    console.error('Get schedules error:', error);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
};

export const createSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, profile, slots, fallback, assignedDevices } = req.body;

    const schedule = new Schedule({
      name,
      profile,
      slots,
      fallback,
      assignedDevices,
    });

    await schedule.save();

    res.status(201).json(schedule);
  } catch (error) {
    console.error('Create schedule error:', error);
    res.status(500).json({ error: 'Failed to create schedule' });
  }
};

export const updateSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, profile, slots, fallback, assignedDevices } = req.body;

    const schedule = await Schedule.findByIdAndUpdate(
      req.params.id,
      { name, profile, slots, fallback, assignedDevices },
      { new: true }
    );

    if (!schedule) {
      res.status(404).json({ error: 'Schedule not found' });
      return;
    }

    res.json(schedule);
  } catch (error) {
    console.error('Update schedule error:', error);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
};

export const deleteSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const schedule = await Schedule.findByIdAndDelete(req.params.id);
    if (!schedule) {
      res.status(404).json({ error: 'Schedule not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete schedule error:', error);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
};

import mongoose, { Document, Schema } from 'mongoose';

/** fullDay remains in the stored type only for previously saved templates. */
export type ScheduleMode = 'fullDay' | 'dayWise' | 'dateWise' | 'timeWise';
export type ScheduleTargetType = 'device' | 'group';

export interface IScheduleTemplate extends Document {
  name: string;
  targetType: ScheduleTargetType;
  /** deviceId string for 'device', Group _id string for 'group' */
  targetId: string;
  ownerId?: mongoose.Types.ObjectId;
  /** Full processed device config snapshot (same shape as Device.config, without schedule) */
  config: Record<string, unknown>;
  schedule: {
    mode: ScheduleMode;
    /** 0=Sunday..6=Saturday. Empty = every day (fullDay/dayWise). */
    days: number[];
    /** 'YYYY-MM-DD' entries for dateWise mode */
    dates: string[];
    /** 'HH:mm' 24h. Optional for fullDay/dayWise/dateWise; required for timeWise. */
    startTime?: string;
    endTime?: string;
  };
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ScheduleTemplateSchema = new Schema<IScheduleTemplate>(
  {
    name: { type: String, required: true, trim: true },
    targetType: { type: String, enum: ['device', 'group'], required: true },
    targetId: { type: String, required: true, trim: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
    config: { type: Schema.Types.Mixed, required: true },
    schedule: {
    // Keep fullDay for legacy records; API validation prevents new ones.
    mode: { type: String, enum: ['fullDay', 'dayWise', 'dateWise', 'timeWise'], required: true },
      days: [{ type: Number, min: 0, max: 6 }],
      dates: [{ type: String }],
      startTime: { type: String },
      endTime: { type: String },
    },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ScheduleTemplateSchema.index({ targetType: 1, targetId: 1 });
ScheduleTemplateSchema.index({ ownerId: 1 });

export default mongoose.model<IScheduleTemplate>('ScheduleTemplate', ScheduleTemplateSchema);

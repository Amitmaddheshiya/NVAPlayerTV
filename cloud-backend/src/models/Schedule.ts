import mongoose, { Document, Schema } from 'mongoose';

export interface ISchedule extends Document {
  name: string;
  profile: {
    layout: string;
    sections: Array<{
      section: number;
      mediaIds: string[];
      direction: string;
      duration: number;
    }>;
    ticker: {
      text: string;
      position: string;
      color: string;
      speed: number;
    };
  };
  slots: Array<{
    profileId: string;
    startTime: string;
    endTime: string;
    days: number[];
    priority: number;
  }>;
  fallback: {
    mode: 'black' | 'message' | 'image';
    message?: string;
    textColor?: string;
    bgColor?: string;
    imageUrl?: string;
  };
  assignedDevices: string[];
  createdAt: Date;
  updatedAt: Date;
}

const ScheduleSchema = new Schema<ISchedule>(
  {
    name: { type: String, required: true },
    profile: {
      layout: { type: String, default: 'fullscreen' },
      sections: [
        {
          section: { type: Number },
          mediaIds: [{ type: String }],
          direction: { type: String },
          duration: { type: Number },
        },
      ],
      ticker: {
        text: { type: String },
        position: { type: String },
        color: { type: String },
        speed: { type: Number },
      },
    },
    slots: [
      {
        profileId: { type: String },
        startTime: { type: String },
        endTime: { type: String },
        days: [{ type: Number }],
        priority: { type: Number },
      },
    ],
    fallback: {
      mode: { type: String, enum: ['black', 'message', 'image'], default: 'black' },
      message: { type: String },
      textColor: { type: String },
      bgColor: { type: String },
      imageUrl: { type: String },
    },
    assignedDevices: [{ type: String }],
  },
  { timestamps: true }
);

ScheduleSchema.index({ name: 1 });
ScheduleSchema.index({ assignedDevices: 1 });

export default mongoose.model<ISchedule>('Schedule', ScheduleSchema);

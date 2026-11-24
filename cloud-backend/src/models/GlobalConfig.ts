import mongoose, { Document, Schema } from 'mongoose';

export interface IGlobalConfig extends Document {
  monthlyUploadLimitGB: number;
  singleUploadLimitMB: number;
  storageLimitGB: number;
  monthlyUploadOpsLimit: number;
  monthlyAssignOpsLimit: number;
  maxDevicesPerUser: number;
  archivedMediaRetentionDays: number;
  apkVersion: string;
  apkUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const GlobalConfigSchema = new Schema<IGlobalConfig>(
  {
    monthlyUploadLimitGB: { type: Number, default: 10 },
    singleUploadLimitMB: { type: Number, default: 500 },
    storageLimitGB: { type: Number, default: 1 },
    monthlyUploadOpsLimit: { type: Number, default: 10 },
    monthlyAssignOpsLimit: { type: Number, default: 15 },
    maxDevicesPerUser: { type: Number, default: 4 },
    archivedMediaRetentionDays: { type: Number, default: 30 },
    apkVersion: { type: String, default: '1.0.0' },
    apkUrl: { type: String },
  },
  { timestamps: true }
);

// Singleton pattern - only one document should exist
GlobalConfigSchema.statics.getConfig = async function() {
  let config = await this.findOne();
  if (!config) {
    config = await this.create({});
  }
  return config;
};

export default mongoose.model<IGlobalConfig>('GlobalConfig', GlobalConfigSchema);

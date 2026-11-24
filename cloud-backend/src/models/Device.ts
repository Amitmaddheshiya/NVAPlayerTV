import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IDevice extends Document {
  deviceId: string;
  name: string;
  assignedUserId?: Types.ObjectId;
  group?: string;
  status: 'online' | 'offline';
  lastSeen: Date;
  appVersion: string;
  activated: boolean;
  storage: {
    used: number;
    total: number;
  };
  config: {
    orientation: string;
    layout: string;
    grid2Layout?: string;
    grid3Layout?: string;
    gridRatio?: string;
    slideDuration?: number;
    animation?: string;
    bgColor?: string;
    sections: any[];
    ticker: any;
    widgets?: {
      clock?: any;
      weather?: any;
      emergencyAlert?: any;
    };
    cache?: {
      videoMB?: number;
    };
    schedule?: any;
    mediaUrls?: string[];
  };
  // Cache tracking for offline support
  cacheInfo: {
    configVersion: number;
    lastSyncTime: Date;
    cachedMedia: Array<{
      mediaId: string;
      url: string;
      size: number;
      cachedAt: Date;
      section: number;
    }>;
    totalCacheSize: number;
  };
  configHistory: Array<{
    config: Record<string, unknown>;
    configVersion: number;
    savedAt: Date;
    savedBy?: Types.ObjectId;
    source: string;
  }>;
  health?: Record<string, unknown>;
  // Active push emergency alert (message or media) shown fullscreen on the TV
  emergencyAlert?: {
    active: boolean;
    kind?: 'message' | 'media';
    type: string;
    title: string;
    message: string;
    mediaUrl?: string;
    mediaType?: string;
    sound: boolean;
    triggeredAt: Date;
    triggeredBy?: Types.ObjectId;
  } | null;
  // Track who last configured this device
  lastConfiguredBy?: Types.ObjectId;
  lastConfiguredAt?: Date;
  location?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceSchema = new Schema<IDevice>(
  {
    deviceId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    assignedUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    group: { type: String, trim: true },
    status: { type: String, enum: ['online', 'offline'], default: 'offline' },
    lastSeen: { type: Date, default: Date.now },
    appVersion: { type: String, default: '1.0.0' },
    activated: { type: Boolean, default: false },
    storage: {
      used: { type: Number, default: 0, min: 0 },
      total: { type: Number, default: 0, min: 0 },
    },
    config: {
      orientation: { type: String, default: 'horizontal' },
      layout: { type: String, default: 'fullscreen' },
      grid2Layout: { type: String },
      grid3Layout: { type: String },
      gridRatio: { type: String },
      slideDuration: { type: Number, min: 1 },
      animation: { type: String },
      bgColor: { type: String, default: '#000000' },
      sections: [{ type: Schema.Types.Mixed }],
      ticker: { type: Schema.Types.Mixed },
      widgets: {
        clock: { type: Schema.Types.Mixed },
        weather: { type: Schema.Types.Mixed },
        emergencyAlert: { type: Schema.Types.Mixed },
      },
      cache: {
        videoMB: { type: Number, min: 0 },
      },
      schedule: { type: Schema.Types.Mixed },
      mediaUrls: [{ type: String }],
    },
    // Cache tracking for offline support
    cacheInfo: {
      configVersion: { type: Number, default: 0 },
      lastSyncTime: { type: Date, default: Date.now },
      cachedMedia: [{
        mediaId: { type: String },
        url: { type: String },
        size: { type: Number, default: 0 },
        cachedAt: { type: Date, default: Date.now },
        section: { type: Number },
      }],
      totalCacheSize: { type: Number, default: 0 },
    },
    configHistory: [{
      config: { type: Schema.Types.Mixed, required: true },
      configVersion: { type: Number, default: 0 },
      savedAt: { type: Date, default: Date.now },
      savedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      source: { type: String, default: 'device' },
    }],
    health: { type: Schema.Types.Mixed, default: () => ({ playbackErrorCount: 0, recentErrors: [] }) },
    emergencyAlert: { type: Schema.Types.Mixed, default: null },
    // Track who last configured this device
    lastConfiguredBy: { type: Schema.Types.ObjectId, ref: 'User' },
    lastConfiguredAt: { type: Date },
    location: { type: String, trim: true },
  },
  { timestamps: true }
);

// Index for faster queries (unique fields already have indexes)
DeviceSchema.index({ status: 1 });
DeviceSchema.index({ assignedUserId: 1 });
DeviceSchema.index({ group: 1 });
DeviceSchema.index({ lastSeen: -1 }); // For offline detection
DeviceSchema.index({ status: 1, lastSeen: -1 }); // Compound index for offline detection queries
DeviceSchema.index({ assignedUserId: 1, status: 1 }); // Compound index for user's online devices
DeviceSchema.index({ assignedUserId: 1, status: 1, lastSeen: -1 }); // Compound index for user's devices with status and lastSeen
DeviceSchema.index({ lastConfiguredBy: 1, lastConfiguredAt: -1 }); // For audit tracking
DeviceSchema.index({ 'cacheInfo.configVersion': 1 }); // For cache sync
DeviceSchema.index({ updatedAt: -1 }); // getDevices sort (admin/unfiltered)
DeviceSchema.index({ assignedUserId: 1, updatedAt: -1 }); // getDevices sort (per-user)

// Virtual field to calculate display status (30D+ for long offline devices)
DeviceSchema.virtual('displayStatus').get(function() {
  if (this.status === 'online') return 'online';
  
  const now = new Date();
  const lastSeen = new Date(this.lastSeen);
  const daysOffline = Math.floor((now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysOffline >= 30) return '30D+';
  return 'offline';
});

// Ensure virtual fields are included in JSON output
DeviceSchema.set('toJSON', { virtuals: true });
DeviceSchema.set('toObject', { virtuals: true });

export default mongoose.model<IDevice>('Device', DeviceSchema);

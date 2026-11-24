import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  userId: mongoose.Types.ObjectId;
  action: 'upload_media' | 'configure_device' | 'assign_device' | 'unassign_device' | 'delete_media' | 'delete_device' | 'create_user' | 'delete_user' | 'create_group' | 'delete_group';
  targetType: 'user' | 'device' | 'media' | 'group';
  targetId: string;
  details: {
    deviceId?: string;
    mediaId?: string;
    folder?: string;
    config?: any;
    previousConfig?: any;
    deviceCount?: number;
    [key: string]: any;
  };
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

const AuditLogSchema = new Schema<IAuditLog>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  action: {
    type: String,
    enum: ['upload_media', 'configure_device', 'assign_device', 'unassign_device', 'delete_media', 'delete_device', 'create_user', 'delete_user', 'create_group', 'delete_group'],
    required: true
  },
  targetType: {
    type: String,
    enum: ['user', 'device', 'media', 'group'],
    required: true
  },
  targetId: { type: String, required: true },
  details: { type: Schema.Types.Mixed, default: {} },
  ipAddress: { type: String },
  userAgent: { type: String },
  timestamp: { type: Date, default: Date.now }
});

// Indexes for efficient querying
AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index({ targetType: 1, targetId: 1, timestamp: -1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });
AuditLogSchema.index({ timestamp: -1 }); // For cleanup of old logs
// Auto-expire audit logs after 90 days so the collection stays bounded.
AuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

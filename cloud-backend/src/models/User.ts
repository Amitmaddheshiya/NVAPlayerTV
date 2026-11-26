import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  email: string;
  password: string;
  role: 'admin' | 'user' | 'sub-user' | 'dealer';
  phone?: string;
  city?: string;
  businessName?: string;
  assignedDevices: string[];
  subUserLimit: number;
  /** Dealer-only: max devices across the dealer's whole customer tree. 0 = unlimited. */
  deviceLimit: number;
  /** Dealer-only: max customer accounts the dealer may create. 0 = unlimited. */
  userLimit: number;
  /** Dealer branding logo filename (served via /api/branding/:file). Admins use GlobalConfig.logoUrl. */
  logoUrl?: string;
  parentId?: mongoose.Types.ObjectId;
  permissions?: {
    devices?: boolean;
    groups?: boolean;
    library?: boolean;
    settings?: boolean;
    subUsers?: boolean;
  };
  resourceAccess?: {
    devices: string[];
    groups: string[];
  };
  storageUsed: number;
  currentMonthUpload: number;
  uploadUsageMonth?: string;
  monthlyUploadOps: number;
  monthlyAssignOps: number;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'user', 'sub-user', 'dealer'], default: 'user' },
    phone: { type: String, trim: true },
    city: { type: String, trim: true },
    businessName: { type: String, trim: true },
    assignedDevices: [{ type: String }],
    subUserLimit: { type: Number, default: 0, min: 0 },
    deviceLimit: { type: Number, default: 0, min: 0 },
    userLimit: { type: Number, default: 0, min: 0 },
    logoUrl: { type: String, trim: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'User' },
    permissions: {
      devices: { type: Boolean, default: true },
      groups: { type: Boolean, default: true },
      library: { type: Boolean, default: true },
      settings: { type: Boolean, default: true },
      subUsers: { type: Boolean, default: false },
    },
    resourceAccess: {
      devices: [{ type: String, trim: true }],
      groups: [{ type: String, trim: true }],
    },
    storageUsed: { type: Number, default: 0, min: 0 },
    currentMonthUpload: { type: Number, default: 0, min: 0 },
    uploadUsageMonth: { type: String, default: '' },
    monthlyUploadOps: { type: Number, default: 0, min: 0 },
    monthlyAssignOps: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

UserSchema.index({ role: 1 });
UserSchema.index({ role: 1, createdAt: -1 }); // Compound index for filtering by role and sorting by creation
UserSchema.index({ assignedDevices: 1 });
UserSchema.index({ parentId: 1 });
UserSchema.index({ createdAt: -1 });
// email:1 index is automatically created by unique: true, no need for explicit index

export default mongoose.model<IUser>('User', UserSchema);

import mongoose, { Document, Schema } from 'mongoose';

export interface IGroup extends Document {
  name: string;
  devices: string[];
  ownerId?: mongoose.Types.ObjectId;
  config?: Record<string, unknown>;
  configHistory: Array<{
    config: Record<string, unknown>;
    savedAt: Date;
    savedBy?: mongoose.Types.ObjectId;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const GroupSchema = new Schema<IGroup>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    devices: [{ type: String, trim: true }],
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    config: { type: Schema.Types.Mixed },
    configHistory: [{
      config: { type: Schema.Types.Mixed, required: true },
      savedAt: { type: Date, default: Date.now },
      savedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    }],
  },
  { timestamps: true }
);

// Indexes for performance
GroupSchema.index({ createdAt: -1 }); // For sorting groups by creation time
// name:1 index is automatically created by unique: true, no need for explicit index

export default mongoose.model<IGroup>('Group', GroupSchema);

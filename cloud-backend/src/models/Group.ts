import mongoose, { Document, Schema } from 'mongoose';

export interface IGroup extends Document {
  name: string;
  devices: string[];
  ownerId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const GroupSchema = new Schema<IGroup>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    devices: [{ type: String, trim: true }],
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  },
  { timestamps: true }
);

// Indexes for performance
GroupSchema.index({ createdAt: -1 }); // For sorting groups by creation time
// name:1 index is automatically created by unique: true, no need for explicit index

export default mongoose.model<IGroup>('Group', GroupSchema);

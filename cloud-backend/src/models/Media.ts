import mongoose, { Document, Schema } from 'mongoose';

export interface IMedia extends Document {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  hash?: string;
  url: string;
  storageType: 'local' | 's3';
  path: string;
  uploadedBy?: string;
  assignedDevices: string[];
  section: number;
  folder?: string;
  deletedFromLibrary?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MediaSchema = new Schema<IMedia>(
  {
    filename: { type: String, required: true, trim: true },
    originalName: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    size: { type: Number, required: true, min: 0 },
    hash: { type: String, trim: true, lowercase: true },
    url: { type: String, required: true, trim: true },
    storageType: { type: String, enum: ['local', 's3'], default: 'local' },
    path: { type: String, required: true, trim: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    assignedDevices: [{ type: String }],
    section: { type: Number, required: true, min: 1 },
    folder: { type: String, trim: true },
    deletedFromLibrary: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

MediaSchema.index({ filename: 1 });
MediaSchema.index({ section: 1 });
MediaSchema.index({ uploadedBy: 1 });
MediaSchema.index({ uploadedBy: 1, createdAt: -1 }); // Compound index for user's media
MediaSchema.index({ uploadedBy: 1, folder: 1, createdAt: -1 }); // Compound index for user's media in folder
MediaSchema.index({ uploadedBy: 1, section: 1 }); // Compound index for user's media by section
MediaSchema.index({ folder: 1 });
MediaSchema.index({ assignedDevices: 1 });
MediaSchema.index({ createdAt: -1 }); // For cleanup and recent media
MediaSchema.index({ path: 1 }, { unique: true }); // Hot lookup: fileAccessAuth per range request
MediaSchema.index({ url: 1 }); // getMediaList $in queries

export default mongoose.model<IMedia>('Media', MediaSchema);

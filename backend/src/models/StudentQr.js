import mongoose from 'mongoose';

const studentQrSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    course: { type: String, trim: true },
    semester: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    mobile: { type: String, required: true, trim: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    uploadBatch: { type: mongoose.Schema.Types.ObjectId, ref: 'UploadBatch' },
    token: { type: String, required: true, unique: true },
    qrUrl: { type: String },
    qrImageUrl: { type: String },
    qrImagePath: { type: String },
    status: {
      type: String,
      enum: ['pending', 'generated', 'downloaded', 'used', 'inactive'],
      default: 'pending'
    },
    generatedAt: Date,
    downloadedAt: Date,
    usedAt: Date,
    usedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

studentQrSchema.index({ mobile: 1, event: 1 });
studentQrSchema.index({ event: 1, status: 1 });

export default mongoose.model('StudentQr', studentQrSchema);

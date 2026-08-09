import mongoose from 'mongoose';

const uploadBatchSchema = new mongoose.Schema(
  {
    fileName: String,
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
    totalRows: { type: Number, default: 0 },
    importedRows: { type: Number, default: 0 },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, enum: ['student_import', 'qr_data_import'], default: 'student_import' }
  },
  { timestamps: true }
);

export default mongoose.model('UploadBatch', uploadBatchSchema);

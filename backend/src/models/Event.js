import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    slug: { type: String, required: true, unique: true },
    templateFile: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    qrPlacement: {
      x: { type: Number, default: 760 },
      y: { type: Number, default: 500 },
      size: { type: Number, default: 260 }
    },
    eventNamePlacement: {
      x: { type: Number, default: 80 },
      y: { type: Number, default: 80 },
      fontSize: { type: Number, default: 54 },
      color: { type: String, default: '#111827' }
    }
  },
  { timestamps: true }
);

export default mongoose.model('Event', eventSchema);

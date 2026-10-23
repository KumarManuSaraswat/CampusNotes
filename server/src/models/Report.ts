import mongoose, { Schema } from 'mongoose';
const schema = new Schema(
  {
    reportedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: Schema.Types.ObjectId, ref: 'Note', required: true },
    reason: {
      type: String,
      enum: ['spam', 'misleading_metadata', 'duplicate', 'inappropriate', 'unauthorized_material'],
      required: true,
    },
    description: { type: String, default: '' },
    status: { type: String, enum: ['open', 'reviewed', 'resolved'], default: 'open' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
schema.index({ reportedBy: 1, note: 1 }, { unique: true });
schema.index({ status: 1, createdAt: -1 });
export const Report = mongoose.model('Report', schema);

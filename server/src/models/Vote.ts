import mongoose, { Schema } from 'mongoose';
const schema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: Schema.Types.ObjectId, ref: 'Note', required: true },
    value: { type: Number, enum: [-1, 1], required: true },
  },
  { timestamps: true },
);
schema.index({ user: 1, note: 1 }, { unique: true });
export const Vote = mongoose.model('Vote', schema);

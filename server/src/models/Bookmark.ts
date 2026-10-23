import mongoose, { Schema } from 'mongoose';
const schema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: Schema.Types.ObjectId, ref: 'Note', required: true },
  },
  { timestamps: true },
);
schema.index({ user: 1, note: 1 }, { unique: true });
export const Bookmark = mongoose.model('Bookmark', schema);

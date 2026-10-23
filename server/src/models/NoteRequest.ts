import mongoose, { Schema } from 'mongoose';
const schema = new Schema(
  {
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    subject: { type: String, required: true },
    normalizedKey: { type: String, required: true },
    instructor: { type: String, default: '' },
    lectureDate: { type: Date, default: null },
    description: { type: String, default: '' },
    status: { type: String, enum: ['open', 'fulfilled'], default: 'open' },
    fulfilledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    fulfilledNote: { type: Schema.Types.ObjectId, ref: 'Note', default: null },
    fulfilledAt: { type: Date, default: null },
  },
  { timestamps: true },
);
schema.index({ status: 1, createdAt: -1 });
schema.index(
  { createdBy: 1, normalizedKey: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } },
);
export const NoteRequest = mongoose.model('NoteRequest', schema);

import mongoose, { Schema } from 'mongoose';
const noteSchema = new Schema(
  {
    title: { type: String, required: true, maxlength: 160 },
    description: { type: String, default: '' },
    originalFilename: { type: String, required: true },
    storageProvider: { type: String, required: true, default: 'cloudinary' },
    storagePublicId: { type: String, required: true },
    storageResourceType: { type: String, required: true },
    fileType: { type: String, required: true },
    fileSize: { type: Number, required: true },
    subject: { type: String, default: '' },
    tags: { type: [String], default: [] },
    instructor: { type: String, default: '' },
    lectureDate: { type: Date, default: null },
    semester: { type: String, default: '' },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    aiMetadata: { type: Schema.Types.Mixed, default: null },
    studyGateStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'needs_review', 'failed', 'legacy_unreviewed'],
      default: 'legacy_unreviewed',
      index: true,
    },
    studyAssessment: { type: Schema.Types.Mixed, default: null },
    studyGateInputVersion: { type: Number, default: 1 },
    studyGateReviewedAt: { type: Date, default: null },
    studyGateAttemptId: { type: String, default: null, select: false },
    studyGateExpiresAt: { type: Date, default: null },
    reviewRequestedAt: { type: Date, default: null },
    reviewMessage: { type: String, default: '' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    extractedText: { type: String, default: null, select: false },
    processingStatus: {
      type: String,
      enum: ['not_requested', 'pending', 'completed', 'failed'],
      default: 'not_requested',
    },
    processingError: { type: String, default: null, select: false },
    metadataSource: {
      type: String,
      enum: ['manual', 'filename', 'ai_reviewed'],
      default: 'filename',
    },
    lastProcessedAt: { type: Date, default: null },
    upvoteCount: { type: Number, default: 0, min: 0 },
    downvoteCount: { type: Number, default: 0, min: 0 },
    score: { type: Number, default: 0 },
  },
  { timestamps: true },
);
noteSchema.index({
  title: 'text',
  description: 'text',
  subject: 'text',
  tags: 'text',
  instructor: 'text',
});
noteSchema.index({ createdAt: -1 });
noteSchema.index({ score: -1, createdAt: -1 });
noteSchema.index({ subject: 1, createdAt: -1 });
export const Note = mongoose.model('Note', noteSchema);

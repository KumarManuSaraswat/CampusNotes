import mongoose, { Schema } from 'mongoose';
const noteAssetSchema = new Schema(
  {
    id: { type: String, required: true },
    originalFilename: { type: String, required: true },
    storagePublicId: { type: String, required: true },
    storageResourceType: { type: String, enum: ['raw', 'image'], required: true },
    mimeType: { type: String, required: true },
    fileSize: { type: Number, required: true },
    uploadIndex: { type: Number, required: true },
    confirmedPosition: { type: Number, default: null },
    inputVersion: { type: Number, default: 1 },
    extractionStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending',
    },
    extractedText: { type: String, default: null },
    extractionWarnings: { type: [String], default: [] },
    usedVision: { type: Boolean, default: false },
  },
  { _id: false },
);
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
    // Old single-file documents have no assets field and keep their existing visibility policy.
    assets: { type: [noteAssetSchema], default: undefined },
    submissionKey: { type: String, default: undefined },
    submissionDigest: { type: String, default: undefined, select: false },
    publicationStatus: {
      type: String,
      enum: ['draft', 'published'],
      default: 'draft',
      index: true,
    },
    publishedAt: { type: Date, default: null },
    orderConfirmedAt: { type: Date, default: null },
    aiPageOrder: { type: Schema.Types.Mixed, default: null },
    orderAttemptId: { type: String, default: null, select: false },
    orderExpiresAt: { type: Date, default: null },
    processingStage: { type: String, default: 'upload' },
    processingEvents: {
      type: [{ step: String, status: String, at: Date, message: String }],
      default: [],
    },
    studySummary: { type: String, default: '' },
    aiStudySummary: { type: String, default: '' },
    summarySources: {
      type: [{ text: String, sourceAssetId: String, excerpt: String }],
      default: [],
    },
    summaryAttemptId: { type: String, default: null, select: false },
    summaryExpiresAt: { type: Date, default: null },
    generatedPdf: { type: Schema.Types.Mixed, default: null },
    pdfGenerationAttemptId: { type: String, default: null, select: false },
    pdfGenerationExpiresAt: { type: Date, default: null },
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
noteSchema.index(
  { uploadedBy: 1, submissionKey: 1 },
  { unique: true, partialFilterExpression: { submissionKey: { $type: 'string' } } },
);
export const Note = mongoose.model('Note', noteSchema);

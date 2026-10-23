import { z } from 'zod';
import type { StoredStudyGateStatus, StudyAssessment } from './phase1Types.js';
export type {
  StudyDecision,
  StudyGateStatus,
  StoredStudyGateStatus,
  StudyCategory,
  StudyAssessment,
  StudyGateResult,
} from './phase1Types.js';
const validDay = (value: string) =>
  !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export const lectureDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(validDay, 'Invalid calendar date');

export const metadataSchema = z.object({
  title: z.string().trim().max(160).optional().default(''),
  subject: z.string().trim().max(100).optional().default(''),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional().default([]),
  instructor: z.string().trim().max(100).optional().default(''),
  lectureDate: lectureDateSchema.nullable().optional(),
  semester: z.string().trim().max(40).optional().default(''),
  description: z.string().trim().max(2000).optional().default(''),
});
export const aiMetadataSchema = z.object({
  title: z.string().trim().min(3).max(160).nullable().default(null),
  category: z.string().trim().max(60).nullable().default(null),
  subject: z.string().trim().max(100).nullable().default(null),
  topics: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  keywords: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  documentType: z.string().trim().max(60).nullable().default(null),
  instructor: z.string().trim().max(100).nullable().default(null),
  lectureDate: lectureDateSchema.nullable().default(null),
  description: z.string().trim().max(2000).nullable().default(null),
  uncertaintyNotes: z.array(z.string().trim().max(300)).max(20).default([]),
});
export type AiMetadata = z.infer<typeof aiMetadataSchema>;
export type ProcessingStatus = 'not_requested' | 'pending' | 'completed' | 'failed';
export type MetadataSource = 'manual' | 'filename' | 'ai_reviewed';
export interface NoteAssetDto {
  id: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  uploadIndex: number;
  confirmedPosition: number | null;
  extractionStatus: 'pending' | 'completed' | 'failed';
  extractionWarnings: string[];
  usedVision: boolean;
  previewUrl: string;
  downloadUrl: string;
}
export interface NoteDto {
  id: string;
  title: string;
  description: string;
  originalFilename: string;
  fileType: string;
  fileSize: number;
  subject: string;
  tags: string[];
  instructor: string;
  lectureDate: string | null;
  semester: string;
  uploadedBy: { id: string; name: string };
  processingStatus: ProcessingStatus;
  studyGateStatus: StoredStudyGateStatus;
  studyAssessment: StudyAssessment | null;
  publicationStatus?: 'draft' | 'published';
  processingStage?: string;
  assets?: NoteAssetDto[];
  aiMetadata?: AiMetadata | null;
  studySummary?: string;
  aiStudySummary?: string;
  summarySources?: Array<{ text: string; sourceAssetId: string; excerpt: string }>;
  generatedPdfUrl?: string | null;
  orderConfirmedAt?: string | null;
  aiPageOrder?: {
    orderedAssetIds: string[];
    reasons: Array<{ assetId: string; reason: string; evidence: string }>;
    uncertainAssetIds: string[];
  } | null;
  reviewRequestedAt: string | null;
  reviewMessage: string;
  metadataSource: MetadataSource;
  upvoteCount: number;
  downvoteCount: number;
  score: number;
  myVote: -1 | 0 | 1;
  createdAt: string;
  updatedAt: string;
  previewUrl: string;
  downloadUrl: string;
}
export interface ApiResponse<T> {
  success: true;
  data: T;
  message: string;
}
export interface ApiError {
  success: false;
  error: { code: string; message: string };
}

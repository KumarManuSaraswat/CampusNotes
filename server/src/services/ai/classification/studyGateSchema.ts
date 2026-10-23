import { z } from 'zod';

const categoryLabels = [
  'Arts',
  'Biology',
  'Business',
  'Chemistry',
  'Computer Science',
  'Economics',
  'Engineering',
  'Health Sciences',
  'Humanities',
  'Languages',
  'Law',
  'Mathematics',
  'Other Academic',
  'Physics',
  'Social Sciences',
] as const;

export const studyAssessmentSchema = z
  .object({
    decision: z.enum(['academic', 'non_academic', 'review']),
    category: z.enum(categoryLabels).nullable(),
    subject: z.string().trim().min(1).max(100).nullable(),
    tags: z.array(z.string().trim().min(1).max(60)).max(8),
    reason: z.string().trim().min(1).max(320),
    evidence: z.array(z.string().trim().min(1).max(160)).max(6),
    warnings: z.array(z.string().trim().min(1).max(240)).max(6),
  })
  .strict()
  .superRefine((assessment, context) => {
    const normalizedTags = assessment.tags.map((tag) => tag.toLowerCase());
    if (new Set(normalizedTags).size !== normalizedTags.length) {
      context.addIssue({ code: 'custom', path: ['tags'], message: 'Tags must be unique.' });
    }

    if (assessment.decision === 'academic') {
      if (!assessment.category)
        context.addIssue({
          code: 'custom',
          path: ['category'],
          message: 'Academic content needs a category.',
        });
      if (!assessment.subject)
        context.addIssue({
          code: 'custom',
          path: ['subject'],
          message: 'Academic content needs a subject.',
        });
      if (assessment.tags.length === 0)
        context.addIssue({
          code: 'custom',
          path: ['tags'],
          message: 'Academic content needs at least one topic tag.',
        });
      if (assessment.evidence.length === 0)
        context.addIssue({
          code: 'custom',
          path: ['evidence'],
          message: 'Academic content needs source evidence.',
        });
    }

    if (assessment.decision === 'non_academic') {
      if (
        assessment.category !== null ||
        assessment.subject !== null ||
        assessment.tags.length > 0
      ) {
        context.addIssue({
          code: 'custom',
          path: ['decision'],
          message: 'Non-academic content must not receive academic metadata.',
        });
      }
      if (assessment.evidence.length === 0)
        context.addIssue({
          code: 'custom',
          path: ['evidence'],
          message: 'Non-academic decisions need source evidence.',
        });
    }

    if (
      assessment.decision === 'review' &&
      (assessment.category !== null || assessment.subject !== null || assessment.tags.length > 0)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['decision'],
        message: 'Uncertain content must not receive inferred academic metadata.',
      });
    }
  });

export type StudyAssessment = z.infer<typeof studyAssessmentSchema>;
export type StudyDecision = StudyAssessment['decision'];

export interface StudyGateSchemaTypes {
  OBJECT: string;
  STRING: string;
  ARRAY: string;
}

/** Gemini's structured-output schema for the classification response. */
export function createGeminiStudyAssessmentSchema(types: StudyGateSchemaTypes) {
  return {
    type: types.OBJECT,
    properties: {
      decision: {
        type: types.STRING,
        enum: ['academic', 'non_academic', 'review'],
      },
      category: { type: types.STRING, nullable: true, enum: [...categoryLabels] },
      subject: { type: types.STRING, nullable: true },
      tags: { type: types.ARRAY, items: { type: types.STRING }, maxItems: 8 },
      reason: { type: types.STRING },
      evidence: { type: types.ARRAY, items: { type: types.STRING }, maxItems: 6 },
      warnings: { type: types.ARRAY, items: { type: types.STRING }, maxItems: 6 },
    },
    required: ['decision', 'category', 'subject', 'tags', 'reason', 'evidence', 'warnings'],
  };
}

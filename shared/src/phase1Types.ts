/** Public Phase 1 contract. Provider prompts and extracted document text never belong here. */
export type StudyDecision = 'academic' | 'non_academic' | 'review';
export type StudyGateStatus = 'pending' | 'approved' | 'rejected' | 'needs_review' | 'failed';
export type StoredStudyGateStatus = StudyGateStatus | 'legacy_unreviewed';
export type StudyCategory =
  | 'Arts'
  | 'Biology'
  | 'Business'
  | 'Chemistry'
  | 'Computer Science'
  | 'Economics'
  | 'Engineering'
  | 'Health Sciences'
  | 'Humanities'
  | 'Languages'
  | 'Law'
  | 'Mathematics'
  | 'Other Academic'
  | 'Physics'
  | 'Social Sciences';

export interface StudyAssessment {
  decision: StudyDecision;
  category: StudyCategory | null;
  subject: string | null;
  tags: string[];
  reason: string;
  evidence: string[];
  warnings: string[];
}

export interface StudyGateResult {
  noteId: string;
  processingStatus: 'not_requested' | 'pending' | 'completed' | 'failed';
  studyGateStatus: StoredStudyGateStatus;
  assessment: StudyAssessment | null;
  reviewRequestedAt?: string | null;
  reviewMessage?: string;
  processingError?: string | null;
}

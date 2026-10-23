import { z } from 'zod';
import { aiMetadataSchema } from '@campusnotes/shared';
export const documentReferenceSchema = z.object({
  noteId: z.string(),
  storagePublicId: z.string(),
  storageProvider: z.string(),
  fileType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
  requestedBy: z.string(),
});
export const extractionResultSchema = z.object({
  text: z.string().nullable(),
  status: z.enum(['completed', 'failed']),
  error: z.string().nullable().default(null),
});
export const metadataSuggestionSchema = aiMetadataSchema;
export type DocumentReference = z.infer<typeof documentReferenceSchema>;
export type ExtractionResult = z.infer<typeof extractionResultSchema>;
export type MetadataSuggestion = z.infer<typeof metadataSuggestionSchema>;
export interface DocumentExtractor {
  extract(reference: DocumentReference): Promise<ExtractionResult>;
}
export interface VisionAnalyzer {
  analyze(reference: DocumentReference): Promise<ExtractionResult>;
}
export interface MetadataClassifier {
  classify(text: string): Promise<MetadataSuggestion>;
}
export interface SemanticSearch {
  search(query: string, limit: number): Promise<string[]>;
}

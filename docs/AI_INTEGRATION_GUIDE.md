# AI integration guide

The app currently performs no AI analysis. All notes start at `not_requested`. The disabled UI option and 501 endpoint are intentional. Shared suggestion fields are in `shared/src/index.ts`; service interfaces are in `server/src/services/ai/contracts.ts`. Validate every future provider output with `aiMetadataSchema` before persistence. Never copy a suggestion into a manual field without student review.

## Module A — Document intelligence

Place extraction code in `server/src/services/ai/document/`. Input: `DocumentReference` (note ID, Cloudinary object reference, file type, requesting user). The service must verify an authorized processing context and retrieve the original through the storage adapter, not trust a client URL. Output: `ExtractionResult` with text or a failure. Store `extractedText`, `processingStatus`, `processingError`, and `lastProcessedAt` on the Note. Future API contract: an authenticated author or moderator requests processing; return pending status, then a separate status read. Run independent tests with a stored fixture and mocked storage adapter. Keep extraction logic out of note routes.

## Module B — Multimodal vision

Place vision code in `server/src/services/ai/vision/`. Input and permissions match `DocumentReference`. Output is interpreted text in `ExtractionResult`; unknown content stays null. A future worker may choose vision for images or scanned PDFs. Persist only validated text and status fields. The future endpoint must authorize the note owner or moderator. Test image fixtures and provider failures with a mocked model client. Do not alter upload or file delivery code.

## Module C — Metadata classification

Place classification code in `server/src/services/ai/classification/`. Input: extracted text from A or B. Output: `MetadataSuggestion` (`subject`, `topics`, `keywords`, `documentType`, `instructor`, `lectureDate`, `description`, `uncertaintyNotes`) validated by Zod. Unknowns remain null or empty, with no confidence percentages. Store the result in `aiMetadata`; leave `title`, `subject`, `tags`, `instructor`, `lectureDate`, and `description` untouched until an author reviews a future suggestion UI. After approval, update selected manual fields, `metadataSource: ai_reviewed`, and the normal text index. Provider failures set `processingStatus: failed` and a safe `processingError`. A future authenticated suggestion and approval API belongs beside the existing note routes. Test validation, conflicts with manual values, and explicit approval separately.

## Module D — Semantic search

Place retrieval code in `server/src/services/ai/search/`. Input: query string and limit. Output: ordered note IDs through `SemanticSearch`. Add an explicit future search strategy parameter to `/api/notes`; preserve MongoDB keyword search as the default and fallback. Enforce visibility checks before returning records. Embeddings and vector storage belong in the module, not in the Note controller. Test with fake vector results and real MongoDB keyword fallback. Search reads are public only for published notes.

Each module should own its provider dependencies and environment configuration. Do not make optional AI credentials a startup requirement for the rest of CampusNotes.

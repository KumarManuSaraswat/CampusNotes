# AI processing pipeline

## Stages and contracts

`POST /api/notes` returns an array with one `NoteDto` for compatibility with the upload client. The multipart request uses `files` and optional metadata plus a UUID `submissionKey`. A repeated key with the same file bytes and metadata returns the saved note. Reusing the key for different content returns `SUBMISSION_CONFLICT`.

`POST /api/notes/:id/ai-process` is owner-only. A call processes one pending asset, screens all completed text, or generates metadata. It returns `StudyGateResult` with `processingStatus`, `processingStage`, screening status and assessment. The browser repeats the call while status is pending. The database attempt ID and input version stop overlapping or stale results from being saved. A failed asset can be retried without re-reading completed assets. No background promise survives a successful HTTP response.

Digital PDF text comes from `prepareDocument`. Images and scanned PDFs go through `extractVisualText`. Any incomplete transcription warning holds the note for review. `assessStudyContent` validates its model output and keeps provider failures separate from non-academic decisions. A successful academic decision opens metadata generation. If metadata generation fails, screening remains approved and the student can enter fields manually.

`POST /api/notes/:id/suggest-order` returns a validated exact permutation with evidence; it never changes confirmed positions. `POST /api/notes/:id/confirm-order` takes `{orderedAssetIds: string[]}` and writes the student's exact order. `POST /api/notes/:id/generate-pdf` requires that order and verifies the uploaded output by reading it back. `POST /api/notes/:id/generate-summary` accepts only bullets with valid asset IDs and excerpts found in extracted source text. The owner edits the final summary via the review route.

## Review and publication

- `GET /api/notes/:id/processing-status`: owner processing result; `/ai-status` remains available.
- `GET /api/notes/:id/ai-report`: owner processing facts and events.
- `PATCH /api/notes/:id/review`: metadata and optional `studySummary` edits.
- `POST /api/notes/:id/publish`: requires approved screening, completed processing, title, subject, complete page order, original storage readback, and three explicit confirmation flags. A multi-image note without a PDF also requires `acknowledgeNoPdf: true`.
- `GET /api/notes/:id/assets/:assetId/file`: authorized original bytes.
- `GET /api/notes/:id/generated-pdf`: authorized generated PDF bytes.
- `GET /api/notes/:id/matching-requests`: owner-only simple subject/topic matches against open requests. Matching never fulfills automatically.
- `PATCH /api/requests/:id/fulfill`: existing atomic endpoint, now reached from the review/detail workflows only after publication.

AI calls use `GEMINI_API_KEY` and `GEMINI_MODEL` on the server. The existing study gate and vision modules retain their bounded provider calls. The orchestration processes one stage per request and has an application concurrency cap from `AI_MAX_CONCURRENT`. The PDF, order, and summary routes use database leases to reject overlapping calls. In a deployment, request timeouts must exceed each bounded stage and the browser may resume after interruption.

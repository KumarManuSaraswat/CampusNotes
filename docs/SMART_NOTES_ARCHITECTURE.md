# Smart Notes architecture

## Data flow

An authenticated upload creates one `Note` draft. One PDF or up to ten JPG/PNG images may belong to it. Each original is kept as an authenticated Cloudinary object and referenced by a stable asset UUID. The first asset also fills the old single-file fields so older code and notes remain readable.

The browser calls `POST /api/notes/:id/ai-process` until `processingStatus` stops being `pending`. Each call handles one durable stage: one unread asset, academic screening, or metadata suggestions. `prepareDocument` extracts digital PDF text or routes visual input to `extractVisualText`; `assessStudyContent` makes the academic decision. Suggestions never change approved fields automatically. See [AI_PROCESSING_PIPELINE.md](./AI_PROCESSING_PIPELINE.md).

The owner can review metadata and summary, confirm an exact page order, generate a PDF, and explicitly publish. Public routes use `studyGateStatus: approved` plus `publicationStatus: published`. Existing approved records with no `assets` field retain their prior public visibility. All new grouped records have `assets` and start as private drafts. Rejected, uncertain, pending, and failed records remain owner-only, with the existing requested moderator review exception.

## Note fields

- `assets[]`: UUID, original filename, authenticated storage reference, MIME, size, upload index, confirmed position, input version, extraction result, warnings, and whether vision was used.
- `studyGateStatus` and `studyAssessment`: validated academic screening result.
- `processingStatus`, `processingStage`, `studyGateInputVersion`, attempt lease, and `processingEvents`: resumable processing and stale-result protection.
- `aiMetadata`: original suggestion. `title`, `subject`, `tags`, and other ordinary Note fields hold student-approved values.
- `aiPageOrder`: unconfirmed suggestion. `confirmedPosition` and `orderConfirmedAt` hold the student's decision.
- `aiStudySummary`, `summarySources`: grounded suggestion and source excerpts. `studySummary` holds the editable version.
- `generatedPdf`: protected Cloudinary reference; set only after readback and PDF page-count verification.
- `publicationStatus`, `publishedAt`: author publication gate.
- `submissionKey`, `submissionDigest`: idempotent upload retry, unique per owner and request key.

No destructive migration is performed. Existing notes without `assets` continue to use their original file route and prior approved visibility. New uploads are drafts even after AI approval.

## Modules reused

The integration calls the existing document preparation, Gemini vision, study gate, and shared Phase 1 contracts. Metadata, order, and summary use small additional Gemini functions. `pdf-lib` is used only for combined PDFs.

## Limits

Supported input is JPG, PNG, or PDF; a submission contains one PDF or up to ten images. Each file is capped at 10 MiB or lower if `MAX_FILE_MB` is lower; a submission is capped at 30 MiB. Document preparation limits PDFs to 40 pages during processing. Combined PDFs have a 35 MiB output cap. Large, rotated, low-resolution, and complex handwritten pages may need manual review. The PDF composer fits pages without cropping but does not yet normalize all camera EXIF orientations.

# Member 1 handoff: document preparation

## What is implemented

`server/src/services/ai/document/prepareDocument.ts` exposes a byte-based document router.
It extracts typed PDF text with Mozilla PDF.js and returns `vision_required` for JPG/PNG,
blank/sparse PDFs, PDFs containing raster images, or text with undecodable glyphs.
Any sparse page sends the **whole** PDF to vision; readable pages are never silently used
as a complete representation of a partly scanned document. Text results preserve PDF page
order and add `[Page N]` markers. Whitespace is normalized without executing document instructions.

The public contract is in `document/documentTypes.ts`, also exported from `phase1Types.ts`.
Existing `contracts.ts`, vision and classifier code are unchanged. The older `DocumentExtractor`
interface cannot represent a vision-routing outcome, so the integrator should use this new API
rather than reporting routing as a failed extraction or a completed empty extraction.

```ts
import { prepareDocument, DocumentPreparationError } from './services/ai/document/prepareDocument.js';
import { extractVisualText } from './services/ai/vision/visionAnalyzer.js';
import { assessStudyContent } from './services/ai/classification/studyGate.js';

// In the future owner-authorized orchestration function, after storage.read(...):
const prepared = await prepareDocument({ bytes, mimeType });
const extracted = prepared.status === 'vision_required'
  ? await extractVisualText({ bytes, mimeType })
  : { text: prepared.text, warnings: [] };
const warnings = [...prepared.warnings, ...extracted.warnings];
// Carry warnings forward. Incomplete/uncertain transcription must stay needs_review.
const assessment = await assessStudyContent({ extractedText: extracted.text ?? '' });
// Validate + persist in the integrator, never in this module.
```

This snippet illustrates the module calls, not a complete processing endpoint. Routing warnings
that vision resolves differ from remaining transcription-quality warnings; do not automatically
approve partial or truncated transcription. `DocumentPreparationError`, `VisionError`, and
`StudyGateError` mean a failed processing attempt, never a nonacademic rejection.

## Parser and runtime

`pdfjs-dist` is installed in the server workspace and pinned by the root lockfile. Version
6.4.299 requires Node **22.13+ or 24+**; this change was developed with Node 24.11.1.
Use a compatible deployment runtime. No Gemini credentials are needed to prepare documents.
The implementation follows Mozilla's [Node text extraction example](https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.mjs)
and [PDF.js API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html).

PDF parsing runs inside a dedicated Node worker. The parent enforces a wall-clock deadline,
terminates the worker on completion/error/timeout, and waits for termination before returning.
This also stops CPU-bound parsing, unlike merely racing an in-process promise against a timer.
Worker input uses a copy of the upload, so PDF.js cannot detach or modify the stored original.
The worker source is bundled as a static JavaScript string inside a TypeScript module; input
bytes are passed only through `workerData`, never interpolated into executable source. This
works with both development `tsx` and compiled `dist` without copying separate worker files.

PDF.js receives bytes, never an external URL. Dynamic evaluation and system-font use are disabled,
and parser errors stop extraction. Worker heap limits are 128 MiB old generation and 32 MiB young
generation; these do not bound native/external allocation or aggregate memory across requests.
The integration owner must still enforce per-user/global concurrency and request rate limits.

| Option | Default | Allowed range |
| --- | --- | --- |
| `maxBytes` | 10 MiB | 1 byte–14 MiB |
| `maxPages` | 40 | 1–100 |
| `maxTextChars` | 100,000 | 1–500,000 |
| `timeoutMs` | 15,000 | 1–120,000 |

Options are validated as integers. The default text cap matches Member 3's default input cap.
The size cap matches existing uploads. Pass server runtime settings as options during integration;
no required environment variables or unrelated startup changes are introduced.
Limits produce typed errors, not truncated success. Image routing validates the signature and MIME;
it does not claim to fully decode or verify image integrity. Vision owns actual image reading.

## Outcomes and errors

| Outcome | Caller action |
| --- | --- |
| `text` | Use `text` for classification; retain manual metadata separately |
| `vision_required` | Send original bytes to Member 2, retain warnings; no partial text is returned |
| Blank/unreadable after vision | Conservative REVIEW path, not rejection |
| `INVALID_INPUT`, `UNSUPPORTED_MIME`, `MIME_MISMATCH` | Failed preparation / fix input |
| `MALFORMED_DOCUMENT`, `PASSWORD_REQUIRED` | Failed preparation / replace or unlock PDF |
| `FILE_TOO_LARGE`, `PAGE_LIMIT`, `TEXT_LIMIT` | Failed preparation / split or reduce document |
| `TIMEOUT`, `PARSER_UNAVAILABLE`, `PARSER_FAILED` | Retryable failed preparation; retain original |
| `INVALID_OPTIONS` | Fix server configuration |

Errors expose a safe `code`, `message`, and `retryable`; raw parser errors are not surfaced.
The module performs no storage reads, network model calls, database writes, authorization,
publication, academic classification, or metadata inference. The caller must authenticate and
authorize before loading bytes and must enforce visibility independently of processing status.

## Evaluation and remaining integration work

Tests generate small team-owned PDFs with actual object offsets and invoke the real PDF.js
worker. They cover typed and multipage text, original-byte preservation, scanned/mixed/blank
pages, raster content alongside text, image routing, prompt-like text preservation, MIME spoofing,
damaged/truncated files, password challenges, size/page/text limits, invalid limits, hard timeout
and a subsequent successful retry, and concurrent independent inputs. The password fixture is a
synthetic standard-security dictionary that exercises the password challenge, not a real user's file.

These are software tests, not evidence of classifier accuracy. No live Gemini or Cloudinary calls
are made. Complex columns, vector-only diagrams, form/annotation content and reading order remain
PDF extraction limitations; the 40-character threshold is a conservative routing heuristic, not a
confidence score. Raster images (including logos) intentionally route to vision at extra provider cost.

All three backend modules are now present for the separate integration PR. That PR still needs
the owner-authorized pipeline, atomic attempt/version handling, persisted safe states, approved-only
access checks, Upload panel wiring, real review feedback, migration, and live two-account checks.
The earlier evaluation document's missing-module observation describes its original base commit;
this PR supplies that missing dependency without claiming those integration tasks are finished.

## Validation on 24 October 2026

- 28 document tests pass against the real installed PDF.js parser.
- All 66 AI service tests pass together (document, vision, classification and shared contract).
- Root typecheck, lint and production build pass. Server build/lint and document tests were
  repeated after isolating worker command-line flags.
- Compiled `server/dist` worker smoke test passes under Node 24.11.1, including a parent
  started with `--input-type=module`; worker execution does not inherit incompatible loaders.
- The full API/client suites were not repeated: the previous run on this same application
  base found an unavailable local `mongod` and a stale Upload validation-message assertion.
  Neither application path is changed by this PR. Live provider/storage checks remain outstanding.

# Phase 1 — Member 2: Gemini multimodal vision

## Overview

This module transcribes visible content from JPEG images, PNG images, and small scanned PDFs. It does not decide whether a document is academic, classify a subject, reject content, persist output, or access a note's storage itself. Unrelated documents such as receipts are transcribed too; relevance belongs to Member 3.

## Architecture

```text
authorized integration loader (injected by caller)
                │ supplies Buffer + MIME
                ▼
visionAnalyzer.ts ── validates bytes, size, MIME, PDF markers
                │ normalizes output, warnings, typed errors
                ▼
geminiVisionClient.ts ── base64 inlineData + @google/genai SDK
```

The provider client accepts a narrow request and can be replaced with a fake `GeminiVisionClient`. The SDK is lazy-loaded so importing the CampusNotes server does not require Gemini credentials or the package. The integration owner must add the dependency before making a real call:

```bash
npm install @google/genai -w server
```

No package manifest or lockfile was changed for this work, per the ownership boundary.

The request shape follows Google's official [JavaScript SDK](https://github.com/googleapis/js-genai) and [GenerateContent image input guide](https://ai.google.dev/gemini-api/docs/generate-content/image-understanding). Google documents native PDF input in its [document understanding guide](https://ai.google.dev/gemini-api/docs/document-processing).

## Supported formats and size

- `image/jpeg`
- `image/png`
- `application/pdf` (inline PDF input for small scanned or visual PDFs)

The processing size defaults to 10 MiB and can be set with `VISION_MAX_FILE_MB` from 1 to 14. The 14 MiB ceiling leaves room for base64 expansion plus the prompt within the GenerateContent inline request guidance. The module checks the actual file signature using the existing `file-type` dependency. PDFs must have a recognizable PDF header and `%%EOF` marker; this is a sanity check, not a full PDF parser. The original bytes are never modified. Gemini receives a base64 representation in the SDK's `inlineData` part. Base64 expands the in-memory request size, so the input bound is enforced before conversion.

## Public function and contract adapter

Preferred byte-based API:

```ts
import { extractVisualText } from './services/ai/vision/visionAnalyzer.js';

const result = await extractVisualText({ bytes, mimeType: 'image/jpeg' });
// { text: string | null, warnings: string[] }
```

`extractVisualText` throws a typed `VisionError` for invalid input, missing configuration, and provider failures. Blank or unreadable-only results return `text: null` and a warning; partially unreadable output retains the model's `[unreadable]` marker.

The existing frozen `VisionAnalyzer` interface accepts a `DocumentReference`, not bytes, and its `ExtractionResult` has no `warnings` field. The compatible adapter uses an injected authorized loader and adds `warnings` as an additive result field:

```ts
import { createVisionAnalyzer } from './services/ai/vision/visionAnalyzer.js';

const visionAnalyzer = createVisionAnalyzer(async (reference) => {
  // Member 4 must authorize reference.requestedBy and load the asset through
  // the existing storage adapter. Never use a client-supplied URL here.
  return authorizedStorageLoader(reference);
});
const extraction = await visionAnalyzer.analyze(documentReference);
// ExtractionResult-compatible: { text, status, error, warnings }
```

The adapter does not authorize the user itself; its injected loader must enforce the future endpoint's uploader/moderator rule. It performs no database writes. Adapter failures become `{text:null,status:'failed',error:<safe code>,warnings:[]}`. Prefer the byte-based API when warnings must remain visible to downstream integration.

## Model configuration

Set these server-only variables:

```env
GEMINI_API_KEY=your-server-side-key
GEMINI_MODEL=your-enabled-model-id
```

The model ID is deliberately not hardcoded. `VISION_TIMEOUT_MS` optionally sets a request timeout from 1,000 to 120,000 ms (default 30,000 ms). Gemini configuration is read at call time; the rest of the app can start without it. Do not put the API key in the frontend or log it.

The SDK uses `models.generateContent` with inline image/PDF data and a configured HTTP timeout. It performs at most one attempt itself; the analyzer makes at most one additional retry for timeout, throttling, or transient provider unavailability. The small retry delay is bounded. Application-level concurrency and request-rate limits remain the integration owner's responsibility; the existing Express rate limiter should be reviewed when this is wired into a route or worker.

## Prompt design

The system instruction asks for faithful transcription, reading order, page labels, visible headings, technical terms, syntax, and legible equations. It asks Gemini to use `[unreadable]` instead of guessing and explicitly says not to explain, summarize, categorize, or assess academic relevance. Text embedded in an uploaded document is treated as document content, not as a new instruction. This reduces prompt-injection risk but cannot guarantee that a generative model will always obey it.

The model output cap is 8,192 tokens. If Gemini reports `MAX_TOKENS`, the result includes an incomplete-transcription warning; the module does not silently slice text and call it complete.

## Error handling

`VisionError` includes a stable `code`, safe message, and `retryable` flag. Provider details and response bodies are not included in the thrown error or logged; only status/code indicators are used to select a safe category.

| Code                                                                                         | Retryable | Meaning                                                   |
| -------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------- |
| `INVALID_INPUT`, `UNSUPPORTED_MIME`, `MIME_MISMATCH`, `MALFORMED_DOCUMENT`, `FILE_TOO_LARGE` | No        | Input validation failed.                                  |
| `CONFIG_MISSING`, `CONFIG_INVALID`, `SDK_MISSING`, `SOURCE_UNAVAILABLE`                      | No        | Server setup, source loader, or dependency is incomplete. |
| `MODEL_UNAVAILABLE`, `PROVIDER_AUTH`, `PROVIDER_BLOCKED`                                     | No        | Model, credential, or provider safety issue.              |
| `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `TIMEOUT`                                            | Yes       | A single bounded retry is attempted.                      |
| `PROVIDER_ERROR`, `MALFORMED_RESPONSE`                                                       | No        | Non-transient provider or response issue.                 |

The frozen contract's `ExtractionResult.error` cannot represent a warning separately. The adapter therefore adds `warnings` without changing shared types; integration code typed only as `VisionAnalyzer` will not see that additive property. Member 4 should use `extractVisualText` directly or coordinate a future shared contract extension if warning propagation is required end-to-end.

## Tests and observed results

Unit tests mock the provider; they consume no Gemini quota. They cover JPEG/PNG/PDF input, PDF inline MIME, heading and whitespace preservation, unreadable markers, blank responses, invalid/oversize/mismatched data, configuration, malformed output, rate limits, timeouts, transient and permanent provider errors, token-limit warnings, non-academic transcription, adapter behavior, and SDK request construction.

Observed locally: the focused Vitest suite passes **29 tests**; repo-wide typecheck, lint, and production build pass without installing the SDK. These tests prove validation and error-handling behavior, not handwriting accuracy or live Gemini access. A real provider smoke test was not run because `@google/genai` and Gemini credentials are absent.

## Real provider smoke test

After the integration owner installs the SDK and sets `GEMINI_API_KEY` and `GEMINI_MODEL`, use non-confidential sample files. From the repository root, run a one-off TypeScript eval (replace the sample path and MIME):

```bash
GEMINI_API_KEY='…' GEMINI_MODEL='…' node --import tsx --input-type=module -e '
  import { readFile } from "node:fs/promises";
  import { extractVisualText } from "./server/src/services/ai/vision/visionAnalyzer.ts";
  const path = process.argv[1];
  const mimeType = process.argv[2];
  if (!path || !mimeType) throw new Error("Pass a sample path and MIME type");
  const bytes = await readFile(path);
  console.log(await extractVisualText({ bytes, mimeType }));
' -- ./sample.jpg image/jpeg
```

Run separately with: (A) a non-confidential handwritten Java page (`image/jpeg` or `image/png`), (B) a small scanned PDF (`application/pdf`), (C) a receipt to verify transcription without rejection, (D) a blank page, and (E) partly unreadable handwriting. Record whether readable text, `[unreadable]`, blank-page warnings, and page labels are appropriate. Do not report smoke-test success until these actual calls have completed. Never use private student documents for this check.

## Learning notes

- **Multimodal AI:** the same model receives both instruction text and visual bytes, so it can use layout and handwriting context rather than only extracted characters.
- **OCR vs generative transcription:** traditional OCR focuses on character recognition and often returns boxes/confidence; a multimodal generative model can interpret handwriting, layout, and equations, but may hallucinate. The explicit unreadable marker and human review are important safeguards.
- **Buffer, base64, MIME:** the server receives bytes in a Node `Buffer`; base64 encodes those bytes for the SDK JSON part, while the MIME label tells Gemini how to decode them. A mismatch can make valid bytes look like the wrong format, so the implementation checks both declaration and signature first.
- **Prompt engineering:** instructions constrain this module to transcription and prohibit classification. They improve consistency but are not a correctness guarantee.
- **Provider SDK and model choice:** `@google/genai` wraps Google's API and manages request construction. The model string is configuration so deployment can choose an available model without source edits.
- **Output limits and hallucinations:** long responses can end at a token cap; the finish reason becomes a warning. A model can still omit or misread text, so transcription should remain reviewable.
- **Dependency injection:** tests supply a small fake client, which makes behavior deterministic and avoids API quota while preserving a real SDK adapter in production.
- **Retries and quota:** retry only transient errors once. Retrying invalid credentials or malformed input wastes quota; app-level concurrency and rate limiting still belong at the route/worker boundary.

## Known limitations

- No real model call has been tested here. Model availability, account quota, billing, and SDK runtime compatibility must be verified after dependency installation.
- Handwritten text, low-resolution scans, rotation, complex tables, diagrams, and equations can be misread or omitted. `[unreadable]` is model-reported, not a calibrated confidence score.
- Inline PDF input is intended for small documents (10 MiB default, at most 20 MiB here). Very large PDFs should be rejected or routed by the integration pipeline to Member 1 / a future chunked workflow.
- The service does not render PDF pages itself and cannot guarantee that Gemini inspected every page. Page labels are prompt guidance; the model may omit pages. Token-limit completion is flagged when the provider reports it.
- No batch queue or service-level concurrency limiter is included. The integration layer must bound simultaneous calls and align its timeout with its worker/request lifecycle.
- The adapter requires a trusted loader and does not itself perform user authorization or storage access.

## Integration handoff

Member 1 can decide whether a PDF already has extractable text and only send scanned/visual documents here. Member 4 should retrieve authorized bytes through the current storage adapter, call `extractVisualText({bytes,mimeType})`, and pass text plus warnings to Member 3. On a `VisionError`, preserve the original upload and represent processing failure/review; never treat the error as a non-academic decision. Keep screening-pending notes out of public discovery in the integration layer. This module does not write MongoDB or alter upload/publication behavior.

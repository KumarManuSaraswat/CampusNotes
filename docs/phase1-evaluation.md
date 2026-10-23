# Phase 1 evaluation and Member 4 handoff

## Scope and integration dependency

This PR supplies the isolated review panel, API wrapper, shared assessment/status contract,
and evaluation fixtures. It does not activate screening or change publication permissions.
At base commit `90d6447`, Member 2 vision and Member 3 classification are merged, but
`server/src/services/ai/document/` and `prepareDocument` are absent. Member 1's merged
PR implements multiple-file upload instead. The assignment requires the three backend
modules to be ready before a separate `feat/phase1-integrate` PR edits shared application paths.
Existing uploads remain subject to existing application behavior until that PR lands.

## Component and API handoff

- Import `StudyGatePanel` from `client/src/components/ai/StudyGatePanel`.
- Supply `status`, `assessment`, and optional `onRetry` / `onRequestReview` callbacks.
- The component performs no requests or state transitions. Only supply a review callback
  after implementing a real owner-authenticated feedback workflow. A click is not approval.
- `processStudyNote(id, signal?)` and `getStudyGateStatus(id, signal?)` use the existing
  credentialed `api()` transport. They throw safe `StudyGateApiError` messages, preserving
  cancellation. A request/network failure is not a classification or a persisted status.
- Wire types live in `shared/src/phase1Types.ts`, exported from the shared package and
  re-exported at `server/src/services/ai/phase1Types.ts`. Member 3 compatibility is checked
  at compile time. Existing extraction contracts and module implementations are unchanged.
- `legacy_unreviewed` is a stored status, not an approval. Integration must explicitly
  map it to a private owner view explaining that analysis has not run.

## Held-out test materials

All text below is newly authored synthetic material for this task. Do not use these
examples for prompt tuning before evaluation. Save typed examples as PDFs and handwriting
as team-written JPG/PNG images for the real pipeline run. Text alone does not test parsing.
For error cases use generated test buffers and mocked providers, never personal documents.

| ID | Label | Material / reproducible input | Expected |
| --- | --- | --- | --- |
| A1 | Academic, CS | Stack exercise: push(3), push(7), pop() returns 7. Explain why last-in-first-out differs from a queue. | academic |
| A2 | Academic, mathematics | Differentiate f(x)=3x²+2x. Using the power rule gives f′(x)=6x+2. Find the tangent slope at x=2. | academic |
| A3 | Academic, biology | Osmosis is movement of water across a selectively permeable membrane. Compare plant cells in hypotonic and hypertonic solutions. | academic |
| A4 | Academic, history | Seminar question: compare primary and secondary sources when studying the Industrial Revolution. Explain one limitation of factory records. | academic |
| N1 | Nonacademic | Corner Shop receipt. Soap 40. Bread 30. Total paid 70. Thank you for shopping. | non_academic |
| N2 | Nonacademic | Weekend sale! Buy two cushions, get one free. Shop today. Delivery included. | non_academic |
| N3 | Nonacademic | Team-created photo of an empty garden, without text, diagrams or classroom context. | non_academic or review if transcription has no usable text |
| U1 | Ambiguous | Monday: cells, transport, bring sheet. Tuesday: revise? | review |
| U2 | Ambiguous | Worksheet: analyze this advertisement's persuasive language. Weekend sale! Buy two cushions, get one free. | academic or review; never confidently reject |
| U3 | Ambiguous | Team-written blurred page where only “x”, “result” and “chapter” remain legible. | review |
| E1 | File error | Empty buffer submitted to document preparation. | typed failure; retained persisted original if one exists |
| E2 | Parser error | PDF header and EOF markers with damaged internal structure. | failed; never non_academic |
| E3 | Provider error | Mock Gemini timeout or HTTP 429 during transcription/classification. | failed and retryable; original retained |
| E4 | Blank text | Valid all-white page with no readable text. | review; never confident rejection |

## Outcome ledger

No live evaluation has been run. All 14 cases are **not run**, observed decision **unknown**,
latency **not measured**, and false accept / false reject **not determined**. Unit tests
verify software behavior; they are not evidence of classifier accuracy.

| Metric | Result |
| --- | --- |
| Academic correctly accepted | Not measured |
| Nonacademic correctly rejected | Not measured |
| False rejection (academic → non_academic) | Not measured |
| False acceptance (nonacademic → academic) | Not measured |
| Uncertain → REVIEW | Not measured |
| Processing failures | Not measured |
| Unknown / not run | 14 |
| Mean / P95 latency | Not measured |

For each run record ID, fixture format, model identifier, prompt/commit version, date,
expected label, observed decision, gate status, elapsed milliseconds and safe error code.
Start the timer before storage read and stop after persistence. Keep raw document text
and credentials out of logs. Count ambiguous allowed outcomes separately from strict
academic/nonacademic examples. Report counts and individual latencies for this small sample;
do not claim reliable accuracy percentages or P95 from hand-picked successes.

## Dedicated integration PR checklist

1. Obtain Member 1's tested `prepareDocument` module and agree its result contract.
2. Add optional provider config and install SDK/parser dependencies once. Preserve batch upload.
3. Add gate fields independently of job progress; explicitly mark legacy records unreviewed.
   Missing or unknown gate statuses must fail closed in database queries and direct access checks.
4. Persist originals first. Atomically claim owner-authorized attempts with an input version,
   attempt identifier, and expiry. Reject concurrent attempts; discard stale completion writes.
   Await processing in the request; record timeout/failure safely and allow recovery after crashes.
5. Read authorized storage bytes, prepare text, transcribe when required, assess, validate,
   and atomically persist. Preserve extraction warnings; uncertain/partial text needs review.
   Map StudyGateError to failed, never rejected. Keep provider internals out of DTOs.
6. Replace the 501 route and add owner-only status and real review-request handling.
7. Centralize approved-only public access across discovery, note detail, files, requests,
   voting, reporting and reputation. Owners can inspect private uploads. Test anonymous,
   owner and second-account access for every status, including legacy/missing values.
8. Connect the existing Upload page to this panel per uploaded note. Retain manual metadata,
   handle partial batch processing failures and retries without uploading duplicate originals.
   Only publish after approval. Keep suggested metadata distinct until user acceptance.
9. Run root typecheck/lint/test/build, mocked pipeline and concurrency tests, then real Gemini
   and authenticated Cloudinary reads with team credentials. Verify storage itself cannot bypass
   the application gate. Deploy backend config first, then frontend, and test two accounts.
10. Demo a typed PDF, handwritten math image, receipt and ambiguous document. Record the ledger.

Live Gemini, live Cloudinary, deployment, public/private access and human-review persistence
are integration acceptance checks, not capabilities completed by this isolated UI PR.

## Validation on 24 October 2026

- Root `npm run typecheck`, `npm run lint`, and `npm run build`: passed.
- New panel tests: 11 passed; new API wrapper tests: 11 passed; shared/classifier type
  compatibility test: passed. Existing classifier (8) and vision (29) tests also passed.
- Root `npm test`: blocked by the existing API suite, which requires a `mongod` executable
  unavailable in this environment (`mongod did not start`).
- Client suite run separately: 26 passed, 1 existing failure in `Upload.test.tsx`.
  That test expects “Choose a PDF, JPG, or PNG file.” while the merged batch-upload page
  returns “notes.txt is not a PDF, JPG, JPEG, or PNG file.” Neither file is changed here.
- No live-provider, browser layout, deployment or storage-access verification was performed.

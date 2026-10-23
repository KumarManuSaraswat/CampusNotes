# AI Processing Report

The owner retrieves the report at `GET /api/notes/:id/ai-report`. It is built from saved asset states, the validated screening result, generated output references, and backend processing events. The model never supplies the action history.

The report gives the file count, each file's MIME, read status, vision use and warnings; the screening decision and evidence; whether metadata was suggested; whether order was confirmed; and whether the PDF and summary are actually ready. Events distinguish completed, suggested, and failed steps. For example, a page order event is recorded as `suggested` until the author confirms an order. A PDF is reported ready only after a valid Cloudinary readback.

The report is private to the uploader. It does not expose storage IDs, API keys, or extracted source text. Student-approved metadata and summary are shown on the review page separately from AI suggestions. A manual moderator decision is visible through the existing review feedback and screening status.

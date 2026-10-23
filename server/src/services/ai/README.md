# AI integration boundary

No AI implementation runs in this directory. `contracts.ts` defines the inputs and validated outputs for the four future modules. See `docs/AI_INTEGRATION_GUIDE.md` before adding a provider. Uploaded notes begin with `processingStatus: not_requested`; `/api/notes/:id/ai-process` returns HTTP 501 and `AI_NOT_CONFIGURED`.

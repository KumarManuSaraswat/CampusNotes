# Integrated study workspace

This change connects document preparation, vision extraction, classification, owner controls and moderator review. New uploads remain private until approved. Provider failures are failed processing attempts, never non-academic decisions. Manual metadata stays intact until the owner chooses to apply suggested subject and topics.

## Deployment

Deploy the server and shared contract before the client. Use Node 22.13+ (Node 24 used for validation). MongoDB must support transactions (Atlas or a replica set).

Set server-only `AI_ENABLED=true`, `GEMINI_API_KEY`, and `GEMINI_MODEL` to a model available to your account. Never put these secrets in a VITE variable. `AI_MAX_CONCURRENT` defaults to 2 per server instance, with one active attempt per user per instance. Database claims prevent overlapping attempts on the same note across instances. This is a synchronous bounded pipeline, not a durable background queue. Expired attempts become retryable failures when their owner refreshes status. A future multi-instance deployment should add a distributed provider quota.

With AI disabled or missing configuration, originals are retained privately and owners can request human review. Moderators cannot approve their own uploads. Do a live Gemini and authenticated Cloudinary smoke test in your deployment before the demo; local automated tests mock those providers.

## Existing notes

Old records without a study gate status are treated as `legacy_unreviewed`, even without a database migration. They disappear from public discovery and contribution counts until checked or reviewed. Owners can still open their originals from My uploads. Do not bulk approve legacy documents. No production data migration is run by this change.

## Added features

- Purple sidebar workspace, redesigned overview, upload guide, responsive cards and navigation.
- Account-specific saved notes, subject and format filters, grid/list discovery.
- Upload results, retry without reuploading, explicit suggestion application and status tabs.
- Moderator queue with recorded feedback. Private originals are available only to owners and moderators handling a requested review.

## Validation and local preview

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` from the repository root. API tests start a disposable MongoDB replica set via mongodb-memory-server; its initial run downloads the MongoDB binary. No local database installation is needed.

For synthetic browser QA, run `npx tsx scripts/preview-demo.ts` and start Vite on 127.0.0.1:5174 with `VITE_API_URL=http://127.0.0.1:5000/api`. The preview creates a disposable database, uses in-memory document storage, binds only to loopback, and disables AI. Login: demo@example.test / CampusDemo123. These are public fixture credentials, never a real account. Stop the preview after use. This script must not be used as the production entry point.

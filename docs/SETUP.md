# Setup and deployment

## Local

1. Install Node 22.13+ (or Node 24 LTS) and MongoDB 6+ (a replica set is required for voting transactions). PDF.js needs this Node version.
2. Run `npm install` at the repository root.
3. Copy `.env.example` to `server/.env` and `client/.env.example` to `client/.env`.
4. Set `MONGODB_URI`, a random `JWT_SECRET` of 32+ characters, and Cloudinary cloud name, key, and secret. The AI flag remains `false`.
5. Run `npm run dev`. The client uses port 5173; the API uses port 5000.
6. To seed a demo moderator, two students, and two original PDF notes, set `DEMO_MODERATOR_NAME`, `DEMO_MODERATOR_EMAIL`, `DEMO_MODERATOR_PASSWORD`, and `DEMO_STUDENT_PASSWORD` (passwords 12+ characters), then run `npm run seed`. The script refuses to promote an existing account and skips notes already seeded.

## Deploy

Create a MongoDB Atlas cluster and database user. Allow network access from the Render service. Create a Cloudinary account. The root `render.yaml` defines a Node web service, build/start commands, health path, generated JWT secret, and placeholders for Atlas, Cloudinary, and `CLIENT_URL`. Supply those placeholders during Blueprint creation; for an existing service, set them in the Render Dashboard because `sync: false` is only prompted at initial creation. `CLIENT_URL` must exactly match the Vercel site's origin without a trailing slash. Render Blueprint syntax was checked against the [current Render reference](https://render.com/docs/blueprint-spec).

Deploy `client` to Vercel with root directory at repository root. The root `vercel.json` provides the build command, `client/dist` output, and SPA rewrite. Add `VITE_API_URL=https://YOUR-RENDER-HOST/api` in Vercel's environment settings. For cross-domain cookie sessions, HTTPS and `SameSite=None; Secure` are required; this configuration is enabled in production. The API checks the request Origin on writes. Use a custom API domain on the same parent domain as the Vercel frontend before public use, since browser third-party-cookie restrictions can affect cross-site sessions.

If uploads fail, verify Cloudinary credentials and that authenticated asset delivery is enabled. If votes fail, verify MongoDB transactions are supported by the deployment. If browser requests fail, verify the exact `CLIENT_URL` and `VITE_API_URL` values and HTTPS.

## Switch AI to Groq (Render Dashboard, no paid shell needed)

1. Merge and deploy the Groq provider change before changing providers.
2. Create your own key at [Groq Console](https://console.groq.com/keys). Keep it in the backend environment; never paste it in chat, source code, or a `VITE_` variable.
3. Open Render → `campusnotes-api` → Environment and set:

   ```dotenv
   AI_ENABLED=true
   AI_PROVIDER=groq
   GROQ_API_KEY=your_key_here
   GROQ_MODEL=openai/gpt-oss-20b
   GROQ_VISION_MODEL=qwen/qwen3.8-27b
   AI_MAX_CONCURRENT=1
   ```

4. Save and redeploy. Use the normal Build Command `npm ci && npm run build -w shared && npm run build -w server`. Remove any temporary Gemini diagnostic command you previously appended. No Vercel secret is needed.
5. Upload a short academic text PDF and a clear one-page photo or scanned PDF. Confirm extraction, study screening, and metadata suggestions complete. For a group of images, also try suggested page order and a summary. Provider tests in the repository use mocks; these uploads are the live key/model check.

Groq handles transcription, classification, metadata, summaries, and page ordering. Existing schema and evidence checks still apply. Text PDFs are read locally first. Scanned/mixed PDFs are rendered in an isolated worker; up to **3 pages per PDF** can be sent to the default vision model. Larger scanned PDFs fail with a split-file message instead of classifying only the first pages. Originals are retained. Unreadable or truncated transcriptions require human review.

For the free tier, classification defaults to a 12,000-character source limit; longer text goes to review instead of being silently truncated. Optional suggestions reject prompts over 18,000 characters. `STUDY_GATE_MAX_INPUT_CHARS` can override the classification limit if your account budget allows. These character bounds reduce request size but are not token or quota guarantees. Free-tier limits apply across the **organization**, not separately to every API key, and both request and token limits apply. Groq is a separate quota, not unlimited free usage. Check [your limits](https://console.groq.com/settings/limits) and [Groq's rate-limit documentation](https://console.groq.com/docs/rate-limits). The current models and image limits are documented in [Groq models](https://console.groq.com/docs/models) and [vision](https://console.groq.com/docs/vision).

If analysis fails, expand its status: `PROVIDER_AUTH` means check the Groq key/project access; `MODEL_UNAVAILABLE` means check model access or the configured ID; `RATE_LIMITED` means wait for the applicable quota to reset; `PROVIDER_UNAVAILABLE` means a network/provider failure; `PAGE_LIMIT` means split a scanned PDF into files of at most 3 pages. Groq quota errors and timeouts are not immediately retried automatically. Completed group extractions survive retries.

Gemini remains available with `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, and `GEMINI_MODEL`. Existing installations without `AI_PROVIDER` retain Gemini for compatibility. There is no automatic fallback to another provider or key.

## Gemini suggestions for community requests

Keep `AI_PROVIDER=groq` for document processing. Community-request suggestions independently use the existing server-only `GEMINI_API_KEY` and `GEMINI_MODEL`. No new key is required if both are already configured in Render. An optional `GEMINI_RECOMMENDATION_MODEL` overrides the model for this feature alone. Set `REQUEST_RECOMMENDATIONS_ENABLED=false` to disable new checks (the default is `true`). Existing saved suggestions can still be accepted when new checks are unavailable.

After merging and redeploying, post a request matching an approved public note from another student. The request should stay open and display up to three suggestions with preview links. Select **Accept & resolve** to move it to Fulfilled and retain a link to the accepted note. Existing open requests also have **Find existing notes**. Repeat with a request that has no match and verify it stays open. Private drafts and rejected notes must not be suggested.

Gemini's own quota still applies. An exhausted or invalid Gemini key produces an explanatory message and leaves the request open for community responses. No automatic Groq fallback or automatic acceptance occurs. The tests use mocked model responses; a live Gemini check requires the deployed key. `scripts/preview-demo.ts` includes a clearly labeled synthetic cached suggestion for local UI testing without live provider calls.

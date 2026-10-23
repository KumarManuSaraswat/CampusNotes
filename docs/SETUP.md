# Setup and deployment

## Local

1. Install Node 20+ and MongoDB 6+ (a replica set is required for voting transactions).
2. Run `npm install` at the repository root.
3. Copy `.env.example` to `server/.env` and `client/.env.example` to `client/.env`.
4. Set `MONGODB_URI`, a random `JWT_SECRET` of 32+ characters, and Cloudinary cloud name, key, and secret. The AI flag remains `false`.
5. Run `npm run dev`. The client uses port 5173; the API uses port 5000.
6. To seed a demo moderator, two students, and two original PDF notes, set `DEMO_MODERATOR_NAME`, `DEMO_MODERATOR_EMAIL`, `DEMO_MODERATOR_PASSWORD`, and `DEMO_STUDENT_PASSWORD` (passwords 12+ characters), then run `npm run seed`. The script refuses to promote an existing account and skips notes already seeded.

## Deploy

Create a MongoDB Atlas cluster and database user. Allow network access from the Render service. Create a Cloudinary account. The root `render.yaml` defines a Node web service, build/start commands, health path, generated JWT secret, and placeholders for Atlas, Cloudinary, and `CLIENT_URL`. Supply those placeholders during Blueprint creation; for an existing service, set them in the Render Dashboard because `sync: false` is only prompted at initial creation. `CLIENT_URL` must exactly match the Vercel site's origin without a trailing slash. Render Blueprint syntax was checked against the [current Render reference](https://render.com/docs/blueprint-spec).

Deploy `client` to Vercel with root directory at repository root. The root `vercel.json` provides the build command, `client/dist` output, and SPA rewrite. Add `VITE_API_URL=https://YOUR-RENDER-HOST/api` in Vercel's environment settings. For cross-domain cookie sessions, HTTPS and `SameSite=None; Secure` are required; this configuration is enabled in production. The API checks the request Origin on writes. Use a custom API domain on the same parent domain as the Vercel frontend before public use, since browser third-party-cookie restrictions can affect cross-site sessions.

If uploads fail, verify Cloudinary credentials and that authenticated asset delivery is enabled. If votes fail, verify MongoDB transactions are supported by the deployment. If browser requests fail, verify the exact `CLIENT_URL` and `VITE_API_URL` values and HTTPS.

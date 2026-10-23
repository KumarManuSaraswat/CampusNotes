# Smart Notes deployment checklist

1. Set the existing MongoDB, JWT, client URL, and Cloudinary server secrets. Cloudinary originals and generated PDFs must remain authenticated objects; verify the signed protected download path with a real upload.
2. Set `AI_ENABLED=true`, server-only `GEMINI_API_KEY`, and an enabled `GEMINI_MODEL` such as `gemini-3.5-flash-lite`. Verify model access, quota, and the actual JPG/PNG/PDF request path. Keep keys out of Vite variables.
3. Deploy the updated server, shared package, and client together. The `pdf-lib` dependency must be installed from the lockfile. The server needs enough request time for one extraction, screening, metadata, PDF, order, or summary stage; the browser resumes unfinished stages.
4. Run the commands in [SMART_NOTES_TEST_PLAN.md](./SMART_NOTES_TEST_PLAN.md), then the manual student A/B/request and rejection journeys. Verify authenticated previews and actual downloaded PDF bytes.
5. Check that old approved single-file notes remain visible, new approved drafts remain private, and only published notes appear in discovery, voting, and request fulfillment.
6. Review `npm audit --omit=dev` before production deployment. At implementation time it reported six dependency advisories (two high, four moderate), including Zod and Vite. The audit suggested major-version upgrades, so they were not applied during this integration. Keep Vite's development server private and plan a separate tested dependency upgrade.

No automatic database migration or deletion is required. Existing approved notes without the new `assets` field retain their previous visibility. New grouped notes require explicit publication. The AI order and summary are suggestions and may be inaccurate; use the student review screen before sharing. Set `AI_ENABLED=true` in the intended environment before testing the application flow. Do not commit the key.

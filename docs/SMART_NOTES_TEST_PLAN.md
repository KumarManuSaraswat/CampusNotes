# Smart Notes test plan

From the repository root:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The API suite uses a local MongoDB replica set through `mongodb-memory-server`. It mocks Cloudinary and Gemini to verify grouped upload, retry identity, private visibility, screening decisions, order confirmation, generated PDF bytes, summary editing, publication, search, and request fulfillment. The standalone PDF test parses its output with `pdf-lib` and checks page count. Vision, document, and classification modules have their own tests.

Manual browser journey with two student accounts:

1. Sign in as A, upload two to five non-confidential handwritten images together, and confirm that one private note appears.
2. Continue processing. Inspect the screening decision and metadata suggestion. Correct title, subject, tags, and description.
3. Request an AI page order if desired, adjust it manually, and confirm. Generate the PDF and open/download it; verify every page and its order.
4. Request a summary, inspect source excerpts, edit it, and inspect the factual processing report.
5. Confirm sharing rights, personal-information check, and publication. Sign in as B; search for the note, open originals/PDF, and vote.
6. As B, create a matching request. As A, select the published note and confirm fulfillment. Repeat the action to verify that it cannot add a second reward.
7. Upload a receipt and an unreadable sample. Confirm both remain private with appropriate rejection or review status.

Tests using mocks establish application behavior but cannot measure handwriting accuracy, account quota, provider latency, or protected Cloudinary readback in the actual account. Record the sample, model ID, result, and timing for additional live smoke runs before claiming that path is verified.

## Live Gemini smoke results

Using the configured `gemini-3.5-flash-lite` model, synthetic non-confidential images were sent to Gemini. A typed Java OOP PNG was transcribed, classified academic, given title/subject/description suggestions, and summarized in three bullets with validated source excerpts. A scanned PDF containing that image was routed by `prepareDocument` to vision and transcribed. Two synthetic pages marked Page 1 and Page 2 were suggested in the correct sequence. A synthetic shopping receipt was transcribed and classified non-academic. A one-pixel blank image produced only a page marker, which the classifier held for review. The first metadata call exposed a model shape error (`uncertaintyNotes` as a string); adding a provider response schema fixed it, and the rerun succeeded.

These smoke calls verify the provider path for synthetic typed samples. They do not prove handwriting accuracy or the live MongoDB/Cloudinary/browser journey. Test actual non-confidential handwritten notes and protected Cloudinary delivery before deployment.

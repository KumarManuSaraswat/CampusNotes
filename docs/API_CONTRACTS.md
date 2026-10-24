# API contracts

Base path: `/api`. Success: `{ "success": true, "data": ..., "message": "..." }`. Error: `{ "success": false, "error": { "code": "...", "message": "..." } }`. Auth uses an HttpOnly session cookie; browser writes must come from `CLIENT_URL`.

| Method      | Route                   | Access         | Purpose                                                              |
| ----------- | ----------------------- | -------------- | -------------------------------------------------------------------- |
| POST        | `/auth/register`        | Public         | Name, email, password                                                |
| POST        | `/auth/login`           | Public         | Email, password                                                      |
| POST        | `/auth/logout`          | Public         | Clear session                                                        |
| GET         | `/auth/me`              | Student        | Current user                                                         |
| POST        | `/notes`                | Student        | Multipart `file` and optional metadata                               |
| GET         | `/notes`                | Public         | `q`, `subject`, `tag`, `instructor`, `date`, `sort`, `page`, `limit` |
| GET         | `/notes/:id`            | Public         | Note and current vote                                                |
| GET         | `/notes/:id/file`       | Public         | Redirect to signed original; `download=1`                            |
| PATCH       | `/notes/:id`            | Author         | Metadata                                                             |
| DELETE      | `/notes/:id`            | Author         | Delete note                                                          |
| GET         | `/users/me/notes`       | Student        | Own notes                                                            |
| GET         | `/users/me/profile`     | Student        | Derived points and badges                                            |
| POST/DELETE | `/notes/:id/vote`       | Student        | Vote `{value:1                                                       | -1}` or remove |
| GET/POST    | `/requests`             | Public/Student | List or create requests                                              |
| PATCH       | `/requests/:id/fulfill` | Student        | Associate own `{noteId}`                                             |
| POST | `/requests/:id/recommendations` | Request owner | Find/cache up to 3 Gemini suggestions from existing public notes |
| PATCH | `/requests/:id/accept-recommendation` | Request owner | Accept a previously suggested `{noteId}` and fulfill the request |
| POST        | `/notes/:id/report`     | Student        | `{reason,description}`                                               |
| GET         | `/admin/reports`        | Moderator      | `status` filter                                                      |
| PATCH       | `/admin/reports/:id`    | Moderator      | `{status:"reviewed"                                                  | "resolved"}`   |
| POST        | `/notes/:id/ai-process` | Student        | Always 501 `AI_NOT_CONFIGURED`                                       |

`GET /health` is outside the API prefix. Supported report reasons: `spam`, `misleading_metadata`, `duplicate`, `inappropriate`, `unauthorized_material`.

Request recommendations return `{requestId, checkedAt, recommendations: [{noteId, title, subject, description, reason, evidence}]}`. Posting in the web UI starts a check after the request is durably created. Finding suggestions never changes the request status. The requester must explicitly accept; the selected note must still be public and previously suggested for that request. Acceptance returns `{id, status: "fulfilled", noteId}`, credits the original note author in `fulfilledBy`, and records the requester in `acceptedRecommendationBy`. Repeating the same acceptance is idempotent; a competing fulfillment cannot be overwritten.

Only public, approved notes belonging to other students are candidates. Retrieval selects up to 24 text-search matches (or recent public notes if text search has no results); Gemini sees bounded metadata, never private originals. Results are cached for five minutes and re-filtered for visibility every time they are served. Checks have a one-minute per-request cooldown, a durable attempt lease and a two-call per-process concurrency cap. Provider failures leave the request open. Errors include `RECOMMENDATIONS_UNAVAILABLE` / `RECOMMENDATIONS_QUOTA` (503), `RECOMMENDATIONS_BUSY` (429), `NOT_RECOMMENDED` (400), `NOTE_UNAVAILABLE` / `REQUEST_UNAVAILABLE` (409), and ownership/authentication errors (403/401).

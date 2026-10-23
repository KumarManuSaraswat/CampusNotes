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
| POST        | `/notes/:id/report`     | Student        | `{reason,description}`                                               |
| GET         | `/admin/reports`        | Moderator      | `status` filter                                                      |
| PATCH       | `/admin/reports/:id`    | Moderator      | `{status:"reviewed"                                                  | "resolved"}`   |
| POST        | `/notes/:id/ai-process` | Student        | Always 501 `AI_NOT_CONFIGURED`                                       |

`GET /health` is outside the API prefix. Supported report reasons: `spam`, `misleading_metadata`, `duplicate`, `inappropriate`, `unauthorized_material`.

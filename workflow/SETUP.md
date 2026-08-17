# Job-Find — setup

`Job-Find` (n8n workflow id `gOewaRo7mWdtX9R65tT-S`) is a webhook-driven job search pipeline: it fetches listings from 6 job boards for a given title/location, scores them against a resume uploaded per request, and for passing jobs drafts a tailored application email in Gmail. This is everything needed to get it running and wired to a frontend.

## How it works

1. **`Job Search Webhook`** (`POST /webhook/job-search`) receives `jobTitle`, `location`, `runId`, and a resume PDF as `multipart/form-data`, and logs a `Pending` row for the run.
2. **`Extract Text` → `Edit Fields`** pulls text out of the uploaded PDF into a `resume` field, then fans out to all 6 sources in parallel: RemoteOK, Google Jobs (SerpApi), Adzuna, Jooble, Indeed (Apify), LinkedIn (Apify). Each source's results are normalized to a common shape and tagged with the resume text + source name.
3. Results are merged, deduplicated, filtered (excludes titles containing `sales`/`marketing`), and run through **`Smart Scorer`** — a keyword-based scoring function.
4. **`Score Router`** branches on `score >= 0`:
   - **Passing jobs** go through `Job Application Email Writer` (an AI agent on `OpenAI Chat Model (Evaluator)`, `gpt-4o-mini`) which drafts a tailored application email (subject + body), then `Create Gmail Draft` saves it as a **Gmail draft only — never sent, "To" left blank** — then appends the record to `Sheet1`.
   - **Failing jobs** skip the AI entirely and are appended straight to `Sheet2`.
   - Both branches merge and log the run as complete (`resultsCount` + sheet links) back to the run-status tab.
5. **`Get Job Results`** (`GET /webhook/job-results?runId=...`) polls that run-status tab and returns progress/results links.

## 1. Environment variables (set on the n8n instance)

Only one node reads from `$env` — everything else uses native n8n credentials (section 2) or a spreadsheet ID entered directly in each Google Sheets node.

| Variable | Used by | What it is |
|---|---|---|
| `JOOBLE_API_KEY` | `Fetch Jooble Jobs` | Jooble API key (jooble.org/api/about), used directly in the request URL |

`Fetch RemoteOK Jobs` needs no key — it's a free public feed. Adzuna and Apify auth are native credentials, not env vars (see below).

## 2. Native n8n credentials (create via the n8n UI — can't be set through the API)

| Credential | Type | Attach to |
|---|---|---|
| Google Sheets | OAuth2 | `Google Sheets`, `Log Run Started`, `Log Run Complete`, `Read Run Status`, `Append Declined Jobs`, `Refresh Seen Jobs (Sheet1)`, `Refresh Seen Jobs (Sheet2)` |
| OpenAI | API key | `OpenAI Chat Model (Evaluator)` |
| SerpApi Query Auth | Query Auth (Generic Credential Type) | `Fetch Google Jobs` |
| Adzuna Custom Auth | Custom Auth (Generic Credential Type) | `Fetch Adzuna Jobs` |
| Apify | API token | `Fetch Indeed Jobs (Apify)`, `Fetch LinkedIn Jobs (Apify Native)` (same token, two actors) |
| Gmail | OAuth2 | `Create Gmail Draft` |

OAuth2 credentials (Google Sheets, Gmail) require interactive browser consent, so they must be created in the n8n UI: **Credentials → New →** pick the type, complete the consent flow, then open each node above and select it.

### SerpApi credential setup

SerpApi's `/search` endpoint only accepts the key as an `api_key` query parameter — it does **not** support `Authorization`/`X-SerpApi-Api-Key` headers (confirmed against the live API: header auth returns `401`, query param returns `200`). To keep the key out of the workflow JSON when sharing/exporting, it's stored as a **Query Auth** credential instead of a raw value:

1. In n8n: **Credentials → New → Query Auth**
2. Name: `SerpApi Query Auth`
3. Parameter Name: `api_key`
4. Value: your SerpApi key
5. Save, then open `Fetch Google Jobs` and set:
   - **Authentication**: Generic Credential Type
   - **Generic Auth Type**: Query Auth
   - **Credential**: `SerpApi Query Auth`
   - **Send Query Parameters**: on, with `engine`, `google_domain`, `q`, `hl`, `gl`, `location`, `lrad`, `ltype` as individual fields (no `api_key` row — the credential injects it automatically)

### Adzuna credential setup

Adzuna's `/search` endpoint needs `app_id` and `app_key` as query params (developer.adzuna.com):

1. In n8n: **Credentials → New → Custom Auth**
2. Name: `Adzuna Custom Auth`
3. JSON definition:
   ```json
   { "qs": { "app_id": "your_adzuna_app_id", "app_key": "your_adzuna_app_key" } }
   ```
4. Save, then open `Fetch Adzuna Jobs` and set **Authentication**: Generic Credential Type → **Generic Auth Type**: Custom Auth → **Credential**: `Adzuna Custom Auth`.

### Apify credential setup

1. In n8n: **Credentials → New → Apify API**
2. Paste your API token from console.apify.com
3. Attach to both `Fetch Indeed Jobs (Apify)` and `Fetch LinkedIn Jobs (Apify Native)`.

### Google Sheet layout required

Every Google Sheets node has the target spreadsheet ID entered directly in its `documentId` field (not an env var) — to point the workflow at your own spreadsheet, update the ID in each of the seven nodes listed in the credentials table above.

The spreadsheet needs three tabs:
- **`Sheet1`** (gid=0) — jobs that passed the score router and got an application email drafted.
- **`Sheet2`** (gid=1007147172) — jobs that didn't clear the quantitative score. No AI call is made for these.
- **`Job Process`** (gid=114455467) — run-status tracking for the poll endpoint. Columns: `Run ID | status | startedAt | resultsCount | highScoreSheetUrl | lowScoreSheetUrl` (only `Run ID` and `status` are written when a run starts; the rest are filled in when it completes).

`Sheet1` and `Sheet2` share the same column schema: `Job Key | Job Title | Company Name | Pay | Link | Quantitative Score | Location | source | Date | Run ID`.

## 3. Webhook endpoints (for the frontend)

Once the workflow is **activated**, these are live at `<your-n8n-instance>/webhook/<path>` (or `/webhook-test/<path>` while testing in the n8n editor):

### `POST /webhook/job-search` — start a search
Request is `multipart/form-data` (not JSON — needed to carry the resume file), with fields:

| Field | Type | Notes |
|---|---|---|
| `jobTitle` | text | e.g. `"automation manager"` |
| `location` | text | e.g. `"Austin, TX"` or `"Remote"` |
| `runId` | text | generated by the caller (e.g. `crypto.randomUUID()`) — used to poll for results |
| `resume` | file | PDF. **The multipart field must be named exactly `resume`** — n8n's webhook keeps the uploaded file's binary property name matching the form field name, and `Extract Text`'s `binaryPropertyName` is set to `resume` to match. Renaming the field on either side breaks this. |

Responds immediately (the pipeline runs in the background — expect several minutes for it to finish, since it calls 6 job boards and grades each surviving job through the AI evaluator with an 8s delay between calls).

### `GET /webhook/job-results?runId=<uuid>` — poll for results
Response:
```json
{
  "status": "running" | "complete" | "not_found",
  "resultsCount": 0,
  "highScoreSheetUrl": "https://docs.google.com/spreadsheets/d/<id>/edit#gid=0",
  "lowScoreSheetUrl": "https://docs.google.com/spreadsheets/d/<id>/edit#gid=1007147172"
}
```
No per-job data is returned — `highScoreSheetUrl`/`lowScoreSheetUrl` link straight to the `Sheet1` (score ≥ 0) and `Sheet2` (score < 0) tabs of the results spreadsheet, and are `null` until the run completes. Poll this every few seconds with the same `runId` you sent to `job-search` until `status` is `"complete"`.

## 4. Testing

1. Confirm no validation errors: `validate_workflow` / `n8n_validate_workflow` (profile `runtime`).
2. Since the search webhook expects a file upload, trigger it with a real `multipart/form-data` request rather than `n8n_test_workflow` (which only sends JSON) — e.g.:
   ```
   curl -F jobTitle="automation manager" -F location="Austin, TX" -F runId="test-1" -F resume=@resume.pdf https://<your-n8n-instance>/webhook/job-search
   ```
3. Check the execution in the n8n UI (or `n8n_executions` get, mode `error`/`summary`) — the `Job Search Webhook` step should show `binary.resume` on its output item, and `Extract Text` should produce resume text from it.
4. Check the `Job Process` tab for a new `Pending` row.
5. Poll `GET /webhook/job-results?runId=test-1` until `status: "complete"`.
6. Check `Sheet1`/`Sheet2` and the poll response agree on the graded jobs.

## Known limitation

`Smart Scorer`'s keyword dictionaries (`CORE_FUNCTION_KEYWORDS`, `HIGH_VALUE_SKILL_KEYWORDS`, `TITLE_BONUS_KEYWORDS`) are still tuned for an automation/ops/AI job search and don't adapt to whatever `jobTitle` is searched. Its generic parts (negative-title rejection, hourly-pay rejection, seniority modifiers) apply to any search. Rewriting the scorer to be fully dynamic wasn't part of this pass — flag it if searches outside that domain need better scoring.

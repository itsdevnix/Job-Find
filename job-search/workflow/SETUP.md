# Job-Find — setup

`Job-Find` (n8n workflow id `gOewaRo7mWdtX9R65tT-S`) is now webhook-driven instead of scheduled. This is everything needed to get it running and wired to a frontend. See `job-find-backup.json` in this folder for the pre-webhook version if you ever need to roll back (`n8n_update_full_workflow` with that file's `nodes`/`connections`/`settings`).

## What changed

- **Schedule Trigger removed.** The workflow only runs when called via the `Job Search Webhook` below.
- **Email digest removed** (`Format Email`, `Gmail`, `Filter for best fit jobs` nodes deleted). Results are read back via the poll endpoint / Google Sheets instead.
- **AI evaluator swapped**: `Gemini Flash (Evaluator)` (OpenRouter) → `OpenAI Chat Model (Evaluator)` (`gpt-4o-mini`), feeding the same `Job Match Evaluator` agent.
- **Search is now per-request**: job title/keywords and location come from the webhook payload instead of being hardcoded.
- **Resume is now uploaded per-request, not fetched from Google Drive.** `Get Resume`, `Grab One Resume`, and `Add Resume Metadata` are deleted. `Job Search Webhook` now connects directly to `Extract Text`, which reads the uploaded PDF straight from the webhook's binary data.
- **AI confidence-scoring replaced with score-based routing + auto-drafted application emails** (2026-08-11): `Job Match Evaluator` (confidence_score/summary/fit_reason) and the `Only scores > 0` filter are now **disabled and disconnected** — left on the canvas only as a rollback reference, do not re-enable without rewiring. In their place:
  - `Score Router` (IF node) branches on `Smart Scorer`'s `score >= 0`.
  - Passing jobs go through `Job Application Email Writer` (same `OpenAI Chat Model (Evaluator)` connector, new prompt) which drafts a tailored application email (subject + body), then `Create Gmail Draft` saves it as a **Gmail draft only — never sent, "To" left blank**, then `Google Sheets` appends the full record to `Sheet1` with `Draft Email Created = Yes`.
  - Failing jobs skip the AI entirely and go straight from `Score Router`'s false branch to `Append Declined Jobs`, which appends the full record to a new `Declined` tab with `Draft Email Created = No`.
  - Both branches merge at `Merge Results` before `Summarize Run Results` / `Log Run Complete`, so `Runs`' `resultsCount` still reflects everything processed.
  - See the two manual setup items in section 2 below (Gmail credential, `Declined` tab) — the workflow will not run correctly until both are done.

## 1. Environment variables (set on the n8n instance)

See `API_KEYS.env.example` in this folder for every key/secret this project needs (n8n-side and frontend-side) collected in one template — copy each value to its real destination from there.

These are referenced in node expressions as `{{ $env.VAR_NAME }}`, so the raw values never appear in the workflow JSON. Set them wherever you configure this n8n instance's environment (e.g. `.env` for self-hosted, or the instance's environment variable settings).

| Variable | Used by | What it is |
|---|---|---|
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | `Fetch Adzuna Jobs` | Adzuna API app ID + key (developer.adzuna.com) |
| `JOOBLE_API_KEY` | `Fetch Jooble Jobs` | Jooble API key (jooble.org/api/about) |
| `APIFY_API_TOKEN` | `Apify` (Indeed scraper), `Fetch LinkedIn Jobs (Apify)` | Apify API token (console.apify.com) — same token, used by two different actors |
| `GOOGLE_SHEETS_ID` | `Read Applied History`, `Google Sheets`, `Log Run Started`, `Log Run Complete`, `Read Run Status`, `Read Run Results` | The spreadsheet ID from your results sheet's URL |

`Fetch RemoteOK Jobs` needs no key — it's a free public feed.

**If `$env` access is blocked on this n8n instance** (some hosted setups disable expression access to environment variables): the fallback is to hardcode these same values directly into each node listed above instead of the `$env.*` expression. Less secure, but functionally equivalent. Check by running the test in section 4 below — if `Fetch Google Jobs` etc. come back empty/erroring on auth, this is the first thing to check.

## 2. Native n8n credentials (create via the n8n UI — can't be set through the API)

| Credential | Type | Attach to |
|---|---|---|
| Google Sheets | OAuth2 | `Read Applied History`, `Google Sheets`, `Log Run Started`, `Log Run Complete`, `Read Run Status`, `Read Run Results`, `Append Declined Jobs` |
| OpenAI | API key | `OpenAI Chat Model (Evaluator)` |
| SerpApi Query Auth | Query Auth (Generic Credential Type) | `Fetch Google Jobs` |
| Gmail | OAuth2 | `Create Gmail Draft` |

**Google Sheets and OpenAI weren't configured before** — the workflow cannot run until the Google Sheets credential is attached to those seven nodes (they currently have no credential at all).

**Gmail OAuth2 is new and not configured** — `Create Gmail Draft` (drafts the application email, never sends it) has no credential attached yet. OAuth2 credentials require interactive browser consent, so this must be done in the n8n UI: **Credentials → New → Gmail OAuth2 API**, complete the Google consent flow, then open `Create Gmail Draft` and select it.

### SerpApi credential setup

SerpApi's `/search` endpoint only accepts the key as an `api_key` query parameter — it does **not** support `Authorization`/`X-SerpApi-Api-Key` headers (confirmed against the live API: header auth returns `401`, query param returns `200`). To keep the key out of the workflow JSON when sharing/exporting, it's stored as a **Query Auth** credential instead of a raw `$env` expression or a hardcoded value:

1. In n8n: **Credentials → New → Query Auth**
2. Name: `SerpApi Query Auth`
3. Parameter Name: `api_key`
4. Value: your SerpApi key (see `API_KEYS.env.example`)
5. Save, then open `Fetch Google Jobs` and set:
   - **Authentication**: Generic Credential Type
   - **Generic Auth Type**: Query Auth
   - **Credential**: `SerpApi Query Auth`
   - **Send Query Parameters**: on, with `engine`, `google_domain`, `q`, `hl`, `gl`, `location`, `lrad`, `ltype` as individual fields (no `api_key` row — the credential injects it automatically)

### Google Sheet layout required

The same spreadsheet (`GOOGLE_SHEETS_ID`) needs three tabs:
- **`Sheet1`** (gid=0) — the results log for jobs that passed the score router and got an application email drafted. Columns: `Job Title | Company Name | Pay | Link | Quantitative Score | Location | Matched Keywords | source | savedAt | Run ID | Draft Email Created | Email Subject`. (`AI Confidence` / `AI Summary` / `Fit Reason` are no longer written — the AI evaluator that produced them is disabled — remove those headers or just leave them blank going forward. `Draft Email Created` and `Email Subject` are new — add them if the sheet already exists.)
- **`Declined`** (new tab) — jobs that didn't clear the quantitative score. Same column schema as `Sheet1` above, so the two tabs are directly comparable; `Draft Email Created` is always `No` here and `Email Subject` is always blank (no AI call is made for these).
- **`Runs`** (tab) — run-status tracking for the poll endpoint. Columns: `Run ID | status | startedAt | resultsCount | highScoreSheetUrl | lowScoreSheetUrl`.

## 3. Webhook endpoints (for the frontend)

Once the workflow is **activated**, these are live at `<your-n8n-instance>/webhook/<path>` (or `/webhook-test/<path>` while testing in the n8n editor):

### `POST /webhook/job-search` — start a search
Request is `multipart/form-data` (not JSON — needed to carry the resume file), with fields:

| Field | Type | Notes |
|---|---|---|
| `jobTitle` | text | e.g. `"automation manager"` |
| `location` | text | e.g. `"Austin, TX"` or `"Remote"` |
| `runId` | text | generated by the caller (e.g. `crypto.randomUUID()`) — used to poll for results |
| `resume` | file | PDF. **The multipart field must be named exactly `resume`** — n8n's webhook keeps the uploaded file's binary property name matching the form field name (confirmed via a live test execution), and `Extract Text`'s `binaryPropertyName` is set to `resume` to match. Renaming the field on either side breaks this. |

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
No per-job data is returned — `highScoreSheetUrl`/`lowScoreSheetUrl` link straight to the `Sheet1` (score ≥ 0) and declined (score < 0) tabs of the results spreadsheet, and are `null` until the run completes (or if the run predates this field being added to the `Runs` tab). Poll this every few seconds with the same `runId` you sent to `job-search` until `status` is `"complete"`.

## 4. Testing

1. Confirm no validation errors: `validate_workflow` / `n8n_validate_workflow` (profile `runtime`).
2. Since the search webhook now expects a file upload, trigger it with a real `multipart/form-data` request rather than `n8n_test_workflow` (which only sends JSON) — e.g.:
   ```
   curl -F jobTitle="automation manager" -F location="Austin, TX" -F runId="test-1" -F resume=@resume.pdf https://<your-n8n-instance>/webhook/job-search
   ```
3. Check the execution in the n8n UI (or `n8n_executions` get, mode `error`/`summary`) — the `Job Search Webhook` step should show `binary.resume` on its output item (already confirmed working). Once the Google Sheets credential below is attached, confirm `Extract Text` actually produces resume text from it.
4. Check the `Runs` tab for a new `running` row.
5. Poll `GET /webhook/job-results?runId=test-1` until `status: "complete"`.
6. Check `Sheet1` and the poll response agree on the graded jobs.

## Known limitation

`Smart Scorer`'s keyword dictionaries (`CORE_FUNCTION_KEYWORDS`, `HIGH_VALUE_SKILL_KEYWORDS`, `TITLE_BONUS_KEYWORDS`) are still tuned for an automation/ops/AI job search and don't adapt to whatever `jobTitle` is searched. Its generic parts (negative-title rejection, hourly-pay rejection, seniority modifiers) apply to any search. Rewriting the scorer to be fully dynamic wasn't part of this pass — flag it if searches outside that domain need better scoring.

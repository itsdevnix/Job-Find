# Job-Find

An automated job search assistant. You give it a job title, a location, and your resume (PDF) through a simple web form; it searches **6 job boards**, scores every result against your resume, and for jobs that pass the bar it drafts a tailored application email in Gmail (as a **draft only — it never sends anything automatically**) and logs every result to a Google Sheet for you to review.

It's built from two parts:
- an **n8n workflow** (`Job-Find`, workflow id `gOewaRo7mWdtX9R65tT-S`) that does the searching, scoring, and drafting
- a **Next.js frontend** that gives you a form to submit a search and a page to watch results come in

---

## How it works

```
Next.js frontend
      │  POST job title, location, resume PDF
      ▼
n8n webhook  (POST /webhook/job-search)
      │
      ▼
Fetch jobs from 6 sources in parallel
  • RemoteOK            (free, no key)
  • Adzuna               (API key)
  • Google Jobs           via SerpApi
  • Jooble                (API key)
  • Indeed                via Apify actor
  • LinkedIn              via Apify actor
      │
      ▼
Smart Scorer  (keyword-matches each job against your resume/target role)
      │
      ▼
Score Router  (score >= 0 ?)
      │                              │
   pass                            fail
      │                              │
      ▼                              ▼
Job Application Email Writer   Append to "Declined" sheet tab
(OpenAI gpt-4o-mini drafts
 a tailored subject + body)
      │
      ▼
Create Gmail Draft (never sent — "To" left blank)
      │
      ▼
Append to "Sheet1" (results log)
```

Meanwhile the frontend polls `GET /webhook/job-results?runId=...` every few seconds until the run is marked complete, then shows you links to the results sheets.

---

## Tech stack

| Part | Stack |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Workflow engine | n8n (self-hosted) |
| AI | OpenAI `gpt-4o-mini` (job-fit scoring assist / email drafting) |
| Storage | Google Sheets (3 tabs: `Sheet1`, `Declined`, `Runs`) |
| Email | Gmail (drafts only) |
| Job data | RemoteOK, Adzuna, SerpApi (Google Jobs), Jooble, Apify (Indeed + LinkedIn) |

---

## API keys & credentials needed

Everything below is collected in one copy-paste template at [`workflow/API_KEYS.env.example`](workflow/API_KEYS.env.example) — copy each value to its real destination (see [`workflow/SETUP.md`](workflow/SETUP.md) for full detail).

### 1. Environment variables — set on the n8n instance

Referenced in node expressions as `{{ $env.VAR_NAME }}`, so raw values never appear in the workflow JSON.

| Variable | Used by | Where to get it |
|---|---|---|
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | `Fetch Adzuna Jobs` | [developer.adzuna.com](https://developer.adzuna.com) — free account, app ID + key |
| `JOOBLE_API_KEY` | `Fetch Jooble Jobs` | [jooble.org/api/about](https://jooble.org/api/about) |
| `APIFY_API_TOKEN` | `Apify` (Indeed), `Fetch LinkedIn Jobs (Apify)` | [console.apify.com](https://console.apify.com) — see [Apify setup](#apify-actors-used) below |
| `GOOGLE_SHEETS_ID` | All Sheets nodes (`Read Applied History`, `Google Sheets`, `Log Run Started/Complete`, `Read Run Status`, `Read Run Results`, `Append Declined Jobs`) | The spreadsheet ID from your results sheet's URL |

`Fetch RemoteOK Jobs` needs no key — it's a free public feed.

### 2. Native n8n credentials — created via the n8n UI (not env vars)

| Credential | Type | Attach to |
|---|---|---|
| Google Sheets | OAuth2 | all Sheets nodes above |
| OpenAI | API key | `OpenAI Chat Model (Evaluator)` |
| SerpApi Query Auth | Query Auth (generic credential, param `api_key`) | `Fetch Google Jobs` |
| Gmail | OAuth2 | `Create Gmail Draft` |

### 3. Frontend environment variables

Set in `frontend/.env.local` (copy from `frontend/.env.local.example`):

| Variable | Purpose |
|---|---|
| `N8N_JOB_SEARCH_WEBHOOK_URL` | The n8n instance's `POST /webhook/job-search` URL |
| `N8N_JOB_RESULTS_WEBHOOK_URL` | The n8n instance's `GET /webhook/job-results` URL |

Both are server-only (no `NEXT_PUBLIC_` prefix) — the browser never sees the webhook URLs directly; the frontend's own API routes proxy the calls.

---

## Apify actors used

Two of the six job sources are scraped via Apify. There's no dedicated Apify node in this n8n install — both actors are called directly through n8n `httpRequest` nodes hitting Apify's REST API:

```
POST https://api.apify.com/v2/acts/<actor-id>/run-sync-get-dataset-items?token=<APIFY_API_TOKEN>
```

| Actor ID | Scrapes | n8n node |
|---|---|---|
| `misceres~indeed-scraper` | Indeed | `Apify` |
| `practicaltools~linkedin-jobs` | LinkedIn | `Fetch LinkedIn Jobs (Apify)` |

Both actors share a single token — no per-actor auth needed.

**Getting the token, step by step:**
1. Sign in (or sign up) at [console.apify.com](https://console.apify.com).
2. Go to **Settings → Integrations**.
3. Copy your **API token**.
4. Set it as the `APIFY_API_TOKEN` environment variable on the n8n instance.

That's it — n8n calls both actors with the same token; you don't need to configure the actors themselves in the Apify console.

---

## Setup — step by step

1. **Collect API keys.** Get every key from the [API keys section](#api-keys--credentials-needed) above and fill in the real values in your own copy of `workflow/API_KEYS.env.example` (that file in this repo is a scrubbed template — do not commit real values into it).
2. **Set the 5 n8n-side environment variables** on the n8n instance (self-hosted `.env`, or your host's environment variable settings).
3. **Create the 4 native n8n credentials** (Google Sheets, OpenAI, SerpApi Query Auth, Gmail) via the n8n UI and attach each to its listed nodes — see `workflow/SETUP.md` section 2 for exact steps, including the SerpApi Query Auth setup (SerpApi only accepts the key as a query param, not a header).
4. **Set up the Google Sheet.** Same spreadsheet (`GOOGLE_SHEETS_ID`) needs 3 tabs:
   - `Sheet1` — jobs that passed scoring and got a drafted application email
   - `Declined` — jobs that didn't clear the score threshold
   - `Runs` — run-status tracking for the poll endpoint
   Column layouts are in `workflow/SETUP.md` section 2.
5. **Activate the `Job-Find` workflow** in n8n.
6. **Configure the frontend:**
   ```bash
   cd frontend
   cp .env.local.example .env.local
   # fill in N8N_JOB_SEARCH_WEBHOOK_URL and N8N_JOB_RESULTS_WEBHOOK_URL
   npm install
   npm run dev
   ```
7. **Test end-to-end** (see `workflow/SETUP.md` section 4):
   ```bash
   curl -F jobTitle="automation manager" -F location="Austin, TX" -F runId="test-1" \
        -F resume=@resume.pdf https://<your-n8n-instance>/webhook/job-search
   ```
   Then poll `GET /webhook/job-results?runId=test-1` until `status` is `"complete"`.

For full setup detail beyond this summary, see [`workflow/SETUP.md`](workflow/SETUP.md). For a rollback reference to the pre-webhook version of the workflow, see [`workflow/job-find-backup.json`](workflow/job-find-backup.json).

---

## Endpoints

### `POST /webhook/job-search` — start a search

`multipart/form-data` body (not JSON — needed to carry the resume file):

| Field | Type | Notes |
|---|---|---|
| `jobTitle` | text | e.g. `"automation manager"` |
| `location` | text | e.g. `"Austin, TX"` or `"Remote"` |
| `runId` | text | caller-generated (e.g. `crypto.randomUUID()`) — used to poll for results |
| `resume` | file | PDF. The multipart field name must be exactly `resume`. |

Responds immediately; the pipeline runs in the background (expect several minutes, since it queries 6 job boards and grades each surviving job with a delay between AI calls).

### `GET /webhook/job-results?runId=<uuid>` — poll for results

```json
{
  "status": "running" | "complete" | "not_found",
  "resultsCount": 0,
  "highScoreSheetUrl": "https://docs.google.com/spreadsheets/d/<id>/edit#gid=0",
  "lowScoreSheetUrl": "https://docs.google.com/spreadsheets/d/<id>/edit#gid=1007147172"
}
```

No per-job data is returned directly — `highScoreSheetUrl` / `lowScoreSheetUrl` link to the `Sheet1` and `Declined` tabs of the results spreadsheet, and are `null` until the run completes.

---

## Known limitation

`Smart Scorer`'s keyword dictionaries are currently tuned for automation/ops/AI-type roles and don't automatically adapt to whatever `jobTitle` is searched. Its generic parts (negative-title rejection, hourly-pay rejection, seniority modifiers) apply to any search, but scoring for very different job titles may need retuning.

---

## A note on emails

The workflow **only ever creates Gmail drafts** with the "To" field left blank — it never sends an email on your behalf. Review and send each draft yourself.

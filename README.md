# Job-Find

An automated job search assistant. You give it a job title, a location, and your resume (PDF) through a simple web form; it searches **6 job boards**, scores every result against your resume, and for jobs that pass the bar it drafts a tailored application email in Gmail (as a **draft only — it never sends anything automatically**) and logs every result to a Google Sheet for you to review.

It's built from two parts:
- an **n8n workflow** (import [`Job-Find.json`](Job-Find.json)) that does the searching, scoring, and drafting
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
Job Application Email Writer   Append to "Sheet2" (declined jobs)
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
| Storage | Google Sheets (3 tabs: `Sheet1`, `Sheet2`, `Job Process`) |
| Email | Gmail (drafts only) |
| Job data | RemoteOK, Adzuna, SerpApi (Google Jobs), Jooble, Apify (Indeed + LinkedIn) |

---

## API keys & credentials needed

Never paste real key values into the workflow JSON or commit them to git — everything below goes into n8n's own credential store or its environment variables, both kept out of the exported `Job-Find.json`.

| Service | Get it at | Used by |
|---|---|---|
| Jooble | [jooble.org/api/about](https://jooble.org/api/about) | `Fetch Jooble Jobs` |
| Adzuna | [developer.adzuna.com](https://developer.adzuna.com) | `Fetch Adzuna Jobs` |
| SerpApi (Google Jobs) | [serpapi.com](https://serpapi.com) | `Fetch Google Jobs` |
| Apify (Indeed + LinkedIn) | [console.apify.com](https://console.apify.com) | `Fetch Indeed Jobs (Apify)`, `Fetch LinkedIn Jobs (Apify Native)` |
| OpenAI | [platform.openai.com](https://platform.openai.com) | `OpenAI Chat Model (Evaluator)` |
| Google Sheets | your Google account (OAuth sign-in, no key to copy) | `Google Sheets`, `Log Run Started`, `Log Run Complete`, `Read Run Status`, `Append Declined Jobs`, `Refresh Seen Jobs (Sheet1)`, `Refresh Seen Jobs (Sheet2)` |
| Gmail | your Google account (OAuth sign-in, no key to copy) | `Create Gmail Draft` |

`Fetch RemoteOK Jobs` needs no key — it's a free public feed.

**Jooble**
1. Fill in the request form at the link above — Jooble emails you a key.
2. On the n8n instance, set it as the `JOOBLE_API_KEY` environment variable.

**Adzuna**
1. Register at the link above — your App ID and App Key show on the dashboard.
2. In n8n: **Credentials → New → Custom Auth**, name it `Adzuna Custom Auth`, and set:
   ```json
   { "qs": { "app_id": "your_adzuna_app_id", "app_key": "your_adzuna_app_key" } }
   ```
3. Attach it to `Fetch Adzuna Jobs`.

**SerpApi**
1. Sign up and copy your API key from the dashboard.
2. In n8n: **Credentials → New → Query Auth**, name it `SerpApi Query Auth`, parameter name `api_key`, value = your key.
3. Attach it to `Fetch Google Jobs`.

**Apify**
1. Sign in → **Settings → Integrations** → copy your API token.
2. In n8n: **Credentials → New → Apify API**, paste the token.
3. Attach it to both `Fetch Indeed Jobs (Apify)` and `Fetch LinkedIn Jobs (Apify Native)` — same token for both.

**OpenAI**
1. Sign in → **API keys** → **Create new secret key** (copy it now — shown once).
2. In n8n: **Credentials → New → OpenAI account**, paste the key.
3. Attach it to `OpenAI Chat Model (Evaluator)`.

**Google Sheets**
1. In n8n: **Credentials → New → Google Sheets Account** → OAuth2 → sign in with Google.
2. Attach it to the 7 nodes listed in the table above.
3. Create the results spreadsheet (or reuse one) with its 3 required tabs — see step 4 of [Setup — step by step](#setup--step-by-step) below. Then open each of those 7 nodes and pick that spreadsheet in its document field — the ID isn't a credential, it's set per-node.

**Gmail**
1. In n8n: **Credentials → New → Gmail OAuth2 API** → sign in and authorize the account that should hold the drafts.
2. Attach it to `Create Gmail Draft`.

### Frontend environment variables

Set in `frontend/.env.local` (copy from `frontend/.env.local.example`):

| Variable | Purpose |
|---|---|
| `N8N_JOB_SEARCH_WEBHOOK_URL` | The n8n instance's `POST /webhook/job-search` URL |
| `N8N_JOB_RESULTS_WEBHOOK_URL` | The n8n instance's `GET /webhook/job-results` URL |

Both are server-only (no `NEXT_PUBLIC_` prefix) — the browser never sees the webhook URLs directly; the frontend's own API routes proxy the calls.

---

## Apify actors used

Two of the six job sources are scraped via Apify's native n8n node (`@apify/n8n-nodes-apify.apify`), authenticated with the `Apify` credential set up above:

| Actor ID | Scrapes | n8n node |
|---|---|---|
| `misceres/indeed-scraper` | Indeed | `Fetch Indeed Jobs (Apify)` |
| `practicaltools/linkedin-jobs` | LinkedIn | `Fetch LinkedIn Jobs (Apify Native)` |

Both nodes share the same credential — no per-actor auth needed, and no manual configuration in the Apify console beyond having the token.

---

## Setup — step by step

1. **Collect API keys.** Get every key from the [API keys section](#api-keys--credentials-needed) above and fill in the real values in your own copy of `workflow/API_KEYS.env.example` (that file in this repo is a scrubbed template — do not commit real values into it).
2. **Set the 1 n8n-side environment variable** (`JOOBLE_API_KEY`) on the n8n instance (self-hosted `.env`, or your host's environment variable settings).
3. **Create the 6 native n8n credentials** (Google Sheets, OpenAI, SerpApi Query Auth, Adzuna Custom Auth, Apify, Gmail) via the n8n UI and attach each to its listed nodes — see `workflow/SETUP.md` section 2 for exact steps.
4. **Set up the Google Sheet.** The same spreadsheet (its ID entered directly into each Google Sheets node) needs 3 tabs:
   - `Sheet1` — jobs that passed scoring and got a drafted application email
   - `Sheet2` — jobs that didn't clear the score threshold
   - `Job Process` — run-status tracking for the poll endpoint
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

For full setup detail beyond this summary, see [`workflow/SETUP.md`](workflow/SETUP.md).

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

No per-job data is returned directly — `highScoreSheetUrl` / `lowScoreSheetUrl` link to the `Sheet1` and `Sheet2` tabs of the results spreadsheet, and are `null` until the run completes.

---

## Known limitation

`Smart Scorer`'s keyword dictionaries are currently tuned for automation/ops/AI-type roles and don't automatically adapt to whatever `jobTitle` is searched. Its generic parts (negative-title rejection, hourly-pay rejection, seniority modifiers) apply to any search, but scoring for very different job titles may need retuning.

---

## A note on emails

The workflow **only ever creates Gmail drafts** with the "To" field left blank — it never sends an email on your behalf. Review and send each draft yourself.

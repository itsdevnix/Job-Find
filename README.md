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

Everything below is collected in one copy-paste template at [`workflow/API_KEYS.env.example`](workflow/API_KEYS.env.example) — copy each value to its real destination (see [`workflow/SETUP.md`](workflow/SETUP.md) for full detail).

⚠️ **Never paste real key values into the workflow JSON or commit them to git.** Every key below goes either into an n8n environment variable (referenced as `{{ $env.VAR_NAME }}`) or a native n8n credential (attached via the n8n UI, never stored in the exported JSON) — that's what keeps `Job-Find.json` safe to share/export.

### 1. Environment variables — set on the n8n instance

Only one node reads from `{{ $env.VAR_NAME }}` — Adzuna, Apify, and the results spreadsheet ID are all handled by native credentials or per-node config instead (section 2).

| Variable | Used by | Where to get it |
|---|---|---|
| `JOOBLE_API_KEY` | `Fetch Jooble Jobs` | [jooble.org/api/about](https://jooble.org/api/about) |

`Fetch RemoteOK Jobs` needs no key — it's a free public feed.

**Getting `JOOBLE_API_KEY`, step by step:**
1. Go to [jooble.org/api/about](https://jooble.org/api/about).
2. Fill in the request form (name, email, site/project description) and submit.
3. Jooble emails you an API key (format: a UUID, e.g. `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).
4. Set it as `JOOBLE_API_KEY` on the n8n instance. It's consumed as part of the request URL (`https://jooble.org/api/{{ $env.JOOBLE_API_KEY }}`) — never paste the raw key into the node itself.

**Setting up the results spreadsheet:**
1. Create a new Google Sheet (or reuse one) that will hold results.
2. Create the 3 required tabs in it — see step 4 of [Setup — step by step](#setup--step-by-step) below, or `workflow/SETUP.md` section 2 for the exact column layout.
3. Unlike the variable above, the spreadsheet ID is **not** an env var — it's entered directly in the `documentId` field of each of the 7 Google Sheets nodes listed in the credentials table below. Pick the sheet from the node's document picker (or paste the ID) in each one.

### 2. Native n8n credentials — created via the n8n UI (not env vars)

| Credential | Type | Attach to |
|---|---|---|
| Google Sheets | OAuth2 | `Google Sheets`, `Log Run Started`, `Log Run Complete`, `Read Run Status`, `Append Declined Jobs`, `Refresh Seen Jobs (Sheet1)`, `Refresh Seen Jobs (Sheet2)` |
| OpenAI | API key | `OpenAI Chat Model (Evaluator)` |
| SerpApi Query Auth | Query Auth (generic credential, param `api_key`) | `Fetch Google Jobs` |
| Adzuna Custom Auth | Custom Auth (generic credential, qs `app_id` + `app_key`) | `Fetch Adzuna Jobs` |
| Apify | API token | `Fetch Indeed Jobs (Apify)`, `Fetch LinkedIn Jobs (Apify Native)` (same token, two actors) |
| Gmail | OAuth2 | `Create Gmail Draft` |

**Setting up the Google Sheets credential, step by step:**
1. In n8n: **Credentials → New → Google Sheets Account**.
2. Choose **OAuth2**, click **Sign in with Google**, and grant access.
3. Save, then open each Sheets node listed above and select this credential.

**Getting the OpenAI API key credential, step by step:**
1. Sign in at [platform.openai.com](https://platform.openai.com).
2. Go to **API keys** (left sidebar) → **Create new secret key**.
3. Copy the key immediately — OpenAI only shows it once.
4. In n8n: **Credentials → New → OpenAI account**, paste the key, save.
5. Attach it to `OpenAI Chat Model (Evaluator)`.

**Setting up the SerpApi Query Auth credential, step by step:**
1. Sign up at [serpapi.com](https://serpapi.com) and copy your **API key** from the dashboard.
2. In n8n: **Credentials → New → Query Auth**.
3. Name: `SerpApi Query Auth`. Parameter Name: `api_key`. Value: your SerpApi key.
4. Save, then open `Fetch Google Jobs` and set **Authentication** → Generic Credential Type → Query Auth → `SerpApi Query Auth`.
5. This is a **Query Auth credential, not a `$env` variable**, because SerpApi only accepts the key as a query param (no header support).

**Setting up the Adzuna Custom Auth credential, step by step:**
1. Go to [developer.adzuna.com](https://developer.adzuna.com), click **Register**, sign up, and verify your email.
2. Once logged in, your **App ID** and **App Key** are shown on the dashboard (also emailed to you).
3. In n8n: **Credentials → New → Custom Auth**. Name: `Adzuna Custom Auth`. JSON definition:
   ```json
   { "qs": { "app_id": "your_adzuna_app_id", "app_key": "your_adzuna_app_key" } }
   ```
4. Save, then open `Fetch Adzuna Jobs` and set **Authentication** → Generic Credential Type → Custom Auth → `Adzuna Custom Auth`.

**Setting up the Apify credential, step by step:**
1. Sign in (or sign up) at [console.apify.com](https://console.apify.com).
2. Go to **Settings → Integrations** and copy your **API token**.
3. In n8n: **Credentials → New → Apify API**, paste the token, save.
4. Attach it to both `Fetch Indeed Jobs (Apify)` and `Fetch LinkedIn Jobs (Apify Native)` — same token, two actors (`misceres/indeed-scraper` and `practicaltools/linkedin-jobs`).

**Setting up the Gmail OAuth2 credential, step by step:**
1. In n8n: **Credentials → New → Gmail OAuth2 API**.
2. Click through Google's consent flow and authorize the account that should hold the drafts.
3. Save, then open `Create Gmail Draft` and select this credential.
4. No key to copy — this is an interactive OAuth login, not a static token.

### 3. Frontend environment variables

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

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
3. Create the results spreadsheet (or reuse one) with its 3 required tabs — see `workflow/SETUP.md` for the exact layout. Then open each of those 7 nodes and pick that spreadsheet in its document field — the ID isn't a credential, it's set per-node.

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

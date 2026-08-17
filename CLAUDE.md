# Job Agent — n8n Workflow → Deployed App

## Purpose

Turn n8n workflows into real, deployed web apps. The pipeline: validate the workflow's data in/out → build and test a Next.js frontend locally against it → push to GitHub → Vercel auto-deploys from the GitHub repo.

This repo (`job-agent/claude/`, GitHub: `Job-Find`) is dedicated to a single project — the job-search app. It inherits general n8n conventions (MCP tool reference, nodeType formats, expression syntax, validation profiles, safety rules) from the parent [`n8n/CLAUDE.md`](../../CLAUDE.md) — this file only covers what's specific to the app pipeline.

## Project Structure

Flat — this repo holds one app, so its workflow notes and frontend code sit directly at the root, no per-project wrapper folder:

```
job-agent/claude/
  CLAUDE.md
  README.md
  workflow/     # exported n8n workflow JSON backup / notes
  frontend/     # Next.js + React app
```

Keep it lean: nothing lives at the root except `CLAUDE.md`, `README.md`, `workflow/`, and `frontend/`. Delete throwaway test/debug files (and superseded workflow backups) as soon as they've served their purpose — don't accumulate them in `workflow/`.

## Tools & Access

- **n8n MCP** — read/validate/edit workflows in the n8n instance
- **GitHub MCP** — push commits once the frontend is verified locally (add via `claude mcp` if not yet configured)
- **Skills**: the 7 n8n skills (expressions, patterns, validation, node config, code) + `frontend-design` for UI/UX decisions

## The Pipeline

| Stage | What happens | Key checks |
|-------|--------------|------------|
| **1. Validate workflow** | Confirm the n8n workflow is app-ready before touching frontend code | Webhook trigger accepts the exact payload shape the app will send; final response node returns JSON shaped for direct frontend consumption; run `validate_workflow` / `n8n_test_workflow` end-to-end |
| **2. Build & test frontend** | Build the Next.js/React app in `frontend/`, running locally against the n8n dev webhook | Full request → response → render loop tested locally; use `frontend-design` skill for UI decisions |
| **3. Ship** | Push `frontend/` to GitHub via GitHub MCP; Vercel is connected for auto-deploy on push | One-time Vercel↔GitHub connection is all that's needed — no manual deploy step after that |

Work through the stages in order — don't start frontend work on a workflow that hasn't been validated, and don't push to GitHub until the frontend has been tested locally.

## Conventions

- Never hardcode webhook URLs or secrets in frontend code — use environment variables (`.env.local` locally, matching env vars in the Vercel project settings)
- Each push to GitHub should represent a locally-verified, working state — Vercel will deploy whatever lands on the tracked branch

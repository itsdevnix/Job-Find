# Job Agent — n8n Workflow → Deployed App

## Purpose

Turn n8n workflows into real, deployed web apps. The pipeline: validate the workflow's data in/out → build and test a Next.js frontend locally against it → push to GitHub → Vercel auto-deploys from the GitHub repo.

This folder (`job-agent/claude/`) is the full project root for this build. It inherits general n8n conventions (MCP tool reference, nodeType formats, expression syntax, validation profiles, safety rules) from the parent [`n8n/CLAUDE.md`](../../CLAUDE.md) — this file only covers what's specific to the app pipeline.

## Project Structure

Organized per-project, not per-artifact-type. Each app this pipeline produces gets its own folder containing everything for that app — its workflow backup/notes and its frontend code together:

```
job-agent/claude/
  CLAUDE.md
  job-search/
    workflow/     # exported n8n workflow JSON backup / notes for this app
    frontend/     # Next.js + React app for this app
  <next-project>/
    workflow/
    frontend/
```

Keep it lean: nothing lives at the `claude/` root except `CLAUDE.md` and one folder per project. Within a project folder, `frontend/` is the only app-code directory — workflow exports/notes go in `workflow/`, never mixed into `frontend/`. Delete throwaway test/debug files as soon as they've served their purpose.

## Tools & Access

- **n8n MCP** — read/validate/edit workflows in the n8n instance
- **GitHub MCP** — push commits once the frontend is verified locally (add via `claude mcp` if not yet configured)
- **Skills**: the 7 n8n skills (expressions, patterns, validation, node config, code) + `frontend-design` for UI/UX decisions

## The Pipeline

| Stage | What happens | Key checks |
|-------|--------------|------------|
| **1. Validate workflow** | Confirm the n8n workflow is app-ready before touching frontend code | Webhook trigger accepts the exact payload shape the app will send; final response node returns JSON shaped for direct frontend consumption; run `validate_workflow` / `n8n_test_workflow` end-to-end |
| **2. Build & test frontend** | Build the Next.js/React app in `<project>/frontend/`, running locally against the n8n dev webhook | Full request → response → render loop tested locally; use `frontend-design` skill for UI decisions |
| **3. Ship** | Push that project's `frontend/` to GitHub via GitHub MCP; Vercel is connected for auto-deploy on push | One-time Vercel↔GitHub connection per project is all that's needed — no manual deploy step after that |

Work through the stages in order — don't start frontend work on a workflow that hasn't been validated, and don't push to GitHub until the frontend has been tested locally. Each project (`job-search/`, and whatever comes next) moves through the pipeline and ships independently of the others.

## Conventions

- Never hardcode webhook URLs or secrets in frontend code — use environment variables (`.env.local` locally, matching env vars in the Vercel project settings)
- Each push to GitHub should represent a locally-verified, working state — Vercel will deploy whatever lands on the tracked branch

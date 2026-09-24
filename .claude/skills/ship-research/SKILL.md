---
name: ship-research
description: How to change, test, and release this repository (the 手入れ garden app on Vercel and the 聴く design-research tool on GitHub Pages) at zero cost — branch, `npm run check`, mock-based E2E, PR, CI, merge, and verifying both deployments. Use this whenever you edit anything in this repo and are about to commit, open or merge a PR, deploy, fix CI, touch `.github/workflows/`, `api/`, `research/`, `figma-plugin/` or the Vite configs, or when the user says "マージして", "デプロイして", "リリース", "CIが落ちた", "本番に出して", even if they don't mention CI.
---

# Shipping this repo

Two sites come out of one repository, and they must stay separate:

| What | Where | Deployed by |
|---|---|---|
| 手入れ (garden app) + the API (`/api/claude`, `/api/identify`, `/api/jev`, `/api/analyze`) | Vercel — `https://teire-app.vercel.app` | Vercel's Git integration on every push to `main` (previews for PRs) |
| 聴く (design research tool, `research/`) | GitHub Pages — `https://ryuwryyy.github.io/niwa-sorairo/` | `.github/workflows/pages.yml` on push to `main` |

The research page is *not* part of the garden build; `/research` on Vercel only redirects to Pages.
The Pages site calls the Vercel API cross-origin; `api/_cors.js` allows only `https://ryuwryyy.github.io`
(override with the `RESEARCH_ORIGINS` env var on Vercel). Keys (`ANTHROPIC_API_KEY`, `TYPESAFE_API_KEY`, `BRAVE_API_KEY`)
live only in Vercel env vars / `.env.local` — never in client code, never with a `VITE_` prefix.

## The cost rule

Everything automated here is free: public-repo GitHub Actions, Vercel Hobby, GitHub Pages. The only thing
that costs money is calling Jev, Claude, or Brave Search, so **no test, CI job, or smoke check may reach the real APIs**.
Tests swap `fetch` or point the official SDKs elsewhere (`TYPESAFE_BASE_URL`, `ANTHROPIC_BASE_URL`, `BRAVE_BASE_URL`) at the
fakes in `tests/e2e/mocks.mjs`. The post-deploy smoke test only sends `{}` bodies that fail input
validation before any upstream call. Keep it that way when you add endpoints: validate first, call upstream last.

## Workflow

1. **Branch** from the latest `main`.
2. **Change**, then run the fast checks — they are exactly what CI runs:
   ```bash
   npm run check     # unit tests + garden build + research build + FigJam plugin syntax
   npm run e2e       # 3 screens in Chromium against fake Jev/Claude (needs playwright, see below)
   ```
   For E2E locally: `npm i --no-save playwright@1.56` once; in a Claude Code cloud container also set
   `CHROMIUM_PATH=/opt/pw-browsers/chromium` (don't run `playwright install` there). Screenshots land in
   `e2e-artifacts/` — look at them after UI changes; the checks don't judge layout.
3. **Add tests** for new logic in `tests/*.test.js` (`node:test`, no extra deps). Pure functions from
   `research/src/lib/` and the `api/_*-core.js` handlers are the easy, valuable targets.
4. **Commit, push, open a PR.** CI (`.github/workflows/ci.yml`) runs `check` and `e2e`; Vercel posts a preview.
5. **Merge** only when CI is green — and then do merge, without asking: the repo owner has authorized merging and
   deploying your PRs once `check` and `e2e` pass. `.github/workflows/automerge.yml` does the same on its own for
   `claude/*` PRs after CI succeeds (it skips PRs labelled `hold`, and PRs that got a new push after CI), then
   re-dispatches `pages.yml` because merges made with `GITHUB_TOKEN` don't trigger other workflows. After merge:
   - Vercel deploys `main`; `.github/workflows/smoke.yml` runs on the `deployment_status` event and checks the
     top page, that both research APIs answer 400/501 (not 5xx), and the CORS header for Pages. Production is
     checked on the public domain (`vars.PRODUCTION_URL`, default `https://teire-app.vercel.app`) because
     Vercel's per-deployment URLs sit behind login protection (302) even in production; protected previews are
     skipped. Run it by hand with `workflow_dispatch` (`mcp__github__actions_run_trigger` → `run_workflow`, `smoke.yml`, ref `main`).
   - `pages.yml` rebuilds the research site if `research/`, the research Vite config, or dependencies changed.
6. **Verify**: open the Actions tab (or `mcp__github__actions_list`) for the smoke and Pages runs, and report
   the two URLs to the user.

## Checking the real keys

The smoke test only proves keys are *present* (400 instead of 501). To prove they *work*, run
`.github/workflows/live-check.yml` by hand (`workflow_dispatch`): it sends one minimal real request each to Brave,
Jev and Claude through production and prints the results. It costs one Brave query, one Jev item and one Claude call,
so run it only after changing keys or when the user reports the APIs failing.

## One-time settings (the user does these in the browser; you can't)

- GitHub → Settings → Pages → Source: **GitHub Actions** (otherwise `pages.yml` fails at deploy).
- Vercel → Environment Variables: `TYPESAFE_API_KEY`, `ANTHROPIC_API_KEY`, `BRAVE_API_KEY` (Production and Preview).
- Optional repo variable `RESEARCH_API_BASE` if the Vercel domain changes.

## When CI fails

Reproduce locally with the same command first (`npm run check` / `npm run e2e`), fix the cause, rerun, then
push. A red E2E usually means a UI text or role the test selects by changed — update the test only if the new
text is intended. Never skip or delete a test to get green, and never "fix" CI by adding a real API key to it.

The `release-checker` agent (`.claude/agents/release-checker.md`) runs this whole pre-merge check and
reviews the diff for key leaks and paid calls; use it before merging larger changes.

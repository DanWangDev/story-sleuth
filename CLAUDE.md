# Story Sleuth — AI-Powered 11+ Reading Comprehension Trainer

## Project Overview

Story Sleuth is the third app in the Lab F 11+ suite alongside vocab-master (vocabulary) and writing-buddy (creative writing coaching). It replaces Bond/CGP paper practice books with an AI-coached reading comprehension experience.

Target user: UK students aged 10-11 preparing for 11+ selective grammar school entrance exams (CEM, GL, ISEB question styles).

Connected to 11plus-hub via OIDC for auth and subscription management.

## Design System

**Always read DESIGN.md before making any visual or UI decisions.**

All font choices, colors, spacing, and aesthetic direction are defined in DESIGN.md. Do not deviate without explicit user approval.

Design thesis: **"The passage is real literature. Design the page like a book, not a SaaS product."**

Key constraints:
- Fonts: Literata (passage body), Source Sans 3 (UI), IBM Plex Mono (timer/data). Never Inter/Roboto/Arial/system defaults.
- Accent color: `#2E6B5E` (deep teal). Never purple/violet/indigo.
- Wrong answers: amber (`#B8713A`), never red. Wrong = learning moment, not punishment.
- 48px minimum touch targets.
- 16px min body, 19px passage body with 1.65 line-height, ~65ch line length.
- No AI-slop patterns (no 3-column feature grids, no icons-in-circles, no centered-everything, no emoji decoration).

In QA mode, flag any code that doesn't match DESIGN.md.

## Tech Stack (planned — design doc at ~/.gstack/projects/story-sleuth/)

- **Runtime:** Node.js, TypeScript (strict)
- **Backend:** Express, PostgreSQL (not SQLite — passages are large text blobs), repository pattern abstraction
- **Frontend:** React + Vite + Tailwind
- **Auth:** OIDC via `@danwangdev/auth-client` (shared with writing-buddy), hub-signed JWT
- **LLM:** Multi-provider (Qwen default, Anthropic/OpenAI/Ollama optional), admin-configurable via `/admin/settings`
- **Testing:** Vitest + supertest (backend), @testing-library/react (frontend), Playwright (E2E)
- **Deploy:** Docker Compose + Cloudflare Tunnel (same pattern as writing-buddy)

## Project Structure (planned)

```
story-sleuth/
├── content/passages/      # 10 hand-curated Gutenberg manifests (existing)
├── packages/
│   ├── shared/            # Zod schemas, types (Question, Passage, Session, StudentAttempt)
│   ├── backend/           # Express API + content pipeline + admin endpoints
│   └── frontend/          # React SPA (student + admin)
├── e2e/                   # Playwright end-to-end tests
├── DESIGN.md              # Design system source of truth
├── TODOS.md               # Captured deferred work
├── docker-compose.yml     # Production deploy
└── deploy.sh              # One-command redeploy
```

## Architecture Highlights (full details in design doc)

- **Content pipeline:** admin-triggered ingest. Fetches passage text from Gutenberg URL, runs LLM question generation with 3-layer validation (JSON parse → Zod schema → content sanity). Questions created as `draft` → admin reviews → `published`.
- **Two-tier coaching:** pre-generated per-option explanations (instant, free to serve) + live LLM only for student-requested walk-throughs. Rate-limited to 10/min/user.
- **Immutable passage snapshots:** versioned. Re-ingest creates a new version. `student_attempts` pin to version so adaptive training signal stays correct.
- **No local user data:** thin `user_mapping` table maps hub's OIDC `sub` → local FK. Stats API endpoint (`/api/stats/:hubUserId`) authenticated via hub-signed service JWT.
- **Session semantics:** per-question writes for resume support. Stats queries dedupe via window function (most recent attempt per user/question pair).

## Phased Plan

- **Phase 1:** Content pipeline + practice mode + admin UI + stats API.
- **Phase 2:** Test mode + adaptive engine + parent dashboard integration.
- **Phase 3:** Cross-app intelligence (shared weakness taxonomy across vocab-master, writing-buddy, story-sleuth via 11plus-hub).

## Workflow Rules

**Never commit or push directly to `main`.** Every change — features, bug fixes, docs updates, README tweaks, everything — goes via a feature branch and a pull request. No exceptions.

Branch naming:
- `feat/<short-description>` — new features
- `fix/<short-description>` — bug fixes
- `chore/<short-description>` — infra, CI, configs, dependency bumps
- `docs/<short-description>` — documentation-only changes
- `refactor/<short-description>` — code reshaping without behavior change
- `test/<short-description>` — test-only additions or fixes

**PR + CI rules:**
- Open a PR after pushing the branch (`gh pr create`).
- After opening the PR, check CI status: `gh pr checks` or `gh run watch`.
- **CI must be fully green before the PR is ready.** No failures AND no warnings. Read the run logs and fix anything you see — warnings included. Flaky tests are bugs; fix them, don't ignore them.
- Only after CI is green should the PR be considered ready for review / merge.

## Monorepo Structure

Story-sleuth separates frontend and backend the same way vocab-master and writing-buddy do:

```
packages/
├── shared/      # Zod schemas, shared TypeScript types (Question, Passage, Session, StudentAttempt)
├── backend/     # Express API, content pipeline, admin endpoints (own Dockerfile)
└── frontend/    # React SPA, student + admin UI (own Dockerfile + nginx)
```

Each package has its own `package.json`, `tsconfig.json`, and `Dockerfile`. The root `package.json` uses npm workspaces. The `docker-compose.yml` builds `backend` and `frontend` as separate services.

## Container Publishing

CI publishes Docker images to GitHub Container Registry on every push to `main`:
- `ghcr.io/danwangdev/story-sleuth-backend`
- `ghcr.io/danwangdev/story-sleuth-frontend`

Images are tagged with the commit SHA (always) and `latest` (on main only). Authentication uses `GITHUB_TOKEN` (no extra secrets required). Pulls require `packages: read` permission on the registry.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health

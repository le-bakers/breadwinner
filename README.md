# BreadWinner

A student-built Congressional App Challenge prototype for US adults to organize
gluten-free receipts and review extra-cost estimates. Results are not tax or medical
advice. Use synthetic receipts for demonstrations.

## Setup

1. Create a Python 3.12+ virtual environment; install `backend/requirements-dev.txt`.
2. Copy `backend/.env.example` to `backend/.env`, fill in your Supabase public project
   settings and Kroger keys, and run `backend/database.sql` in the intended Supabase
   project. Match the project configured in `frontend/cloud.ts`.
3. In `frontend`, run `npm ci`, then `npm run build`. This compiles TypeScript, bundles
   Supabase, and packages only public assets into `_site`.
4. For localhost, build with `BW_LOCAL_DEV=1` (PowerShell: `$env:BW_LOCAL_DEV='1'`),
   run `python -m uvicorn server:app --app-dir backend --port 8000`, and serve
   `frontend/_site` on port 5500. Backend `.env` is loaded relative to the backend
   files, so starting from the repo root works. Sign in with a real test account.
   Production scanners require authentication; changing a browser flag cannot bypass it.

## Verification

From `backend`: `python -m pytest -q` (offline, no provider calls).
From `frontend`: `npm run check`, `npm run build`, `npm test`, `npm audit`.
Python advisories: `python -m pip_audit -r backend/requirements.txt` from the root.

Read [SECURITY.md](SECURITY.md) for **required deployment settings and database
migration**, and [legal readiness](docs/LEGAL_READINESS.md) for US prototype context
and the remaining operator/contest checks. Changes in this checkout do not apply
the SQL to a hosted database or change provider settings automatically.

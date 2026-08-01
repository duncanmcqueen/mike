# End-to-end tests in CI

The Playwright suite (`e2e/`) runs through `.github/workflows/e2e.yml`.
It boots the backend against local SQLite, starts the frontend, creates test
users through Mike's own `/user/auth/signup` endpoint, and then runs the browser
specs.

## What the workflow does

On `pull_request` to `main` / `upstream-main`, and on manual
`workflow_dispatch`, the `e2e / playwright` job:

1. installs root, backend, and frontend dependencies;
2. starts MinIO for S3-compatible document storage;
3. writes `backend/.env` with SQLite database paths under `$RUNNER_TEMP`,
   high E2E rate limits, signing/encryption test secrets, MinIO credentials,
   and any available `ANTHROPIC_API_KEY`;
4. writes `frontend/.env.local` with `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001`;
5. builds the frontend, starts backend `:3001` and frontend `:3000`, waits for
   both, then runs `npx playwright test`;
6. uploads the Playwright report and traces.

`e2e/auth.setup.ts` creates the shared users idempotently through the backend
auth API. A 409 from signup means the user already exists and is treated as
success.

## Optional LLM Secret

| Secret | What it unlocks | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY` | LLM-dependent chat/critical-path specs send real messages and assert streamed answers. | Those specs skip via `e2e/llm.ts`; the rest of the suite still runs. |

Add it in GitHub under **Settings > Secrets and variables > Actions** with the
exact name `ANTHROPIC_API_KEY`.

Fork PRs do not receive repository secrets, so they run the keyless path.

## Running Locally

```bash
npm ci
npm ci --prefix backend
npm ci --prefix frontend
npx playwright install --with-deps chromium
npm run test:e2e:local
```

`npm run test:e2e:local` writes local SQLite env values and runs Playwright.
For only env setup:

```bash
bash scripts/e2e-local-stack.sh --setup-only
```

Then start the backend/frontend normally and run:

```bash
npm run test:e2e
```

## Merge Blocking

To make E2E failures block merges, mark the workflow job `e2e / playwright` as
a required status check in the repository's branch protection rule.

# Mike

![Mike](https://mikeoss.com/link-image.jpg)

Mike or MikeOSS is a legal AI platform that is able to assist you with document
review, drafting and legal research.

It has a Next.js frontend, an Express backend, selectable Supabase or SQLite
persistence/authentication, selectable Cloudflare R2 or SQLite file storage,
and configurable AI model providers.

Website: [mikeoss.com](https://mikeoss.com)

## Features

- **Document review, drafting, and research** — project and standalone
  document chat, tabular review, workflows, document versions, and DOCX/PDF
  handling.
- **Selectable infrastructure providers** — run fully self-contained on
  SQLite (database, auth, and file storage) with Node 22+, or use the
  upstream Supabase + Cloudflare R2 profile. See
  [deployment modules](docs/deployment-modules.md).
- **Optional deployment modules** — enable only the product surfaces you
  want with the `MIKE_ENABLED_MODULES` allow-list.
- **Model orchestration** — Anthropic, Gemini, OpenAI, and Kimi cloud
  models, local OpenAI-compatible servers (with streaming tool calling and
  reasoning channels), and multi-model committee orchestration. See
  [model orchestration](docs/model-orchestration.md).
- **Legal monitors** — scheduled classify → gap-check → memo-draft → digest
  pipelines over RSS/Atom feeds and connector sources, with run history,
  captured documents, email alerts, and bundled presets (Fintech GC
  Regulatory Digest, trademark monitoring). See
  [legal monitor sources](docs/legal-monitor-sources.md).
- **Playbooks** — reusable contract-review playbooks with versioning, run
  history, Word export, and document imports. See
  [playbooks](docs/playbooks.md).
- **Prompt library** — per-user saved prompts plus a built-in example
  library, available from the assistant composer. See
  [prompt library](docs/prompt-library.md).
- **Gmail integration** — per-user OAuth connection for mailbox search and
  reading in chat, importing emails as DOCX documents, and sending Monitor
  alerts. See [Gmail integration](docs/gmail-integration.md).
- **USPTO patent and trademark connector** — a managed local MCP connector
  that runs the open-source `patent_mcp_server` with per-tool enablement
  and audit controls. See
  [enabling the patent MCP server](docs/patent-mcp-connector.md).
- **Microsoft Word add-in** — task-pane add-in for chat, tracked edits,
  comments, project documents, workflows, tabular reviews, local models,
  and committee models. See [Word add-in setup](docs/word-addin.md).
- **CourtListener and Ironclad integrations** — US case-law lookup and
  citation verification; contract search and import from Ironclad CLM.
- **Account controls** — TOTP multi-factor authentication, per-user feature
  flags, dark mode, per-user model API keys, and support feedback.

## Contents

- `frontend/` - Next.js application
- `backend/` - Express API, provider-neutral data access, document processing, and model routing
- `word-addin/` - Microsoft Word task-pane add-in
- `docs/deployment-modules.md` - deployment profiles and optional-module allow-list
- `docs/model-orchestration.md` - local OpenAI-compatible and committee model setup
- `docs/legal-monitor-sources.md` - legal monitor feeds, connector sources, and presets
- `docs/playbooks.md` - contract-review playbooks
- `docs/prompt-library.md` - saved prompts and the built-in example library
- `docs/gmail-integration.md` - Gmail OAuth, email import, assistant tools, and Monitor delivery
- `docs/patent-mcp-connector.md` - enabling the managed USPTO patent and trademark MCP connector
- `docs/word-addin.md` - Word add-in development, sideloading, and deployment

## System Workflows

Mike's system assistant and tabular review workflows are maintained in the
[`Open-Legal-Products/mike-workflows`](https://github.com/Open-Legal-Products/mike-workflows)
repository.

## Prerequisites

- Node.js 20 or newer; Node.js 22 or newer for the SQLite providers
- npm
- git
- At least one supported model provider API key, or a local OpenAI-compatible server
- Optional: a CourtListener API token for case law lookup and citation verification
- Optional: [`uv`](https://docs.astral.sh/uv/getting-started/installation/) for the USPTO patent/trademark connector
- LibreOffice installed locally if you need DOC/DOCX to PDF conversion

## Environment

Create local env files:

```bash
touch backend/.env
touch frontend/.env.local
```

Create `backend/.env`:

```bash
PORT=3001
FRONTEND_URL=http://localhost:3000
DOWNLOAD_SIGNING_SECRET=replace-with-a-random-32-byte-hex-string
MIKE_ENABLED_MODULES=all

# Self-contained local profile. Supabase Auth/database and R2 remain the
# upstream-compatible defaults documented in backend/.env.example.
MIKE_DATABASE_PROVIDER=sqlite
MIKE_AUTH_PROVIDER=local
MIKE_STORAGE_PROVIDER=sqlite
SQLITE_DB_PATH=./data/mike.sqlite
SQLITE_STORAGE_PATH=./data/mike-files.sqlite

GEMINI_API_KEY=your-gemini-key
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key
RESEND_API_KEY=your-resend-key
USER_API_KEYS_ENCRYPTION_SECRET=your-long-random-secret

# Optional: enables Kimi K3/K3-256K as cloud model options.
KIMI_API_KEY=your-kimi-code-api-key

# Optional: enables CourtListener case law and citation tools.
COURTLISTENER_API_TOKEN=your-courtlistener-token

# Optional: where support-form feedback is emailed when RESEND_API_KEY is set.
SUPPORT_INBOX_EMAIL=you@example.com

# Optional: enables the Ironclad CLM integration (contract search + import).
IRONCLAD_API_KEY=your-ironclad-bearer-token
IRONCLAD_BASE_URL=https://na1.ironcladapp.com
# Optional: actor email for client-credentials tokens (defaults to the
# signed-in Mike user's email per request).
IRONCLAD_AS_USER_EMAIL=you@example.com

# Optional: enables per-user Gmail search, import, and Monitor sending.
GMAIL_CLIENT_ID=your-google-oauth-client-id
GMAIL_CLIENT_SECRET=your-google-oauth-client-secret
GMAIL_REDIRECT_URI=http://localhost:3001/integrations/gmail/oauth/callback

# Optional: unlocks USPTO Open Data Portal and TSDR tools in the managed
# patent/trademark connector. Public search tools work without these keys.
USPTO_API_KEY=your-uspto-open-data-portal-key
TSDR_API_KEY=your-uspto-tsdr-key
```

`FRONTEND_URL` must exactly match the origin the browser uses to reach the
frontend — it is enforced for CORS, so a mismatched port or host makes every
API request from the browser fail with a network error.

Create `frontend/.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
NEXT_PUBLIC_MIKE_AUTH_PROVIDER=local
```

Next.js embeds `NEXT_PUBLIC_*` values in the browser bundle at build time, so
they must be set when running `npm run build --prefix frontend` — setting them
only when starting an already-built application is too late.
`NEXT_PUBLIC_API_BASE_URL` is always required for production builds; the
Supabase profile (`NEXT_PUBLIC_MIKE_AUTH_PROVIDER` unset or `supabase`)
additionally requires `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` from the Supabase project
dashboard. Production builds fail with a list of missing variables instead of
producing a bundle that cannot connect to the backend.

See [optional deployment modules](docs/deployment-modules.md) for the module
allow-list and complete upstream/local deployment examples.

Provider keys are only needed for the models, legal research, and email
features you plan to use. Model provider keys and the CourtListener token can be
configured in `backend/.env` for the whole instance, or per user in
**Account > Models & API Keys**.

For local OpenAI-compatible models and committee orchestration, see
`docs/model-orchestration.md`.

## Install

Install each app package:

```bash
npm install --prefix backend
npm install --prefix frontend
npm install --prefix word-addin
```

The backend depends on `xlsx` served from the SheetJS CDN rather than the npm
registry. npm 12 and newer blocks remote tarball dependencies by default; the
committed `backend/.npmrc` (`allow-remote=root`) re-enables them for the
backend's direct dependencies, so the install works out of the box. Older npm
versions ignore the setting.

## Run Locally

Start the backend:

```bash
npm run dev --prefix backend
```

Start the main app:

```bash
npm run dev --prefix frontend
```

Open `http://localhost:3000`.

The SQLite database and file store are created automatically on first boot at
`SQLITE_DB_PATH` / `SQLITE_STORAGE_PATH`; no seed database or migration step is
required for the local profile.

### Microsoft Word

MikeOSS includes a Word task-pane add-in for chat, tracked edits, comments,
project documents, workflows, tabular reviews, local models, and committee
models. See [Word add-in setup](docs/word-addin.md) for HTTPS development,
sideloading, and production deployment instructions.

## First Run

1. Sign up in the app. The selected authentication provider manages the
   account and session; the local profile stores them in `SQLITE_DB_PATH`.
2. If you did not set provider keys in `backend/.env`, open
   **Account > Models & API Keys** and add an Anthropic, Gemini, OpenAI, or
   CourtListener key as needed.
3. Create or open a project and start chatting with documents.

## Legal Monitors

Mike can run scheduled monitors that pull RSS/Atom feeds and connector
sources, classify new items, and escalate material developments into saved
reports and email alerts. Open **Monitors** to create a monitor from scratch
or install a bundled preset (**Fintech GC Regulatory Digest**, trademark
monitoring). Each run keeps history, deduplicates and checkpoints items, and
can capture source documents. See the
[legal monitor sources guide](docs/legal-monitor-sources.md).

## Playbooks

Reusable contract-review playbooks live under **Playbooks**: define positions
once, run them against documents in chat via the playbook picker, export
results to Word, and import existing playbook documents. Playbooks are
versioned and keep run history. See [playbooks](docs/playbooks.md).

## Prompt Library

**Prompts** stores per-user saved prompts alongside a built-in example
library, and the assistant composer can insert them directly. See the
[prompt library guide](docs/prompt-library.md).

## CourtListener Integration

Mike can use CourtListener for US case law citation verification, case fetching,
targeted opinion search, and case-law panels in assistant responses.

To enable live CourtListener access, set `COURTLISTENER_API_TOKEN` in
`backend/.env` and restart the backend. Users can also add their own
CourtListener token from **Account > Models & API Keys** when the instance does
not provide one globally.

If you do not import bulk data, leave `COURTLISTENER_BULK_DATA_ENABLED=false`;
live CourtListener tools still work with a valid token, subject to
CourtListener rate limits.

## Ironclad Integration

Mike can connect to an Ironclad CLM account so contracts stored in Ironclad
can be used as data sources. Set `IRONCLAD_API_KEY` (and optionally
`IRONCLAD_BASE_URL` / `IRONCLAD_AS_USER_EMAIL`) in `backend/.env` and restart
the backend.

Once configured:

- **Import** records as Mike documents from any document picker via
  **Import from Ironclad**: search your records, pick an attachment (the
  signed copy or any other attachment on the record), and import it into a
  project or as a standalone document. Imported contracts work everywhere
  documents do — chat, tabular review, versions (recorded with source
  `ironclad`).
- **Chat tools**: the assistant can search Ironclad records, inspect record
  metadata and attachments, and import contracts mid-conversation when it
  helps answer a question.

OAuth scopes required on the Ironclad token: `public.records.readRecords`
and `public.records.readAttachments`. Tokens from the client-credentials
grant also need an actor user — set `IRONCLAD_AS_USER_EMAIL`, or Mike sends
the signed-in user's email as `x-as-user-email`.

## Gmail Integration

Mike can optionally search and read a connected Gmail mailbox, import an email
as a Mike DOCX document, and send material Monitor alerts from that mailbox.
Configure the Google OAuth client in `backend/.env`, then enable and connect the
mailbox under **Account > Features > Email Integration**. See the complete
[Gmail integration guide](docs/gmail-integration.md).

## Patent And Trademark Connector

Mike includes a managed local connector for the open-source
[`patent_mcp_server`](https://github.com/riemannzeta/patent_mcp_server).
To enable it:

1. Install [`uv`](https://docs.astral.sh/uv/getting-started/installation/) and
   restart the backend.
2. Open **Account > Connectors** and select **USPTO**.
3. Wait for the first launch to download the pinned server (about a minute),
   then review the imported tools in the connector details.

Mike runs the pinned server over stdio and imports its tools into the existing
per-tool enablement and audit controls. Public patent and trademark search
tools work without credentials; add `USPTO_API_KEY` / `TSDR_API_KEY` to unlock
the credentialed data sources. See the complete
[patent MCP server guide](docs/patent-mcp-connector.md).

## Multi-Factor Authentication

Mike supports local TOTP MFA (RFC 6238) with any standard authenticator app.
Enroll under **Account > Security**, then optionally enable **Require
verification on login**. Sessions are split into password-only (aal1) and
verified (aal2); API routes reject aal1 sessions until the TOTP code is
verified. Removing your last verified factor automatically turns the
login requirement off. `USER_API_KEYS_ENCRYPTION_SECRET` must be set — it
also encrypts the TOTP secrets at rest.

## Troubleshooting

**`npm install --prefix backend` fails with `Fetching packages of type
"remote" have been disabled`.** Your npm config overrides the committed
`backend/.npmrc`. Run the install with `npm install --prefix backend
--allow-remote=root`, or remove the conflicting `allow-remote` setting from
your user-level npmrc.

**Every login or API call fails with "Failed to fetch".** `FRONTEND_URL` in
`backend/.env` does not match the browser origin of the frontend (protocol,
host, and port must be identical). Fix it and restart the backend.

**The backend exits with a `node:sqlite` error.** The SQLite providers require
Node 22 or newer. Check `node --version`.

**The model picker shows a missing-key warning.** Add a key for that provider in
**Account > Models & API Keys**, configure the provider key in `backend/.env`,
or configure a local OpenAI-compatible model.

**CourtListener tools say the API token is missing.** Set
`COURTLISTENER_API_TOKEN` in `backend/.env`, or add a CourtListener token in
**Account > Models & API Keys** for the signed-in user. Restart the backend
after changing `.env`.

**DOC or DOCX conversion fails.** Install LibreOffice locally and restart the
backend so document conversion commands are available on the process path.

## Useful Checks

```bash
npm run build --prefix backend
npm run build --prefix frontend
npm run lint --prefix frontend
```

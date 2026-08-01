#!/usr/bin/env bash
# Prepare local SQLite-backed E2E env files and run Playwright.
set -euo pipefail

SETUP_ONLY=0
if [ "${1:-}" = "--setup-only" ]; then
    SETUP_ONLY=1
    shift
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

set_kv() {
    local file=$1 key=$2 value=$3
    if grep -q "^${key}=" "$file" 2>/dev/null; then
        awk -v k="$key" -v v="$value" \
            'index($0, k"=") == 1 { print k "=" v; next } { print }' \
            "$file" >"$file.tmp" && mv "$file.tmp" "$file"
    else
        echo "${key}=${value}" >>"$file"
    fi
}

[ -f "$BACKEND/.env" ] || cp "$BACKEND/.env.example" "$BACKEND/.env"
set_kv "$BACKEND/.env" PORT 3001
set_kv "$BACKEND/.env" FRONTEND_URL "http://localhost:3000"
set_kv "$BACKEND/.env" SQLITE_DB_PATH "$BACKEND/data/e2e.sqlite"
set_kv "$BACKEND/.env" SQLITE_STORAGE_PATH "$BACKEND/data/e2e-files.sqlite"
set_kv "$BACKEND/.env" DOWNLOAD_SIGNING_SECRET "local-e2e-download-signing-secret-0123456789abcdef"
set_kv "$BACKEND/.env" USER_API_KEYS_ENCRYPTION_SECRET "local-e2e-user-api-keys-secret-0123456789abcdef"
set_kv "$BACKEND/.env" RATE_LIMIT_GENERAL_MAX 100000
set_kv "$BACKEND/.env" RATE_LIMIT_CHAT_MAX 100000
set_kv "$BACKEND/.env" RATE_LIMIT_CHAT_CREATE_MAX 100000
set_kv "$BACKEND/.env" RATE_LIMIT_UPLOAD_MAX 100000
set_kv "$BACKEND/.env" RATE_LIMIT_EXPORT_MAX 100000
set_kv "$BACKEND/.env" RATE_LIMIT_DATA_DELETE_MAX 100000

touch "$FRONTEND/.env.local"
set_kv "$FRONTEND/.env.local" NEXT_PUBLIC_API_BASE_URL "http://localhost:3001"

echo "Local SQLite E2E env ready."
if [ "$SETUP_ONLY" = "1" ]; then
    exit 0
fi

cd "$ROOT"
npx playwright test "$@"

/**
 * SQLite-backed document byte storage.
 *
 * The rest of the backend stores opaque storage keys on document_versions.
 * This module maps those keys to BLOB rows in a local SQLite database so the
 * application no longer depends on remote object storage for files.
 */

import fs from "node:fs";
import path from "node:path";
// node:sqlite is available in the Node 22 runtime used by this project, but
// older @types/node releases may not expose declarations for it yet.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { DatabaseSync } from "node:sqlite";
import { signDownload } from "./downloadTokens";

type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...values: unknown[]): unknown;
    get(...values: unknown[]): Record<string, unknown> | undefined;
    all(...values: unknown[]): Record<string, unknown>[];
  };
};

let cachedDb: SqliteDatabase | undefined;

function storageDbPath(): string {
  return (
    process.env.SQLITE_STORAGE_PATH?.trim() ||
    path.join(process.cwd(), "data", "mike-files.sqlite")
  );
}

function getDb(): SqliteDatabase {
  if (!cachedDb) {
    const dbPath = storageDbPath();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    cachedDb = new DatabaseSync(dbPath) as SqliteDatabase;
    cachedDb.exec(`
      create table if not exists file_storage (
        key text primary key,
        content blob not null,
        content_type text not null,
        size_bytes integer not null,
        created_at text not null default (datetime('now')),
        updated_at text not null default (datetime('now'))
      );
      create index if not exists idx_file_storage_key_prefix
        on file_storage(key);
    `);
  }
  return cachedDb;
}

export const storageEnabled = true;

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

export async function uploadFile(
  key: string,
  content: ArrayBuffer,
  contentType: string,
): Promise<void> {
  const buffer = Buffer.from(content);
  getDb()
    .prepare(
      `
      insert into file_storage (key, content, content_type, size_bytes, updated_at)
      values (?, ?, ?, ?, datetime('now'))
      on conflict(key) do update set
        content = excluded.content,
        content_type = excluded.content_type,
        size_bytes = excluded.size_bytes,
        updated_at = datetime('now')
    `,
    )
    .run(key, buffer, contentType, buffer.byteLength);
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

export async function downloadFile(key: string): Promise<ArrayBuffer | null> {
  const row = getDb()
    .prepare("select content from file_storage where key = ?")
    .get(key);
  const content = row?.content;
  if (!content) return null;
  const buffer = Buffer.isBuffer(content)
    ? content
    : Buffer.from(content as ArrayBuffer);
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

export async function listFiles(prefix: string): Promise<string[]> {
  return getDb()
    .prepare(
      "select key from file_storage where key like ? escape '\\' order by key asc",
    )
    .all(`${escapeLike(prefix)}%`)
    .map((row) => String(row.key));
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteFile(key: string): Promise<void> {
  getDb().prepare("delete from file_storage where key = ?").run(key);
}

// ---------------------------------------------------------------------------
// Download URL
// ---------------------------------------------------------------------------

export async function getSignedUrl(
  key: string,
  expiresIn = 3600,
  downloadFilename?: string,
): Promise<string | null> {
  return `/download/${signDownload(key, downloadFilename || path.basename(key), expiresIn)}`;
}

export function normalizeDownloadFilename(name: string): string {
  const trimmed = name.trim();
  const base = trimmed || "download";
  return base.replace(/[\x00-\x1F\x7F]/g, "_").replace(/[\\/]/g, "_");
}

export function sanitizeDispositionFilename(name: string): string {
  return normalizeDownloadFilename(name)
    .replace(/["\\]/g, "_")
    .replace(/[^\x20-\x7E]/g, "_");
}

export function encodeRFC5987(str: string): string {
  return encodeURIComponent(str).replace(
    /['()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

export function buildContentDisposition(
  kind: "inline" | "attachment",
  filename: string,
): string {
  const normalized = normalizeDownloadFilename(filename);
  return `${kind}; filename="${sanitizeDispositionFilename(normalized)}"; filename*=UTF-8''${encodeRFC5987(normalized)}`;
}

// ---------------------------------------------------------------------------
// Storage key helpers
// ---------------------------------------------------------------------------

export function storageKey(
  userId: string,
  docId: string,
  filename: string,
): string {
  return `documents/${userId}/${docId}/source${storageExtension(filename, ".bin")}`;
}

export function pdfStorageKey(
  userId: string,
  docId: string,
  stem: string,
): string {
  return `documents/${userId}/${docId}/${stem}.pdf`;
}

export function generatedDocKey(
  userId: string,
  docId: string,
  filename: string,
): string {
  return `generated/${userId}/${docId}/generated${storageExtension(filename, ".docx")}`;
}

export function versionStorageKey(
  userId: string,
  docId: string,
  versionSlug: string,
  filename: string,
): string {
  return `documents/${userId}/${docId}/versions/${versionSlug}${storageExtension(filename, ".bin")}`;
}

function storageExtension(filename: string, fallback: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot < 0) return fallback;
  const ext = filename.slice(lastDot).toLowerCase();
  return /^\.[a-z0-9]{1,16}$/.test(ext) ? ext : fallback;
}

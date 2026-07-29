import { createServerSQLite } from "./sqlite";
import { uploadFile, storageKey } from "./storage";
import {
    ALLOWED_DOCUMENT_TYPES,
    ALLOWED_DOCUMENT_TYPES_LABEL,
    contentTypeForDocumentType,
    shouldConvertToPdf,
} from "./documentTypes";
import { convertedPdfKey, docxToPdf } from "./convert";

type Db = ReturnType<typeof createServerSQLite>;

export type IngestedDocument = Record<string, unknown> & { id: string };

/**
 * Shared document-ingestion pipeline: stores bytes, builds the PDF
 * rendition, records V1 in document_versions, and marks the document ready.
 * Used by the multer upload routes and server-to-server imports (Ironclad).
 */
export async function createDocumentFromBytes(params: {
    userId: string;
    projectId: string | null;
    filename: string;
    content: Buffer;
    source?: string;
    db: Db;
}): Promise<
    | { ok: true; document: IngestedDocument }
    | { ok: false; status: number; detail: string }
> {
    const { userId, projectId, filename, content, db } = params;
    const source = params.source ?? "upload";
    const suffix = filename.includes(".")
        ? filename.split(".").pop()!.toLowerCase()
        : "";
    if (!ALLOWED_DOCUMENT_TYPES.has(suffix)) {
        return {
            ok: false,
            status: 400,
            detail: `Unsupported file type: ${suffix}. Allowed: ${ALLOWED_DOCUMENT_TYPES_LABEL}`,
        };
    }

    const { data: doc, error: insertErr } = await db
        .from("documents")
        .insert({
            project_id: projectId,
            user_id: userId,
            status: "processing",
        })
        .select("*")
        .single();

    if (insertErr || !doc) {
        console.error("[documents/ingest] failed to create document row", {
            userId,
            projectId,
            filename,
            suffix,
            error: insertErr,
        });
        return { ok: false, status: 500, detail: "Failed to create document record" };
    }

    const docId = doc.id as string;
    try {
        const key = storageKey(userId, docId, filename);
        const contentType = contentTypeForDocumentType(suffix);
        const bytes = content.buffer.slice(
            content.byteOffset,
            content.byteOffset + content.byteLength,
        ) as ArrayBuffer;
        await uploadFile(key, bytes, contentType);

        const pageCount = suffix === "pdf" ? await countPdfPages(bytes) : null;

        // Convert Office files → PDF for display. PDFs are their own rendition.
        let pdfStoragePath: string | null = null;
        if (shouldConvertToPdf(suffix)) {
            try {
                const pdfBuf = await docxToPdf(content);
                const pdfKey = convertedPdfKey(userId, docId);
                await uploadFile(
                    pdfKey,
                    pdfBuf.buffer.slice(
                        pdfBuf.byteOffset,
                        pdfBuf.byteOffset + pdfBuf.byteLength,
                    ) as ArrayBuffer,
                    "application/pdf",
                );
                pdfStoragePath = pdfKey;
            } catch (err) {
                console.error(
                    `[ingest] Office→PDF conversion failed for ${filename}:`,
                    err,
                );
            }
        } else if (suffix === "pdf") {
            pdfStoragePath = key;
        }

        const { data: versionRow, error: verErr } = await db
            .from("document_versions")
            .insert({
                document_id: docId,
                storage_path: key,
                pdf_storage_path: pdfStoragePath,
                source,
                version_number: 1,
                filename: filename,
                file_type: suffix,
                size_bytes: content.byteLength,
                page_count: pageCount,
            })
            .select("id")
            .single();
        if (verErr || !versionRow) {
            throw new Error(
                `Failed to record upload version: ${verErr?.message ?? "unknown"}`,
            );
        }

        await db
            .from("documents")
            .update({
                current_version_id: versionRow.id,
                status: "ready",
                updated_at: new Date().toISOString(),
            })
            .eq("id", docId);

        const { data: updated } = await db
            .from("documents")
            .select("*")
            .eq("id", docId)
            .single();
        // Surface storage paths to the caller for backward compatibility.
        const responseDoc = updated
            ? {
                  ...updated,
                  filename,
                  storage_path: key,
                  pdf_storage_path: pdfStoragePath,
                  file_type: suffix,
                  size_bytes: content.byteLength,
                  page_count: pageCount,
                  active_version_number: 1,
              }
            : { id: docId };
        return { ok: true, document: responseDoc as IngestedDocument };
    } catch (e) {
        await db.from("documents").update({ status: "error" }).eq("id", docId);
        return {
            ok: false,
            status: 500,
            detail: `Document processing failed: ${String(e)}`,
        };
    }
}

export async function countPdfPages(buf: ArrayBuffer): Promise<number | null> {
    try {
        const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs" as string);
        const pdf = await (
            pdfjsLib as unknown as {
                getDocument: (opts: unknown) => {
                    promise: Promise<{ numPages: number }>;
                };
            }
        ).getDocument({ data: new Uint8Array(buf) }).promise;
        return pdf.numPages;
    } catch {
        return null;
    }
}

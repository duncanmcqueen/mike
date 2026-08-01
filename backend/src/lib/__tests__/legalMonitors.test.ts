import crypto from "node:crypto";
import { Document as WordDocument, Packer, Paragraph } from "docx";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    buildDingDuffFallbackCalls,
    createLegalMonitor,
    deleteLegalMonitor,
    getLegalMonitor,
    isDingDuffConnector,
    listLegalMonitors,
    runLegalMonitorLlmStage,
    updateLegalMonitor,
} from "../legalMonitors";
import { loadLegalMonitorDocumentContext } from "../legalMonitorDocuments";
import type { OpenAIToolSchema } from "../llm";
import { createServerSQLite } from "../sqlite";
import { deleteFile, uploadFile } from "../storage";

const createdMonitorIds: string[] = [];
const createdConnectorIds: string[] = [];
const createdDocumentIds: string[] = [];
const createdVersionIds: string[] = [];
const createdStoragePaths: string[] = [];

afterEach(async () => {
    const db = createServerSQLite();
    for (const monitorId of createdMonitorIds.splice(0)) {
        await db.from("legal_monitor_connector_items").delete().eq("monitor_id", monitorId);
        await db.from("legal_monitor_source_items").delete().eq("monitor_id", monitorId);
        await db.from("legal_monitor_sources").delete().eq("monitor_id", monitorId);
        await db.from("legal_monitor_runs").delete().eq("monitor_id", monitorId);
        await db.from("legal_monitors").delete().eq("id", monitorId);
    }
    for (const connectorId of createdConnectorIds.splice(0)) {
        await db.from("user_mcp_connector_tools").delete().eq("connector_id", connectorId);
        await db.from("user_mcp_connectors").delete().eq("id", connectorId);
    }
    for (const versionId of createdVersionIds.splice(0)) {
        await db.from("document_versions").delete().eq("id", versionId);
    }
    for (const documentId of createdDocumentIds.splice(0)) {
        await db.from("legal_monitor_documents").delete().eq("document_id", documentId);
        await db.from("documents").delete().eq("id", documentId);
    }
    for (const storagePath of createdStoragePaths.splice(0)) {
        await deleteFile(storagePath);
    }
});

async function seedLibraryDocument(
    userId: string,
    filename = "Risk policy.docx",
    text?: string,
) {
    const db = createServerSQLite();
    const documentId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const now = new Date().toISOString();
    createdDocumentIds.push(documentId);
    createdVersionIds.push(versionId);
    const storagePath = `documents/${userId}/${documentId}/source.docx`;
    if (text) {
        const bytes = await Packer.toBuffer(new WordDocument({
            sections: [{ children: [new Paragraph(text)] }],
        }));
        await uploadFile(storagePath, bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        createdStoragePaths.push(storagePath);
    }
    await db.from("documents").insert({
        id: documentId,
        user_id: userId,
        project_id: null,
        library_kind: "file",
        status: "ready",
        current_version_id: versionId,
        created_at: now,
        updated_at: now,
    });
    await db.from("document_versions").insert({
        id: versionId,
        document_id: documentId,
        storage_path: storagePath,
        pdf_storage_path: null,
        source: "upload",
        version_number: 1,
        filename,
        file_type: "docx",
        size_bytes: 1024,
        page_count: null,
        deleted_at: null,
        created_at: now,
        updated_at: now,
    });
    return documentId;
}

async function seedDingDuffConnector(userId: string) {
    const db = createServerSQLite();
    const connectorId = crypto.randomUUID();
    const now = new Date().toISOString();
    createdConnectorIds.push(connectorId);
    await db.from("user_mcp_connectors").insert({
        id: connectorId,
        user_id: userId,
        name: "DingDuff Legal Research",
        transport: "streamable_http",
        server_url: "https://dingduff.example.com/mcp",
        auth_type: "none",
        enabled: true,
        tool_policy: {},
        encrypted_auth_config: null,
        auth_config_iv: null,
        auth_config_tag: null,
        created_at: now,
        updated_at: now,
    });
    await db.from("user_mcp_connector_tools").insert({
        id: crypto.randomUUID(),
        connector_id: connectorId,
        tool_name: "search_cases",
        openai_tool_name: `dingduff_${connectorId.replaceAll("-", "").slice(0, 8)}_search_cases`,
        title: "Search cases",
        description: "Search DingDuff case law",
        input_schema: { type: "object", properties: { query: { type: "string" } } },
        output_schema: null,
        annotations: { readOnlyHint: true },
        enabled: true,
        requires_confirmation: false,
        last_seen_at: now,
        created_at: now,
        updated_at: now,
    });
    return connectorId;
}

describe("isDingDuffConnector", () => {
    it("recognizes DingDuff from connector or tool metadata", () => {
        expect(isDingDuffConnector({ name: "DingDuff", serverUrl: "https://example.com" })).toBe(true);
        expect(isDingDuffConnector({
            name: "Legal research",
            serverUrl: "https://example.com",
            tools: [{ toolName: "search", title: null, description: "Search Ding Duff authorities" }],
        })).toBe(true);
        expect(isDingDuffConnector({ name: "Google Drive", serverUrl: "https://googleapis.com/mcp" })).toBe(false);
    });
});

describe("buildDingDuffFallbackCalls", () => {
    const tools: OpenAIToolSchema[] = [
        {
            type: "function",
            function: {
                name: "mcp_dingduff_opinion_search_abc123",
                description: "Search opinions",
                parameters: { type: "object" },
            },
        },
        {
            type: "function",
            function: {
                name: "mcp_dingduff_codes_search_abc123",
                description: "Search codes",
                parameters: { type: "object" },
            },
        },
    ];

    it("builds direct DingDuff calls for a nationwide legal monitor", () => {
        const calls = buildDingDuffFallbackCalls(tools, {
            topic: "Monitor material fintech payment and bank-service-provider developments.\n\nClassify each result.",
            jurisdiction: "United States federal and all U.S. states",
            sourceTypes: ["case_law", "statutes"],
            lookbackDays: 14,
        }, "2026-07-01T12:00:00.000Z");

        expect(calls).toEqual([
            expect.objectContaining({
                name: "mcp_dingduff_opinion_search_abc123",
                sourceType: "case_law",
                input: expect.objectContaining({ filed_after: "2026-07-01", order_by: "-dateFiled" }),
            }),
            expect.objectContaining({
                name: "mcp_dingduff_codes_search_abc123",
                sourceType: "statutes",
                input: expect.objectContaining({ jurisdiction: "US", search_type: "text" }),
            }),
        ]);
    });

    it("passes explicit state jurisdictions to DingDuff statutes search", () => {
        const calls = buildDingDuffFallbackCalls(tools, {
            topic: "Consumer privacy statutes",
            jurisdiction: "California and New York",
            sourceTypes: ["statutes"],
            lookbackDays: 30,
        }, "2026-07-01");

        expect(calls.map((call) => call.input.jurisdiction)).toEqual(["CA", "NY"]);
    });
});

describe("legal monitor LLM stages", () => {
    it("retries a transient timeout without changing the operation", async () => {
        const timeout = Object.assign(
            new Error("The operation was aborted due to timeout"),
            { name: "TimeoutError" },
        );
        const operation = vi.fn()
            .mockRejectedValueOnce(timeout)
            .mockResolvedValueOnce("completed report");

        await expect(runLegalMonitorLlmStage({
            stage: "Final monitor analysis",
            operation,
            attempts: 2,
            timeoutMs: 300_000,
        })).resolves.toBe("completed report");
        expect(operation).toHaveBeenCalledTimes(2);
    });

    it("reports the failed stage and per-attempt timeout after retries", async () => {
        const timeout = Object.assign(
            new Error("The operation was aborted due to timeout"),
            { name: "TimeoutError" },
        );
        const operation = vi.fn().mockRejectedValue(timeout);

        await expect(runLegalMonitorLlmStage({
            stage: "Final monitor analysis",
            operation,
            attempts: 2,
            timeoutMs: 300_000,
        })).rejects.toThrow(
            "Final monitor analysis timed out on attempt 2 of 2 (300-second limit per attempt).",
        );
        expect(operation).toHaveBeenCalledTimes(2);
    });
});

describe("legal monitor persistence", () => {
    it("creates, lists, updates, and deletes a user-scoped monitor", async () => {
        const userId = crypto.randomUUID();
        const connectorId = await seedDingDuffConnector(userId);
        const created = await createLegalMonitor(userId, {
            name: "Administrative law watch",
            topic: "Judicial review of agency interpretations",
            jurisdiction: "United States federal",
            sourceTypes: ["case_law", "statutes"],
            connectorId,
            connectorConfig: { mode: "agent" },
            sources: [],
            documentIds: [],
            model: "gemini-3-flash-preview",
            intervalHours: 24,
            lookbackDays: 14,
            maxItemsPerRun: 50,
            alertEmail: null,
            emailEnabled: false,
            enabled: true,
        });
        createdMonitorIds.push(created.id);

        expect(created.connectorName).toBe("DingDuff Legal Research");
        expect(created.nextRunAt).not.toBeNull();
        await expect(listLegalMonitors(userId)).resolves.toEqual([
            expect.objectContaining({ id: created.id, sourceTypes: ["case_law", "statutes"] }),
        ]);

        const updated = await updateLegalMonitor(userId, created.id, {
            ...{
                name: created.name,
                topic: created.topic,
                jurisdiction: created.jurisdiction,
                sourceTypes: created.sourceTypes,
                connectorId: created.connectorId,
                connectorConfig: created.connectorConfig,
                sources: created.sources,
                documentIds: created.referenceDocuments.map((document) => document.id),
                model: created.model,
                intervalHours: created.intervalHours,
                lookbackDays: created.lookbackDays,
                maxItemsPerRun: created.maxItemsPerRun,
                alertEmail: created.alertEmail,
                emailEnabled: created.emailEnabled,
                enabled: created.enabled,
            },
            name: "Updated administrative law watch",
            intervalHours: 168,
            enabled: false,
        });
        expect(updated).toMatchObject({
            name: "Updated administrative law watch",
            intervalHours: 168,
            enabled: false,
            nextRunAt: null,
        });
        await expect(getLegalMonitor(userId, created.id)).resolves.toMatchObject({ name: updated.name });

        await deleteLegalMonitor(userId, created.id);
        createdMonitorIds.splice(createdMonitorIds.indexOf(created.id), 1);
        await expect(getLegalMonitor(userId, created.id)).rejects.toThrow("Monitor not found");
    });

    it("supports a generic connector as an agent-directed source", async () => {
        const db = createServerSQLite();
        const userId = crypto.randomUUID();
        const connectorId = crypto.randomUUID();
        const now = new Date().toISOString();
        createdConnectorIds.push(connectorId);
        await db.from("user_mcp_connectors").insert({
            id: connectorId, user_id: userId, name: "Other connector",
            transport: "streamable_http", server_url: "https://example.com/mcp",
            auth_type: "none", enabled: true, tool_policy: {},
            created_at: now, updated_at: now,
        });
        await db.from("user_mcp_connector_tools").insert({
            id: crypto.randomUUID(),
            connector_id: connectorId,
            tool_name: "search_records",
            openai_tool_name: `other_${connectorId.replaceAll("-", "").slice(0, 8)}_search_records`,
            title: "Search records",
            description: "Search connector records",
            input_schema: { type: "object", properties: { query: { type: "string" } } },
            output_schema: null,
            annotations: { readOnlyHint: true },
            enabled: true,
            requires_confirmation: false,
            last_seen_at: now,
            created_at: now,
            updated_at: now,
        });
        const created = await createLegalMonitor(userId, {
            name: "Watch", topic: "Topic", jurisdiction: "US",
            sourceTypes: [], connectorId, connectorConfig: { mode: "agent" },
            sources: [], documentIds: [], model: "gemini-3-flash-preview", intervalHours: 24,
            lookbackDays: 14, maxItemsPerRun: 50,
            alertEmail: null, emailEnabled: false, enabled: true,
        });
        createdMonitorIds.push(created.id);
        expect(created).toMatchObject({
            connectorId,
            connectorName: "Other connector",
            connectorConfig: { mode: "agent" },
        });
    });

    it("supports a feed-only monitor without DingDuff", async () => {
        const userId = crypto.randomUUID();
        const created = await createLegalMonitor(userId, {
            name: "Regulatory feed watch",
            topic: "Material banking regulatory developments",
            jurisdiction: "United States",
            sourceTypes: [],
            connectorId: null,
            connectorConfig: { mode: "agent" },
            sources: [{ kind: "rss", name: "OCC Bulletins", url: "https://www.occ.gov/rss/occ_bulletins.xml", category: "Federal", enabled: true }],
            documentIds: [],
            model: "gemini-3-flash-preview",
            intervalHours: 24,
            lookbackDays: 30,
            maxItemsPerRun: 25,
            alertEmail: null,
            emailEnabled: false,
            enabled: true,
        });
        createdMonitorIds.push(created.id);

        expect(created.connectorId).toBeNull();
        expect(created.sources).toEqual([
            expect.objectContaining({ name: "OCC Bulletins", kind: "rss", itemCount: 0 }),
        ]);
        expect(created).toMatchObject({ lookbackDays: 30, maxItemsPerRun: 25 });
    });

    it("persists user-owned Library context and rejects another user's file before updating", async () => {
        const userId = crypto.randomUUID();
        const documentId = await seedLibraryDocument(userId);
        const otherDocumentId = await seedLibraryDocument(
            crypto.randomUUID(),
            "Other user's policy.docx",
        );
        const created = await createLegalMonitor(userId, {
            name: "Policy-aware regulatory watch",
            topic: "Material banking regulatory developments",
            jurisdiction: "United States",
            sourceTypes: [],
            connectorId: null,
            connectorConfig: { mode: "agent" },
            sources: [{
                kind: "rss",
                name: "OCC Bulletins",
                url: "https://www.occ.gov/rss/occ_bulletins.xml",
                category: "Federal",
                enabled: true,
            }],
            documentIds: [documentId],
            model: "gemini-3-flash-preview",
            intervalHours: 24,
            lookbackDays: 14,
            maxItemsPerRun: 25,
            alertEmail: null,
            emailEnabled: false,
            enabled: true,
        });
        createdMonitorIds.push(created.id);

        expect(created.referenceDocuments).toEqual([
            expect.objectContaining({
                id: documentId,
                filename: "Risk policy.docx",
                fileType: "docx",
                versionNumber: 1,
            }),
        ]);
        await expect(getLegalMonitor(userId, created.id)).resolves.toMatchObject({
            referenceDocuments: [expect.objectContaining({ id: documentId })],
        });

        await expect(updateLegalMonitor(userId, created.id, {
            name: "Should not be saved",
            topic: created.topic,
            jurisdiction: created.jurisdiction,
            sourceTypes: created.sourceTypes,
            connectorId: created.connectorId,
            connectorConfig: created.connectorConfig,
            sources: created.sources,
            documentIds: [otherDocumentId],
            model: created.model,
            intervalHours: created.intervalHours,
            lookbackDays: created.lookbackDays,
            maxItemsPerRun: created.maxItemsPerRun,
            alertEmail: created.alertEmail,
            emailEnabled: created.emailEnabled,
            enabled: created.enabled,
        })).rejects.toThrow("not available in your Library");

        await expect(getLegalMonitor(userId, created.id)).resolves.toMatchObject({
            name: "Policy-aware regulatory watch",
            referenceDocuments: [expect.objectContaining({ id: documentId })],
        });
    });

    it("loads bounded text from the active Library document version", async () => {
        const userId = crypto.randomUUID();
        const documentId = await seedLibraryDocument(
            userId,
            "Payments policy.docx",
            "Escalate any regulatory development affecting instant-payment fraud reimbursement.",
        );
        const created = await createLegalMonitor(userId, {
            name: "Payments policy watch",
            topic: "Payment fraud reimbursement developments",
            jurisdiction: "United States",
            sourceTypes: [],
            connectorId: null,
            connectorConfig: { mode: "agent" },
            sources: [{
                kind: "rss",
                name: "Regulator feed",
                url: "https://example.com/regulator.xml",
                category: null,
                enabled: true,
            }],
            documentIds: [documentId],
            model: "gemini-3-flash-preview",
            intervalHours: 24,
            lookbackDays: 14,
            maxItemsPerRun: 25,
            alertEmail: null,
            emailEnabled: false,
            enabled: true,
        });
        createdMonitorIds.push(created.id);

        const loaded = await loadLegalMonitorDocumentContext(
            userId,
            created.id,
        );
        expect(loaded.errors).toEqual([]);
        expect(loaded.context).toContain("REFERENCE FILE: Payments policy.docx");
        expect(loaded.context).toContain(
            "instant-payment fraud reimbursement",
        );
    });
});

import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * End-to-end regression: a legal-monitor analysis run against the live
 * Synthetic provider path. A local HTTP server fakes the Synthetic endpoint
 * with fail-once behaviours, SYNTHETIC_BASE_URL points at it, and
 * runLegalMonitor drives the real pipeline (source collection dossier →
 * analysis LLM stage → run persistence). This proves the retry semantics a
 * real provider hiccup needs: transient errors are retried once, an empty
 * model response is retried once, and a persistent failure marks the run
 * failed with a clear stage error instead of a bogus "completed" run.
 */
const SYNTHETIC_MODEL = "synthetic/syn:large:text";
const STRUCTURED_ANALYSIS = JSON.stringify({
    summary: "Retry recovered the run.",
    hasMaterialUpdates: true,
    developments: [
        {
            title: "Agency finalizes Rule 123",
            type: "regulatory",
            date: "2026-09-07",
            url: "https://rulewatch.invalid/r123",
            citation: "Rule 123",
            sourceName: "Agency notices",
            whyItMatters: "Expands reporting duties for banks.",
            severity: "high",
            confidence: 0.9,
        },
    ],
    report: "# Report\n\nRule 123 was finalized.",
});

let server: http.Server;
let baseUrl: string;
let modelCalls: string[] = [];
type ModelBehavior = (call: number) => { status: number; body: unknown };
let behavior: ModelBehavior = () => ({ status: 200, body: {} });

const ENV_KEYS = ["SYNTHETIC_BASE_URL", "SYNTHETIC_API_KEY"] as const;
const savedEnv = new Map<string, string | undefined>();

beforeAll(async () => {
    server = http.createServer((req, res) => {
        if (req.method === "POST" && req.url === "/v1/chat/completions") {
            const callIndex = modelCalls.length;
            modelCalls.push(req.headers["content-length"] ?? "");
            const action = behavior(callIndex);
            res.writeHead(action.status, {
                "content-type": "application/json",
            });
            res.end(JSON.stringify(action.body));
            return;
        }
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not found" }));
    });
    await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
    );
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}/v1`;
});

afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    // The env fakes must not leak into other test files in this worker.
    for (const key of ENV_KEYS) {
        const prior = savedEnv.get(key);
        if (prior === undefined) delete process.env[key];
        else process.env[key] = prior;
    }
});

function modelEntry(content: string) {
    return {
        id: "chatcmpl-regression",
        object: "chat.completion",
        created: 0,
        model: SYNTHETIC_MODEL,
        choices: [
            {
                index: 0,
                message: { role: "assistant", content },
                finish_reason: "stop",
            },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
}

async function loadModules() {
    vi.resetModules();
    for (const key of ENV_KEYS) {
        if (!savedEnv.has(key)) savedEnv.set(key, process.env[key]);
    }
    process.env.SYNTHETIC_BASE_URL = baseUrl;
    process.env.SYNTHETIC_API_KEY = "regression-test-key";
    const legalMonitors = await import("../legalMonitors");
    const { createServerSQLite } = await import("../sqlite");
    const db = createServerSQLite();
    return { legalMonitors, db };
}

async function seedMonitorWithPendingItem(moduleCtx: {
    legalMonitors: typeof import("../legalMonitors");
    db: ReturnType<typeof import("../sqlite").createServerSQLite>;
}) {
    const { legalMonitors, db } = moduleCtx;
    const userId = crypto.randomUUID();
    const monitor = await legalMonitors.createLegalMonitor(
        userId,
        {
            name: "Synthetic resilience watch",
            topic: "Banking regulation rulemaking",
            jurisdiction: "United States federal",
            sourceTypes: [],
            connectorId: null,
            connectorConfig: { mode: "agent" },
            sources: [
                {
                    kind: "web",
                    name: "Agency notices",
                    url: "https://rulewatch.invalid/notices",
                    enabled: true,
                },
            ],
            documentIds: [],
            model: SYNTHETIC_MODEL,
            intervalHours: 24,
            lookbackDays: 14,
            maxItemsPerRun: 5,
            alertEmail: null,
            emailEnabled: false,
            knowledgeCaptureEnabled: false,
            materialityThreshold: "low",
            enabled: true,
        },
        db,
    );
    const { data: sources } = await db
        .from("legal_monitor_sources")
        .select("id")
        .eq("monitor_id", monitor.id)
        .eq("user_id", userId);
    const sourceId = sources?.[0]?.id as string;
    const now = new Date().toISOString();
    await db.from("legal_monitor_source_items").insert({
        id: crypto.randomUUID(),
        monitor_id: monitor.id,
        source_id: sourceId,
        user_id: userId,
        external_id: "seed-1",
        canonical_url: "https://rulewatch.invalid/r123",
        title: "Agency finalizes Rule 123",
        published_at: now,
        summary: "Rule 123 finalized with new compliance deadlines.",
        content:
            "The agency published the final Rule 123, expanding reporting " +
            "duties for banks beginning 2027 with quarterly attestations.",
        content_hash: crypto.randomUUID(),
        first_seen_at: now,
        last_seen_at: now,
        processed_at: null,
        created_at: now,
        updated_at: now,
    });
    return { userId, monitorId: monitor.id as string };
}

describe("legal monitor analysis retry against a flaky Synthetic endpoint", () => {
    it("retries a 429 once and completes the run", async () => {
        const ctx = await loadModules();
        const { userId, monitorId } = await seedMonitorWithPendingItem(ctx);
        modelCalls = [];
        behavior = (call) =>
            call === 0
                ? { status: 429, body: { error: { type: "rate_limit" } } }
                : { status: 200, body: modelEntry(STRUCTURED_ANALYSIS) };

        const run = await ctx.legalMonitors.runLegalMonitor(
            userId,
            monitorId,
            ctx.db,
        );
        expect(run.status).toBe("completed");
        expect(run.summary).toBe("Retry recovered the run.");
        expect(run.developments.map((d) => d.title)).toContain(
            "Agency finalizes Rule 123",
        );
        expect(modelCalls.length).toBeGreaterThanOrEqual(2);

        const { data: monitorRow } = await ctx.db
            .from("legal_monitors")
            .select("last_status, last_error")
            .eq("id", monitorId)
            .eq("user_id", userId)
            .single();
        expect(monitorRow?.last_status).toBe("completed");
        expect(monitorRow?.last_error).toBeNull();
    });

    it("retries an empty model response once and completes the run", async () => {
        const ctx = await loadModules();
        const { userId, monitorId } = await seedMonitorWithPendingItem(ctx);
        modelCalls = [];
        behavior = (call) =>
            call === 0
                ? { status: 200, body: modelEntry("") }
                : { status: 200, body: modelEntry(STRUCTURED_ANALYSIS) };

        const run = await ctx.legalMonitors.runLegalMonitor(
            userId,
            monitorId,
            ctx.db,
        );
        expect(run.status).toBe("completed");
        expect(run.summary).toBe("Retry recovered the run.");
        // The AI SDK does not retry a resolved-but-empty response; only the
        // monitor's own transient-analysis retry can recover this case.
        expect(modelCalls).toHaveLength(2);
    });

    it("marks the run failed when every attempt errors transiently", async () => {
        const ctx = await loadModules();
        const { userId, monitorId } = await seedMonitorWithPendingItem(ctx);
        modelCalls = [];
        behavior = () => ({
            status: 429,
            body: { error: { type: "rate_limit" } },
        });

        await expect(
            ctx.legalMonitors.runLegalMonitor(userId, monitorId, ctx.db),
        ).rejects.toThrow("Final monitor analysis failed");

        const { data: runRow } = await ctx.db
            .from("legal_monitor_runs")
            .select("status, error")
            .eq("monitor_id", monitorId)
            .eq("user_id", userId)
            .single();
        expect(runRow?.status).toBe("failed");
        expect(String(runRow?.error)).toContain("Final monitor analysis");

        const { data: monitorRow } = await ctx.db
            .from("legal_monitors")
            .select("last_status, last_error")
            .eq("id", monitorId)
            .eq("user_id", userId)
            .single();
        expect(monitorRow?.last_status).toBe("failed");
        expect(String(monitorRow?.last_error)).toContain(
            "Final monitor analysis",
        );
    }, 60_000);
});

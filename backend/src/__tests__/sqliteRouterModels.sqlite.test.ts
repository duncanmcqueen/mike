import { describe, expect, it } from "vitest";
import { createServerSQLite } from "../lib/sqlite";

/**
 * Regression guard for the BYOK regression where clicking a router model in
 * Settings > API Keys silently failed to save: the SQLite mirror of
 * public.replace_user_router_models read the caller's target_user_id through
 * rpcUserId (p_user_id/user_id), got an empty string and returned without
 * writing. The route still answered 200 with the stale selection, so the UI
 * looked like every click did nothing.
 */
describe("SQLite adapter replace_user_router_models", () => {
    it("persists the full synthetic selection atomically", async () => {
        const db = createServerSQLite();
        const userId = crypto.randomUUID();

        const first = await db.rpc("replace_user_router_models", {
            target_user_id: userId,
            target_router: "synthetic",
            target_model_ids: ["hf:zai-org/GLM-5.2", "hf:moonshotai/Kimi-K3"],
        });
        expect(first.error).toBeNull();

        const { data: stored } = await db
            .from("user_router_models")
            .select("model_id")
            .eq("user_id", userId)
            .eq("router", "synthetic")
            .order("sort_order", { ascending: true });
        expect((stored ?? []).map((row) => row.model_id)).toEqual([
            "hf:zai-org/GLM-5.2",
            "hf:moonshotai/Kimi-K3",
        ]);
    });

    it("atomically replaces the router's selection without touching others", async () => {
        const db = createServerSQLite();
        const userId = crypto.randomUUID();

        await db.rpc("replace_user_router_models", {
            target_user_id: userId,
            target_router: "synthetic",
            target_model_ids: ["hf:moonshotai/Kimi-K3"],
        });
        await db.rpc("replace_user_router_models", {
            target_user_id: userId,
            target_router: "openrouter",
            target_model_ids: ["stealth/ox-alpha"],
        });

        const replaced = await db.rpc("replace_user_router_models", {
            target_user_id: userId,
            target_router: "synthetic",
            target_model_ids: ["syn:small"],
        });
        expect(replaced.error).toBeNull();

        const { data: syntheticRows } = await db
            .from("user_router_models")
            .select("model_id")
            .eq("user_id", userId)
            .eq("router", "synthetic");
        expect((syntheticRows ?? []).map((row) => row.model_id)).toEqual([
            "syn:small",
        ]);

        const cleared = await db.rpc("replace_user_router_models", {
            target_user_id: userId,
            target_router: "synthetic",
            target_model_ids: [],
        });
        expect(cleared.error).toBeNull();

        const { data: remaining } = await db
            .from("user_router_models")
            .select("router, model_id")
            .eq("user_id", userId);
        expect(
            (remaining ?? []).map((row) => `${row.router}/${row.model_id}`),
        ).toEqual(["openrouter/stealth/ox-alpha"]);
    });
});

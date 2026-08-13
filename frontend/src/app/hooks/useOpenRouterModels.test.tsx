import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getOpenRouterModels } = vi.hoisted(() => ({
    getOpenRouterModels: vi.fn(),
}));

vi.mock("@/app/lib/mikeApi", () => ({
    getOpenRouterModels,
}));

import { useOpenRouterModels } from "./useOpenRouterModels";

describe("useOpenRouterModels", () => {
    beforeEach(() => {
        getOpenRouterModels.mockReset();
    });

    it("loads the catalog when an OpenRouter key is configured", async () => {
        const models = [
            {
                id: "openrouter/anthropic/claude-sonnet-4",
                label: "Claude Sonnet 4",
                group: "OpenRouter" as const,
            },
        ];
        getOpenRouterModels.mockResolvedValue(models);

        const { result } = renderHook(() => useOpenRouterModels(true));

        await waitFor(() => expect(result.current).toEqual(models));
        expect(getOpenRouterModels).toHaveBeenCalledTimes(1);
    });

    it("hides the cached catalog when no key is configured", () => {
        const { result } = renderHook(() => useOpenRouterModels(false));

        expect(result.current).toEqual([]);
        expect(getOpenRouterModels).not.toHaveBeenCalled();
    });
});

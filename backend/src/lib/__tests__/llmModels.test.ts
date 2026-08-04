import { afterEach, describe, it, expect, vi } from "vitest";
import {
    CLAUDE_MAIN_MODELS,
    GEMINI_MAIN_MODELS,
    OPENAI_MAIN_MODELS,
    CLAUDE_MID_MODELS,
    GEMINI_MID_MODELS,
    OPENAI_MID_MODELS,
    CLAUDE_LOW_MODELS,
    GEMINI_LOW_MODELS,
    OPENAI_LOW_MODELS,
    DEFAULT_MAIN_MODEL,
    DEFAULT_TITLE_MODEL,
    DEFAULT_TABULAR_MODEL,
    providerForModel,
    resolveModel,
    resolveUsableModel,
} from "../llm/models";

afterEach(() => {
    vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// providerForModel
// ---------------------------------------------------------------------------

describe("providerForModel", () => {
    it("maps claude-* ids to the claude provider", () => {
        for (const model of [...CLAUDE_MAIN_MODELS, ...CLAUDE_MID_MODELS, ...CLAUDE_LOW_MODELS]) {
            expect(providerForModel(model)).toBe("claude");
        }
    });

    it("maps gemini-* ids to the gemini provider", () => {
        for (const model of [...GEMINI_MAIN_MODELS, ...GEMINI_MID_MODELS, ...GEMINI_LOW_MODELS]) {
            expect(providerForModel(model)).toBe("gemini");
        }
    });

    it("maps gpt-* ids to the openai provider", () => {
        for (const model of [...OPENAI_MAIN_MODELS, ...OPENAI_MID_MODELS, ...OPENAI_LOW_MODELS]) {
            expect(providerForModel(model)).toBe("openai");
        }
    });

    it("maps built-in Kimi ids to the openai-compatible provider", () => {
        expect(providerForModel("kimi-k3")).toBe("openai-compatible");
        expect(providerForModel("kimi-k3-256k")).toBe("openai-compatible");
    });

    it("maps dynamic Ollama ids to the keyless Ollama provider", () => {
        expect(providerForModel("ollama/qwen3.6")).toBe("ollama");
    });

    it("throws on an unknown model id", () => {
        expect(() => providerForModel("llama-3")).toThrow(/Unknown model id/);
        expect(() => providerForModel("")).toThrow(/Unknown model id/);
    });

    it("infers by prefix only, without validating against the catalog", () => {
        // Documents current behavior: any claude-/gemini-/gpt- prefix is
        // accepted even if the id is not a canonical model.
        expect(providerForModel("claude-nonexistent")).toBe("claude");
        expect(providerForModel("gpt-nonexistent")).toBe("openai");
    });
});

// ---------------------------------------------------------------------------
// resolveModel
// ---------------------------------------------------------------------------

describe("resolveModel", () => {
    it("returns a known model id unchanged", () => {
        expect(resolveModel("claude-sonnet-4-6", DEFAULT_MAIN_MODEL)).toBe(
            "claude-sonnet-4-6",
        );
        expect(resolveModel("gpt-5.4-lite", DEFAULT_TITLE_MODEL)).toBe(
            "gpt-5.4-lite",
        );
        expect(resolveModel("kimi-k3", DEFAULT_MAIN_MODEL)).toBe("kimi-k3");
        expect(resolveModel("ollama/qwen3.6", DEFAULT_MAIN_MODEL)).toBe(
            "ollama/qwen3.6",
        );
    });

    it("falls back for unknown model ids", () => {
        expect(resolveModel("gpt-3.5-turbo", DEFAULT_MAIN_MODEL)).toBe(
            DEFAULT_MAIN_MODEL,
        );
    });

    it("falls back for null, undefined, and empty ids", () => {
        expect(resolveModel(null, DEFAULT_MAIN_MODEL)).toBe(DEFAULT_MAIN_MODEL);
        expect(resolveModel(undefined, DEFAULT_TABULAR_MODEL)).toBe(
            DEFAULT_TABULAR_MODEL,
        );
        expect(resolveModel("", DEFAULT_TITLE_MODEL)).toBe(DEFAULT_TITLE_MODEL);
    });

    it("accepts models from every tier of the catalog", () => {
        const catalog = [
            ...CLAUDE_MAIN_MODELS,
            ...GEMINI_MAIN_MODELS,
            ...OPENAI_MAIN_MODELS,
            ...CLAUDE_MID_MODELS,
            ...GEMINI_MID_MODELS,
            ...OPENAI_MID_MODELS,
            ...CLAUDE_LOW_MODELS,
            ...GEMINI_LOW_MODELS,
            ...OPENAI_LOW_MODELS,
        ];
        for (const model of catalog) {
            expect(resolveModel(model, "fallback-model")).toBe(model);
        }
    });
});

// ---------------------------------------------------------------------------
// resolveUsableModel
// ---------------------------------------------------------------------------

describe("resolveUsableModel", () => {
    it("keeps a dynamic Ollama model without an API key", () => {
        expect(
            resolveUsableModel(
                "ollama/qwen3.6",
                DEFAULT_MAIN_MODEL,
                {},
            ),
        ).toBe("ollama/qwen3.6");
    });

    it("keeps the selected model when its user API key is available", () => {
        expect(
            resolveUsableModel(
                "gemini-3-flash-preview",
                DEFAULT_MAIN_MODEL,
                { gemini: "user-gemini-key" },
            ),
        ).toBe("gemini-3-flash-preview");
    });

    it("uses an available configured model when the default has no key", () => {
        vi.stubEnv("GEMINI_API_KEY", "");
        vi.stubEnv("ANTHROPIC_API_KEY", "");
        vi.stubEnv("CLAUDE_API_KEY", "");
        vi.stubEnv("OPENAI_API_KEY", "");
        vi.stubEnv("KIMI_API_KEY", "");

        expect(
            resolveUsableModel(undefined, DEFAULT_MAIN_MODEL, {
                kimi: "user-kimi-key",
            }),
        ).toBe("kimi-k3");
    });

    it("retains the resolved model when no provider has a key", () => {
        vi.stubEnv("GEMINI_API_KEY", "");
        vi.stubEnv("ANTHROPIC_API_KEY", "");
        vi.stubEnv("CLAUDE_API_KEY", "");
        vi.stubEnv("OPENAI_API_KEY", "");
        vi.stubEnv("KIMI_API_KEY", "");

        expect(resolveUsableModel(undefined, DEFAULT_MAIN_MODEL, {})).toBe(
            DEFAULT_MAIN_MODEL,
        );
    });
});

// ---------------------------------------------------------------------------
// Default model sanity
// ---------------------------------------------------------------------------

describe("default models", () => {
    it("every default resolves to itself (defaults are in the catalog)", () => {
        expect(resolveModel(DEFAULT_MAIN_MODEL, "x")).toBe(DEFAULT_MAIN_MODEL);
        expect(resolveModel(DEFAULT_TITLE_MODEL, "x")).toBe(DEFAULT_TITLE_MODEL);
        expect(resolveModel(DEFAULT_TABULAR_MODEL, "x")).toBe(
            DEFAULT_TABULAR_MODEL,
        );
    });

    it("every default has a resolvable provider", () => {
        expect(providerForModel(DEFAULT_MAIN_MODEL)).toBe("gemini");
        expect(providerForModel(DEFAULT_TITLE_MODEL)).toBe("gemini");
        expect(providerForModel(DEFAULT_TABULAR_MODEL)).toBe("gemini");
    });
});

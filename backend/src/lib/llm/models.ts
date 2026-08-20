import type { Provider, UserApiKeys } from "./types";
import {
    configuredModelIds,
    configuredProviderForModel,
    getCommitteeModel,
    getConfiguredModel,
} from "./registry";
import { hasEnvApiKey } from "../userApiKeys";

// ---------------------------------------------------------------------------
// Canonical model IDs
// ---------------------------------------------------------------------------
// Main-chat tier (top-end) — user picks one of these per message.
export const CLAUDE_MAIN_MODELS = [
    "claude-fable-5",
    "claude-opus-5",
    "claude-sonnet-5",
    "claude-opus-4-8",
    "claude-opus-4-7",
    "claude-sonnet-4-6",
] as const;
export const GEMINI_MAIN_MODELS = [
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
] as const;
export const OPENAI_MAIN_MODELS = [
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.5",
    "gpt-5.4",
] as const;
// Ollama models are detected dynamically (see GET /models/ollama). Any id of
// the form "ollama/<tag>" is valid — see providerForModel / resolveModel.

// Mid-tier (used for tabular review) — user picks one in account settings.
export const CLAUDE_MID_MODELS = [
    "claude-sonnet-5",
    "claude-sonnet-4-6",
] as const;
export const GEMINI_MID_MODELS = [
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3-flash-preview",
] as const;
export const OPENAI_MID_MODELS = ["gpt-5.6-terra", "gpt-5.4"] as const;

// Low-tier (used for title generation, lightweight extractions) — user picks
// one in account settings.
export const CLAUDE_LOW_MODELS = ["claude-haiku-4-5"] as const;
export const GEMINI_LOW_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
] as const;
export const OPENAI_LOW_MODELS = ["gpt-5.6-luna", "gpt-5.4-mini"] as const;

export const DEFAULT_MAIN_MODEL = "gemini-3-flash-preview";
export const DEFAULT_TITLE_MODEL = "gemini-3.5-flash-lite";
export const DEFAULT_TABULAR_MODEL = "gemini-3-flash-preview";

const ALL_MODELS = new Set<string>([
    ...CLAUDE_MAIN_MODELS,
    ...GEMINI_MAIN_MODELS,
    ...OPENAI_MAIN_MODELS,
    ...CLAUDE_MID_MODELS,
    ...GEMINI_MID_MODELS,
    ...OPENAI_MID_MODELS,
    ...CLAUDE_LOW_MODELS,
    ...GEMINI_LOW_MODELS,
    ...OPENAI_LOW_MODELS,
]);

export function builtInModelIds(): string[] {
    return [...ALL_MODELS];
}

// ---------------------------------------------------------------------------
// Provider inference
// ---------------------------------------------------------------------------

export function providerForModel(model: string): Provider {
    const configured = configuredProviderForModel(model);
    if (configured) return configured;
    if (model.startsWith("ollama")) return "ollama";
    if (model.startsWith("openrouter/")) return "openrouter";
    if (model.startsWith("vercel/")) return "vercel";
    if (model.startsWith("claude")) return "claude";
    if (model.startsWith("gemini")) return "gemini";
    if (model.startsWith("gpt-")) return "openai";
    throw new Error(`Unknown model id: ${model}`);
}

// Renamed/retired static ids → their current equivalents. Stored preferences
// and localStorage selections outlive catalog renames; mapping here keeps an
// old saved value working instead of silently kicking it to the fallback.
export const LEGACY_MODEL_IDS: Record<string, string> = {
    "gemini-3.1-flash-lite-preview": "gemini-3.5-flash-lite",
    "gpt-5.4-lite": "gpt-5.4-mini",
};

export function resolveModel(
    id: string | null | undefined,
    fallback: string,
): string {
    const canonical = id ? (LEGACY_MODEL_IDS[id] ?? id) : id;
    if (canonical && getConfiguredModel(canonical)) return canonical;
    if (
        canonical &&
        (ALL_MODELS.has(canonical) ||
            canonical.startsWith("ollama/") ||
            /^(?:openrouter|vercel)\/[^\s/]+\/[^\s]+$/.test(canonical))
    )
        return canonical;
    return fallback;
}

export function openRouterModelId(model: string): string {
    return model.replace(/^openrouter\//, "");
}

export function vercelModelId(model: string): string {
    return model.replace(/^vercel\//, "");
}

// ---------------------------------------------------------------------------
// Usable-model resolution (API key awareness)
// ---------------------------------------------------------------------------

function providerKeyAvailable(
    provider: Provider,
    apiKeys?: UserApiKeys,
): boolean {
    switch (provider) {
        case "claude":
            return !!apiKeys?.claude?.trim() || hasEnvApiKey("claude");
        case "gemini":
            return !!apiKeys?.gemini?.trim() || hasEnvApiKey("gemini");
        case "openai":
            return !!apiKeys?.openai?.trim() || hasEnvApiKey("openai");
        case "openrouter":
            return !!apiKeys?.openrouter?.trim() || hasEnvApiKey("openrouter");
        case "vercel":
            return !!apiKeys?.vercel?.trim() || hasEnvApiKey("vercel");
        case "ollama":
            return true;
        default:
            return false;
    }
}

/** True when the given model has any usable API key (user key or env). */
export function modelHasApiKey(
    model: string,
    apiKeys?: UserApiKeys,
): boolean {
    const configured = getConfiguredModel(model);
    if (configured) {
        if (configured.apiKey?.trim()) return true;
        const userKey = configured.apiKeyProvider
            ? apiKeys?.[configured.apiKeyProvider]?.trim()
            : undefined;
        if (userKey) return true;
        // A configured openai-compatible model with no key source at all
        // (e.g. a local server) requires no API key.
        if (!configured.apiKeyProvider && !configured.apiKeyEnv) return true;
        return configured.apiKeyEnv
            ? !!process.env[configured.apiKeyEnv]?.trim()
            : false;
    }
    if (getCommitteeModel(model)) {
        // Committee key resolution happens per-member at call time; don't
        // second-guess it here.
        return true;
    }
    try {
        return providerKeyAvailable(providerForModel(model), apiKeys);
    } catch {
        return false;
    }
}

/**
 * Like resolveModel, but when the resolved model has no usable API key,
 * substitute the first model that does (registry models first, then
 * built-ins). Returns the original resolution when nothing is configured so
 * the provider's own "key not configured" error still surfaces.
 */
export function resolveUsableModel(
    id: string | null | undefined,
    fallback: string,
    apiKeys?: UserApiKeys,
): string {
    const selected = resolveModel(id, fallback);
    if (modelHasApiKey(selected, apiKeys)) return selected;
    for (const candidate of configuredModelIds()) {
        if (candidate !== selected && modelHasApiKey(candidate, apiKeys)) {
            return candidate;
        }
    }
    for (const candidate of ALL_MODELS) {
        if (candidate !== selected && modelHasApiKey(candidate, apiKeys)) {
            return candidate;
        }
    }
    return selected;
}

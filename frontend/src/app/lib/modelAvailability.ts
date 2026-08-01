import { SETTINGS_MODELS, type ModelOption } from "../components/assistant/ModelToggle";
import type { ApiKeyState } from "@/app/lib/mikeApi";

export type ModelProvider =
    | "claude"
    | "kimi"
    | "gemini"
    | "openai"
    | "local"
    | "committee";

export function getModelProvider(modelId: string): ModelProvider | null {
    const model = SETTINGS_MODELS.find((m) => m.id === modelId);
    if (!model) return null;
    return modelGroupToProvider(model.group);
}

export function isModelAvailable(
    modelId: string,
    apiKeys: ApiKeyState,
): boolean {
    const provider = getModelProvider(modelId);
    if (!provider) return true;
    return isProviderAvailable(provider, apiKeys);
}

export function isProviderAvailable(
    provider: ModelProvider,
    apiKeys: ApiKeyState,
): boolean {
    if (provider === "local" || provider === "committee") return true;
    return !!apiKeys[provider]?.configured;
}

export function providerLabel(provider: ModelProvider): string {
    if (provider === "local") return "Local";
    if (provider === "committee") return "Committee";
    if (provider === "claude") return "Anthropic (Claude)";
    if (provider === "kimi") return "Moonshot (Kimi)";
    if (provider === "openai") return "OpenAI";
    return "Google (Gemini)";
}

export function modelGroupToProvider(
    group: ModelOption["group"],
): ModelProvider {
    if (group === "Local") return "local";
    if (group === "Committee") return "committee";
    if (group === "Anthropic") return "claude";
    if (group === "Moonshot") return "kimi";
    if (group === "OpenAI") return "openai";
    return "gemini";
}

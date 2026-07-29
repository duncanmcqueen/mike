import type { CommitteeModel, ConfiguredModel, Provider } from "./types";

type ModelRegistryConfig = {
  models?: ConfiguredModel[];
  committees?: CommitteeModel[];
};

const DEFAULT_CONFIG: ModelRegistryConfig = {
  models: [],
  committees: [],
};

let cached: ModelRegistryConfig | undefined;

export function loadModelRegistry(): ModelRegistryConfig {
  if (cached) return cached;
  const raw = process.env.MIKE_MODEL_CONFIG_JSON?.trim();
  if (!raw) {
    cached = DEFAULT_CONFIG;
    return cached;
  }

  try {
    const parsed = JSON.parse(raw) as ModelRegistryConfig;
    cached = {
      models: Array.isArray(parsed.models)
        ? parsed.models.filter(isConfiguredModel)
        : [],
      committees: Array.isArray(parsed.committees)
        ? parsed.committees.filter(isCommitteeModel)
        : [],
    };
  } catch (error) {
    throw new Error(
      `MIKE_MODEL_CONFIG_JSON is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return cached;
}

export function getConfiguredModel(id: string): ConfiguredModel | null {
  return loadModelRegistry().models?.find((model) => model.id === id) ?? null;
}

export function getCommitteeModel(id: string): CommitteeModel | null {
  return (
    loadModelRegistry().committees?.find((committee) => committee.id === id) ??
    null
  );
}

export function configuredModelIds(): string[] {
  const registry = loadModelRegistry();
  return [
    ...(registry.models ?? []).map((model) => model.id),
    ...(registry.committees ?? []).map((committee) => committee.id),
  ];
}

export function configuredModelSummaries(): {
  id: string;
  label: string;
  provider: Provider | "committee";
  location: "cloud" | "local" | "committee";
}[] {
  const registry = loadModelRegistry();
  return [
    ...(registry.models ?? []).map((model) => ({
      id: model.id,
      label: model.label || model.id,
      provider: model.provider,
      location: model.location,
    })),
    ...(registry.committees ?? []).map((committee) => ({
      id: committee.id,
      label: committee.label || committee.id,
      provider: "committee" as const,
      location: "committee" as const,
    })),
  ];
}

export function configuredProviderForModel(id: string): Provider | null {
  const model = getConfiguredModel(id);
  if (model) return model.provider;
  if (getCommitteeModel(id)) return "openai-compatible";
  return null;
}

export function apiKeyForConfiguredModel(model: ConfiguredModel): string | null {
  if (model.apiKey?.trim()) return model.apiKey.trim();
  if (model.apiKeyEnv?.trim()) {
    return process.env[model.apiKeyEnv.trim()]?.trim() || null;
  }
  return null;
}

function isConfiguredModel(value: unknown): value is ConfiguredModel {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    isProvider(record.provider) &&
    (record.location === "cloud" || record.location === "local")
  );
}

function isProvider(value: unknown): value is Provider {
  return (
    value === "claude" ||
    value === "gemini" ||
    value === "openai" ||
    value === "openai-compatible"
  );
}

function isCommitteeModel(value: unknown): value is CommitteeModel {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    Array.isArray(record.members) &&
    record.members.every(
      (member) =>
        typeof member === "string" ||
        (!!member &&
          typeof member === "object" &&
          typeof (member as Record<string, unknown>).model === "string"),
    ) &&
    typeof record.chair === "string"
  );
}

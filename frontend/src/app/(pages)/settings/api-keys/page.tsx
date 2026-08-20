"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { ApiKeyField } from "@/app/components/settings/ApiKeyField";
import { RouterSettingsSection } from "@/app/components/settings/RouterSettingsSection";
import { useUserProfile } from "@/app/contexts/UserProfileContext";
import { refreshOllamaModels } from "@/app/hooks/useOllamaModels";
import { refreshOpenCodeGoModels } from "@/app/hooks/useOpenCodeGoModels";
import { SettingsSection } from "../SettingsSection";

const MODEL_API_KEY_FIELDS = [
    {
        provider: "claude",
        label: "Anthropic (Claude) API Key",
        placeholder: "sk-ant-...",
    },
    {
        provider: "kimi",
        label: "Moonshot (Kimi) API Key",
        placeholder: "sk-...",
    },
    {
        provider: "gemini",
        label: "Google (Gemini) API Key",
        placeholder: "AI...",
    },
    {
        provider: "openai",
        label: "OpenAI API Key",
        placeholder: "sk-...",
    },
    {
        provider: "openrouter",
        label: "OpenRouter API Key",
        placeholder: "sk-or-...",
        description:
            "After saving, pick the OpenRouter models you want offered in the composer below.",
    },
    {
        provider: "vercel",
        label: "Vercel AI Gateway API Key",
        placeholder: "vck_...",
        description:
            "After saving, pick the Vercel AI Gateway models you want offered in the composer below.",
    },
    {
        provider: "opencodego",
        label: "OpenCode Go API Key",
        placeholder: "API key...",
        description:
            "OpenCode Go is a low-cost subscription for open coding models. After saving, choose any available OpenCode Go model from the searchable model picker.",
    },
] as const;

const OTHER_API_KEY_FIELDS = [
    {
        provider: "courtlistener",
        label: "CourtListener API Key",
        placeholder: "Token...",
        description:
            "Add a CourtListener API key if you want the latest CourtListener data. Otherwise, Mike will use the bulk data hosted by us.",
    },
] as const;

export default function ApiKeysPage() {
    const { profile, updateApiKey, reloadProfile } = useUserProfile();
    const [refreshing, setRefreshing] = useState(false);

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await Promise.all([
                reloadProfile(),
                refreshOllamaModels(),
                refreshOpenCodeGoModels(),
            ]);
        } finally {
            setRefreshing(false);
        }
    };

    return (
        <div>
            <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-2xl font-medium font-serif text-gray-900">
                    API Keys
                </h2>
                <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="flex items-center gap-1.5 text-xs font-medium text-gray-600 transition-colors hover:text-gray-950 disabled:cursor-not-allowed disabled:text-gray-400"
                    title="Re-check API keys and refresh available models"
                >
                    <RefreshCw
                        className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                    />
                    {refreshing ? "Refreshing..." : "Refresh"}
                </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
                You must provide your own API keys for the app to work or add
                your API keys into the .env file if you are running your own
                instance of Mike. All API keys are encrypted in storage.
            </p>
            <SettingsSection>
                {MODEL_API_KEY_FIELDS.map((field) => (
                    <div key={field.provider}>
                        <ApiKeyField
                            label={field.label}
                            description={
                                "description" in field
                                    ? field.description
                                    : undefined
                            }
                            placeholder={field.placeholder}
                            hasSavedKey={
                                !!profile?.apiKeys[field.provider].configured
                            }
                            isServerConfigured={
                                profile?.apiKeys[field.provider].source ===
                                "env"
                            }
                            onSave={(value) =>
                                updateApiKey(
                                    field.provider,
                                    value.trim() || null,
                                )
                            }
                            onRemove={() => updateApiKey(field.provider, null)}
                        />
                    </div>
                ))}
            </SettingsSection>

            <div className="mt-8">
                <RouterSettingsSection />
            </div>

            <div className="mt-8">
                <SettingsSection>
                    {OTHER_API_KEY_FIELDS.map((field) => (
                        <ApiKeyField
                            key={field.provider}
                            label={field.label}
                            description={field.description}
                            placeholder={field.placeholder}
                            hasSavedKey={
                                !!profile?.apiKeys[field.provider].configured
                            }
                            isServerConfigured={
                                profile?.apiKeys[field.provider].source ===
                                "env"
                            }
                            onSave={(value) =>
                                updateApiKey(
                                    field.provider,
                                    value.trim() || null,
                                )
                            }
                            onRemove={() =>
                                updateApiKey(field.provider, null)
                            }
                        />
                    ))}
                </SettingsSection>
            </div>
        </div>
    );
}

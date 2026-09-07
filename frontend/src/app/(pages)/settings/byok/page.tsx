"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { ApiKeyField } from "@/app/components/settings/ApiKeyField";
import { RouterSettingsSection } from "@/app/components/settings/RouterSettingsSection";
import { useUserProfile } from "@/app/contexts/UserProfileContext";
import { refreshOllamaModels } from "@/app/hooks/useOllamaModels";
import { refreshOpenCodeGoModels } from "@/app/hooks/useOpenCodeGoModels";
import type { ApiKeyProvider } from "@/app/lib/mikeApi";
import { cn } from "@/app/lib/utils";
import { settingsGlassIconButtonClassName } from "../settingsStyles";
import { SettingsSection } from "../SettingsSection";

type ApiKeyFieldConfig = {
    provider: ApiKeyProvider;
    label: string;
    placeholder: string;
    description?: string;
};

const MODEL_API_KEY_FIELDS: ApiKeyFieldConfig[] = [
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
        provider: "opencode-go",
        label: "OpenCode Go API Key",
        placeholder: "API key...",
        description:
            "OpenCode Go is a low-cost subscription for open coding models. After saving, choose any available OpenCode Go model from the searchable model picker.",
    },
    {
        provider: "synthetic",
        label: "Synthetic API Key",
        placeholder: "sk-syn-...",
        description:
            "After saving, pick the Synthetic models you want offered in the composer below.",
    },
];

const OTHER_API_KEY_FIELDS: ApiKeyFieldConfig[] = [
    {
        provider: "courtlistener",
        label: "CourtListener API Key",
        placeholder: "Token...",
        description:
            "Add a CourtListener API key if you want the latest CourtListener data. Otherwise, Mike will use the bulk data hosted by us.",
    },
];

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

    const renderFields = (fields: ApiKeyFieldConfig[]) => (
        <SettingsSection>
            {fields.map((field) => (
                <div key={field.provider}>
                    <ApiKeyField
                        label={field.label}
                        placeholder={field.placeholder}
                        description={field.description}
                        hasSavedKey={
                            profile?.apiKeys[field.provider].source === "user"
                        }
                        onSave={(value) =>
                            updateApiKey(field.provider, value.trim() || null)
                        }
                        onRemove={() => updateApiKey(field.provider, null)}
                    />
                </div>
            ))}
        </SettingsSection>
    );

    return (
        <div className="space-y-8">
            <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="text-2xl font-medium font-serif text-gray-900">
                        API Keys
                    </h2>
                    <button
                        type="button"
                        onClick={() => void handleRefresh()}
                        disabled={refreshing}
                        aria-label="Refresh API key and model status"
                        className={cn(
                            settingsGlassIconButtonClassName,
                            "disabled:cursor-not-allowed disabled:opacity-50",
                        )}
                    >
                        <RefreshCw
                            className={cn(
                                "h-4 w-4",
                                refreshing && "animate-spin",
                            )}
                        />
                    </button>
                </div>
                <p className="text-sm text-gray-500">
                    A personal API key saved here means all future requests for
                    the relevant provider will automatically be routed through
                    your API key and charged to your own API platform account.
                </p>
                {renderFields(MODEL_API_KEY_FIELDS)}
            </section>

            <section className="space-y-3">
                <h2 className="text-2xl font-medium font-serif text-gray-900">
                    Other API Keys
                </h2>
                {renderFields(OTHER_API_KEY_FIELDS)}
            </section>

            <RouterSettingsSection />
        </div>
    );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
    ALLOWED_MODEL_IDS,
    DEFAULT_MODEL_ID,
    SETTINGS_MODELS,
    canonicalModelId,
} from "../components/assistant/ModelToggle";

const STORAGE_KEY = "mike.selectedModel";

/**
 * The composer's accepted-id surface. Exported so the Word add-in drift guard
 * (frontend/src/wordAddin/catalogParity.test.ts) can compare it against the
 * add-in's hand-mirrored copy instead of restating the rule.
 */
export function isAllowedModelId(id: string): boolean {
    return (
        ALLOWED_MODEL_IDS.has(id) ||
        id.startsWith("ollama/") ||
        id.startsWith("openrouter/") ||
        id.startsWith("vercel/") ||
        id.startsWith("opencode-go/") ||
        id.startsWith("synthetic/")
    );
}

// First-party ids this client knows but does not offer in the composer
// (settings-tier title/tabular models). A stored value that canonicalizes to
// one of these is stale, not a registry model, so it must not survive.
const SETTINGS_ONLY_MODEL_IDS = new Set(
    SETTINGS_MODELS.filter((model) => !ALLOWED_MODEL_IDS.has(model.id)).map(
        (model) => model.id,
    ),
);

/**
 * What this hook will actually keep as a stored selection. Registry models
 * (MIKE_MODEL_CONFIG_JSON entries, committees, local OpenAI-compatible
 * servers) are instance-specific and unknown to this module, so an id this
 * client has never heard of is kept and left for the backend to validate.
 * Anything in a namespace or catalog this client DOES know must be one it
 * offers, which is what drops a value stored before a catalog rename.
 */
function isSelectableModelId(id: string): boolean {
    if (isAllowedModelId(id)) return true;
    if (SETTINGS_ONLY_MODEL_IDS.has(id)) return false;
    return (
        !!id.trim() && !/^(?:openrouter|vercel|ollama|opencode-go)\//.test(id)
    );
}

function readStored(): string {
    if (typeof window === "undefined") return DEFAULT_MODEL_ID;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    // Map renamed static ids to their current equivalents before validating,
    // so a selection stored before a catalog rename keeps working.
    const canonical = raw ? canonicalModelId(raw) : null;
    if (canonical && isSelectableModelId(canonical)) return canonical;
    return DEFAULT_MODEL_ID;
}

function persist(id: string) {
    if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, id);
    }
}

/**
 * @param routerSelections The user's saved router model lists once the
 * profile is loaded, or null/undefined while it is not. When loaded, a stored
 * `openrouter/*` / `vercel/*` selection that is no longer in the saved lists
 * resets to the default model — mirroring how an unavailable first-party id
 * is replaced on read — instead of being silently sent to the backend (which
 * would reject it and degrade the request to the default anyway).
 */
export function useSelectedModel(
    routerSelections?: {
        openRouterModels: string[];
        vercelModels: string[];
        syntheticModels: string[];
    } | null,
): [string, (id: string) => void] {
    const [model, setModelState] = useState<string>(DEFAULT_MODEL_ID);
    const openRouterModels = routerSelections?.openRouterModels;
    const vercelModels = routerSelections?.vercelModels;
    const syntheticModels = routerSelections?.syntheticModels;

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe localStorage read; SSR must render the default model
        setModelState(readStored());
    }, []);

    useEffect(() => {
        if (!openRouterModels || !vercelModels || !syntheticModels) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reconciles state with data that arrives asynchronously (the loaded router lists); the functional update is a no-op unless the stored selection is genuinely stale, so it cannot cascade
        setModelState((current) => {
            const router = current.startsWith("openrouter/")
                ? "openrouter"
                : current.startsWith("vercel/")
                  ? "vercel"
                  : null;
            if (!router) return current;
            const selection =
                router === "openrouter"
                    ? openRouterModels
                    : router === "vercel"
                      ? vercelModels
                      : syntheticModels;
            if (selection.includes(current.slice(router.length + 1))) {
                return current;
            }
            persist(DEFAULT_MODEL_ID);
            return DEFAULT_MODEL_ID;
        });
    }, [openRouterModels, vercelModels, syntheticModels]);

    const setModel = useCallback((id: string) => {
        const canonical = canonicalModelId(id);
        const next = isSelectableModelId(canonical)
            ? canonical
            : DEFAULT_MODEL_ID;
        setModelState(next);
        persist(next);
    }, []);

    return [model, setModel];
}

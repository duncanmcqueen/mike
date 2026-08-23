"use client";

import { useCallback, useEffect, useState } from "react";
import {
    ALLOWED_MODEL_IDS,
    DEFAULT_MODEL_ID,
    canonicalModelId,
    ROUTER_SLUGS,
    type RouterSlug,
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
        ROUTER_SLUGS.some((slug) => id.startsWith(`${slug}/`))
    );
}

function readStored(): string {
    if (typeof window === "undefined") return DEFAULT_MODEL_ID;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    // Map renamed static ids to their current equivalents before validating,
    // so a selection stored before a catalog rename keeps working.
    const canonical = raw ? canonicalModelId(raw) : null;
    if (canonical && isAllowedModelId(canonical)) return canonical;
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
 * router selection (`openrouter/*`, `vercel/*`, `opencode-go/*`) that is no
 * longer in the saved lists resets to the default model — mirroring how an
 * unavailable first-party id is replaced on read — instead of being silently
 * sent to the backend (which would reject it and degrade the request to the
 * default anyway).
 */
export function useSelectedModel(
    routerSelections?: {
        openRouterModels: string[];
        vercelModels: string[];
        openCodeGoModels: string[];
    } | null,
    preselectCandidates?: string[] | null,
): [string, (id: string) => void] {
    const [model, setModelState] = useState<string>(DEFAULT_MODEL_ID);
    const openRouterModels = routerSelections?.openRouterModels;
    const vercelModels = routerSelections?.vercelModels;
    const openCodeGoModels = routerSelections?.openCodeGoModels;

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe localStorage read; SSR must render the default model
        setModelState(readStored());
    }, []);

    useEffect(() => {
        if (!openRouterModels || !vercelModels || !openCodeGoModels) return;
        const selections: Record<RouterSlug, string[]> = {
            openrouter: openRouterModels,
            vercel: vercelModels,
            "opencode-go": openCodeGoModels,
        };
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reconciles state with data that arrives asynchronously (the loaded router lists); the functional update is a no-op unless the stored selection is genuinely stale, so it cannot cascade
        setModelState((current) => {
            let next = current;
            const router = ROUTER_SLUGS.find((slug) =>
                next.startsWith(`${slug}/`),
            );
            if (
                router &&
                !selections[router].includes(next.slice(router.length + 1))
            ) {
                persist(DEFAULT_MODEL_ID);
                next = DEFAULT_MODEL_ID;
            }
            // Empty selection (no stored value, or a stale one reset just
            // above): preselect the first usable candidate instead of
            // leaving the user on an unnamed default. Chained inside this
            // same updater so reset and preselect are atomic.
            if (!next && preselectCandidates?.length) {
                const pick = preselectCandidates.find((id) =>
                    isAllowedModelId(canonicalModelId(id)),
                );
                if (pick) {
                    persist(pick);
                    return pick;
                }
            }
            return next;
        });
    }, [openRouterModels, vercelModels, openCodeGoModels, preselectCandidates]);

    const setModel = useCallback((id: string) => {
        const canonical = canonicalModelId(id);
        const next = isAllowedModelId(canonical) ? canonical : DEFAULT_MODEL_ID;
        setModelState(next);
        persist(next);
    }, []);

    return [model, setModel];
}

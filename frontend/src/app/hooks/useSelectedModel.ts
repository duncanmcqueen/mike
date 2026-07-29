"use client";

import { useCallback, useState } from "react";
import { DEFAULT_MODEL_ID } from "../components/assistant/ModelToggle";

const STORAGE_KEY = "mike.selectedModel";

function readStored(): string {
    if (typeof window === "undefined") return DEFAULT_MODEL_ID;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && raw.trim()) return raw;
    return DEFAULT_MODEL_ID;
}

export function useSelectedModel(): [string, (id: string) => void] {
    const [model, setModelState] = useState<string>(() => readStored());

    const setModel = useCallback((id: string) => {
        const next = id && id.trim() ? id : DEFAULT_MODEL_ID;
        setModelState(next);
        if (typeof window !== "undefined") {
            window.localStorage.setItem(STORAGE_KEY, next);
        }
    }, []);

    return [model, setModel];
}

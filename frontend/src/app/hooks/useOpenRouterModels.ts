"use client";

import { useEffect, useState } from "react";
import {
    getOpenRouterModels,
    type OpenRouterModelOption,
} from "@/app/lib/mikeApi";

let cache: OpenRouterModelOption[] | null = null;
let inflight: Promise<OpenRouterModelOption[]> | null = null;
const listeners = new Set<() => void>();

function load(force = false): Promise<OpenRouterModelOption[]> {
    if (force) {
        cache = null;
        inflight = null;
    }
    if (cache) return Promise.resolve(cache);
    if (!inflight) {
        inflight = getOpenRouterModels()
            .then((models) => {
                cache = models;
                inflight = null;
                listeners.forEach((listener) => listener());
                return models;
            })
            .catch(() => {
                inflight = null;
                return [];
            });
    }
    return inflight;
}

export function refreshOpenRouterModels(): Promise<OpenRouterModelOption[]> {
    return load(true);
}

export function useOpenRouterModels(enabled: boolean): OpenRouterModelOption[] {
    const [models, setModels] = useState<OpenRouterModelOption[]>(cache ?? []);

    useEffect(() => {
        if (!enabled) return;
        const update = () => setModels(cache ?? []);
        listeners.add(update);
        void load().then(update);
        return () => {
            listeners.delete(update);
        };
    }, [enabled]);

    return enabled ? models : [];
}

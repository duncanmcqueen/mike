"use client";

import { useEffect, useState } from "react";
import {
    getOpenCodeGoModels,
    type OpenCodeGoModelOption,
} from "@/app/lib/mikeApi";

let cache: OpenCodeGoModelOption[] | null = null;
let inflight: Promise<OpenCodeGoModelOption[]> | null = null;
const listeners = new Set<() => void>();

function load(force = false): Promise<OpenCodeGoModelOption[]> {
    if (force) {
        cache = null;
        inflight = null;
    }
    if (cache) return Promise.resolve(cache);
    if (!inflight) {
        inflight = getOpenCodeGoModels()
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

export function refreshOpenCodeGoModels(): Promise<OpenCodeGoModelOption[]> {
    return load(true);
}

export function useOpenCodeGoModels(
    enabled: boolean,
): OpenCodeGoModelOption[] {
    const [models, setModels] = useState<OpenCodeGoModelOption[]>(cache ?? []);

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

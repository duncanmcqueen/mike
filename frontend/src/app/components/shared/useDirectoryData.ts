"use client";

import { useEffect, useState } from "react";
import { getProject, listProjects, listStandaloneDocuments } from "@/app/lib/mikeApi";
import type { Document, Project } from "./types";

const CACHE_TTL_MS = 30_000;

interface DirectoryCache {
    standaloneDocuments: Document[];
    projects: Project[];
    fetchedAt: number;
}

let cache: DirectoryCache | null = null;

export function invalidateDirectoryCache() {
    cache = null;
}

function freshCache(): DirectoryCache | null {
    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache;
    return null;
}

export function useDirectoryData(enabled: boolean) {
    const initialCache = useState<DirectoryCache | null>(() =>
        freshCache(),
    )[0];
    const [loading, setLoading] = useState(!initialCache);
    const [standaloneDocuments, setStandaloneDocuments] = useState<Document[]>(
        initialCache?.standaloneDocuments ?? [],
    );
    const [projects, setProjects] = useState<Project[]>(
        initialCache?.projects ?? [],
    );

    // Apply a fresh cache hit during render (React-sanctioned adjust-during-
    // render pattern) so the effect only ever fetches.
    const [appliedCache, setAppliedCache] =
        useState<DirectoryCache | null>(initialCache);
    const currentCache = freshCache();
    if (enabled && currentCache && appliedCache !== currentCache) {
        setAppliedCache(currentCache);
        setStandaloneDocuments(currentCache.standaloneDocuments);
        setProjects(currentCache.projects);
        setLoading(false);
    }

    useEffect(() => {
        if (!enabled) return;
        if (freshCache()) return;

        let cancelled = false;
        Promise.all([listProjects(), listStandaloneDocuments()])
            .then(([ps, ds]) => {
                const sorted = [...ds].sort((a, b) =>
                    (b.created_at ?? "").localeCompare(a.created_at ?? ""),
                );
                return Promise.all(ps.map((p) => getProject(p.id))).then(
                    (fullProjects) => {
                        const projectCounts = new Map(
                            ps.map((p) => [p.id, p.document_count ?? 0]),
                        );
                        const projectsWithCounts = fullProjects.map((project) => ({
                            ...project,
                            document_count:
                                project.documents?.length ??
                                projectCounts.get(project.id) ??
                                0,
                        }));
                        cache = {
                            standaloneDocuments: sorted,
                            projects: projectsWithCounts,
                            fetchedAt: Date.now(),
                        };
                        if (cancelled) return;
                        setAppliedCache(cache);
                        setStandaloneDocuments(sorted);
                        setProjects(projectsWithCounts);
                    },
                );
            })
            .catch(() => {
                if (cancelled) return;
                setStandaloneDocuments([]);
                setProjects([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [enabled]);

    return { loading, standaloneDocuments, projects };
}

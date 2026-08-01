import { useEffect, useState, useCallback } from "react";
import {
  listProjects,
  getProjectDetail,
  type ApiProject,
  type ApiDocument,
} from "../lib/api";

export interface ProjectsState {
  projects: ApiProject[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useProjects(): ProjectsState {
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listProjects()
      .then((rows) => {
        if (!cancelled) setProjects(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Failed to load projects");
      })
      .then(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cancel = reload();
    return cancel;
  }, [reload]);

  return { projects, loading, error, reload };
}

export interface ProjectDocsState {
  documents: ApiDocument[];
  loading: boolean;
  error: string | null;
}

export function useProjectDocuments(projectId: string | null): ProjectDocsState {
  const [documents, setDocuments] = useState<ApiDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setDocuments([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getProjectDetail(projectId)
      .then((docs) => {
        if (!cancelled) setDocuments(docs);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Failed to load documents");
      })
      .then(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return { documents, loading, error };
}

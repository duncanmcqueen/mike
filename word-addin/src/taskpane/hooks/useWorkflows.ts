import { useEffect, useState, useMemo } from "react";
import { listWorkflows, type ApiWorkflow } from "../lib/api";

export interface WorkflowsState {
  workflows: ApiWorkflow[];
  loading: boolean;
  error: string | null;
}

export function useWorkflows(typeFilter: "assistant" | "tabular" | "all" = "assistant"): WorkflowsState {
  const [all, setAll] = useState<ApiWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listWorkflows()
      .then((rows) => {
        if (!cancelled) setAll(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Failed to load workflows");
      })
      .then(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const workflows = useMemo(() => {
    if (typeFilter === "all") return all;
    return all.filter((w) => w.type === typeFilter);
  }, [all, typeFilter]);

  return { workflows, loading, error };
}

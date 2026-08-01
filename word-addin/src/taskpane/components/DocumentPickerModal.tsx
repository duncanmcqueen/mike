// Modal that lets the user attach project documents to the next chat
// message. Always offers a "Current Word document" pseudo-entry at the top,
// and lists docs from the active project (or every project as a fallback).

import React, { useEffect, useMemo, useState } from "react";
import {
  getProject,
  listProjects,
  listProjectDocuments,
  type ApiDocument,
} from "../lib/api";

export interface DocRef {
  /** undefined for the live Word document (handled at send time). */
  document_id?: string;
  filename: string;
  /** Helper flag for the special current-document chip. */
  isCurrentDoc?: boolean;
}

interface Props {
  open: boolean;
  activeProjectId: string | null;
  initialSelected?: DocRef[];
  onClose: () => void;
  onConfirm: (refs: DocRef[]) => void;
}

interface ProjectGroup {
  projectId: string;
  projectName: string;
  documents: ApiDocument[];
}

export default function DocumentPickerModal({
  open,
  activeProjectId,
  initialSelected = [],
  onClose,
  onConfirm,
}: Props) {
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Selection state — keyed by document_id (or "__current__" for the live doc).
  const initialKeys = useMemo(() => {
    const s = new Set<string>();
    for (const r of initialSelected) {
      s.add(r.isCurrentDoc ? "__current__" : (r.document_id ?? ""));
    }
    return s;
  }, [initialSelected]);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialKeys));

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(initialKeys));
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        if (activeProjectId) {
          const proj = await getProject(activeProjectId);
          let docs = proj.documents;
          if (!docs) {
            docs = await listProjectDocuments(activeProjectId);
          }
          setGroups([
            {
              projectId: proj.id,
              projectName: proj.name,
              documents: docs ?? [],
            },
          ]);
        } else {
          // Fallback: list every project, fetch its documents.
          const projects = await listProjects();
          const all = await Promise.all(
            projects.map(async (p) => ({
              projectId: p.id,
              projectName: p.name,
              documents: await listProjectDocuments(p.id).catch(() => []),
            })),
          );
          setGroups(all);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [open, activeProjectId, initialKeys]);

  if (!open) return null;

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const confirm = () => {
    const refs: DocRef[] = [];
    if (selected.has("__current__")) {
      refs.push({ filename: "Current Word document", isCurrentDoc: true });
    }
    for (const g of groups) {
      for (const d of g.documents) {
        if (selected.has(d.id)) {
          refs.push({ document_id: d.id, filename: d.filename });
        }
      }
    }
    onConfirm(refs);
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 shrink-0">
        <h2 className="font-serif text-sm text-gray-800">Attach documents</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            className="text-xs px-2.5 py-1 rounded-md bg-mike-500 text-white hover:bg-mike-600"
          >
            Attach ({selected.size})
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Always-on "Current document" row */}
        <label className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 cursor-pointer hover:bg-gray-50">
          <input
            type="checkbox"
            checked={selected.has("__current__")}
            onChange={() => toggle("__current__")}
            className="accent-mike-500"
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-gray-800">Current Word document</div>
            <div className="text-[10px] text-gray-400">
              The contents of the document open in Word right now.
            </div>
          </div>
        </label>

        {loading ? (
          <div className="p-4 text-xs text-gray-400">Loading…</div>
        ) : error ? (
          <div className="p-4 text-xs text-red-600">Failed: {error}</div>
        ) : groups.length === 0 ? (
          <div className="p-4 text-xs text-gray-400">No projects.</div>
        ) : (
          groups.map((g) => (
            <div key={g.projectId}>
              <div className="px-3 py-1 bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
                {g.projectName}
              </div>
              {g.documents.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-gray-400">
                  No documents.
                </div>
              ) : (
                <ul>
                  {g.documents.map((d) => (
                    <li key={d.id}>
                      <label className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={selected.has(d.id)}
                          onChange={() => toggle(d.id)}
                          className="accent-mike-500"
                        />
                        <span className="text-xs text-gray-700 truncate flex-1">
                          {d.filename}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

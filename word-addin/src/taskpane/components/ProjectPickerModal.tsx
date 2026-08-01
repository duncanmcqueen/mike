import React, { useEffect, useState } from "react";
import { useProjects } from "../hooks/useProjects";

// Minimal modal for picking the project to save assistant-generated
// documents into. Opens when the user toggles "Create new" creation mode
// without an active project context. Wraps the existing useProjects hook
// so it gets the same data the Projects tab uses.

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (projectId: string) => void;
}

export default function ProjectPickerModal({ open, onClose, onSelect }: Props) {
  const { projects, loading, error, reload } = useProjects();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? projects.filter((p) => p.name.toLowerCase().includes(q))
    : projects;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm max-h-[80vh] flex flex-col bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
          <span className="font-serif text-sm text-gray-900">
            Pick a project
          </span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700"
            aria-label="Cancel"
          >
            ✕
          </button>
        </div>

        <div className="px-3 py-2 border-b border-gray-100">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-gray-300"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-gray-500">
              <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
              Loading projects…
            </div>
          )}
          {error && (
            <p className="px-3 py-3 text-xs text-red-600">{error}</p>
          )}
          {!loading && !error && filtered.length === 0 && (
            <p className="px-3 py-4 text-xs text-gray-500">
              {projects.length === 0
                ? "No projects yet. Create one in the desktop app, then come back."
                : "No projects match your search."}
            </p>
          )}
          <ul>
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(p.id);
                    onClose();
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50"
                >
                  <div className="text-xs font-medium text-gray-900 truncate">
                    {p.name}
                  </div>
                  {p.cm_number && (
                    <div className="text-[10px] text-gray-500 truncate mt-0.5">
                      {p.cm_number}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from "react";
import { useProjects, useProjectDocuments } from "../hooks/useProjects";
import { useChatContext } from "../contexts/ChatContextStore";
import { openInDesktop, type ApiProject } from "../lib/api";

// "Open in desktop" used to use the `mike://` URL scheme, but macOS
// LaunchServices routes it to the wrong (generic) Electron binary in dev
// mode. We now POST the target route to the backend, which broadcasts a
// `desktop.navigate` SSE event. The Electron main process subscribes and
// focuses the window + loads the page.

function ChevronRight() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function formatBytes(n: number | null): string {
  if (!n || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function ProjectListView({
  projects,
  loading,
  error,
  onPick,
}: {
  projects: ApiProject[];
  loading: boolean;
  error: string | null;
  onPick: (p: ApiProject) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        Loading projects…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-red-500 px-6 text-center">
        {error}
      </div>
    );
  }
  if (projects.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-500 px-6 text-center">
        No projects yet. Create one in the desktop app.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 px-3 py-3 overflow-y-auto h-full">
      <h2 className="font-serif text-xl text-gray-900 px-1 mb-1">Projects</h2>
      {projects.map((p) => (
        <button
          key={p.id}
          onClick={() => onPick(p)}
          className="text-left bg-white border border-gray-200 rounded-2xl p-4 hover:bg-gray-50 cursor-pointer transition-colors"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-serif text-base text-gray-900 truncate">
                {p.name}
              </div>
              {p.cm_number ? (
                <div className="text-xs text-gray-500 mt-0.5 truncate">
                  {p.cm_number}
                </div>
              ) : null}
              <div className="text-xs text-gray-400 mt-1">
                {p.document_count ?? 0} document
                {(p.document_count ?? 0) === 1 ? "" : "s"}
              </div>
            </div>
            <span className="text-gray-400 mt-1">
              <ChevronRight />
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

function ProjectDetailView({
  project,
  onBack,
}: {
  project: ApiProject;
  onBack: () => void;
}) {
  const { documents, loading, error } = useProjectDocuments(project.id);
  const { activeProjectId, setActiveProjectId } = useChatContext();
  const isActive = activeProjectId === project.id;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        <button
          onClick={onBack}
          className="text-gray-500 hover:text-gray-900 p-1 -ml-1"
          title="Back"
        >
          <ChevronLeft />
        </button>
        <span className="text-xs text-gray-400">Projects</span>
      </div>
      <div className="px-4 py-2">
        <h2 className="font-serif text-xl text-gray-900">{project.name}</h2>
        {project.cm_number ? (
          <p className="text-xs text-gray-500 mt-0.5">{project.cm_number}</p>
        ) : null}
      </div>
      <div className="px-3 pb-2 flex flex-col gap-2">
        <button
          onClick={() => setActiveProjectId(isActive ? null : project.id)}
          className={`text-sm rounded-2xl px-4 py-2 border transition-colors ${
            isActive
              ? "bg-gray-900 text-white border-gray-900 hover:bg-gray-800"
              : "bg-white text-gray-900 border-gray-200 hover:bg-gray-50"
          }`}
        >
          {isActive ? "Chat scoped to this project ✓" : "Set as chat context"}
        </button>
        <button
          type="button"
          onClick={() => {
            void openInDesktop(`/projects/${project.id}`);
          }}
          className="text-sm rounded-2xl px-4 py-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-center"
        >
          Open in desktop ↗
        </button>
      </div>

      <div className="px-3 pt-3 pb-4">
        <h3 className="font-serif text-sm text-gray-500 px-1 mb-2">
          Documents
        </h3>
        {loading ? (
          <div className="text-xs text-gray-400 px-1 py-2">Loading…</div>
        ) : error ? (
          <div className="text-xs text-red-500 px-1 py-2">{error}</div>
        ) : documents.length === 0 ? (
          <div className="text-xs text-gray-400 px-1 py-2">
            No documents in this project.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {documents.map((d) => (
              <div
                key={d.id}
                className="bg-white border border-gray-200 rounded-2xl p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-gray-900 truncate">
                      {d.filename}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {formatBytes(d.size_bytes)}
                      {d.page_count ? ` · ${d.page_count} pp.` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void openInDesktop(
                        `/projects/${project.id}?doc=${d.id}`,
                      );
                    }}
                    className="text-xs text-gray-500 hover:text-gray-900 whitespace-nowrap"
                  >
                    View ↗
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProjectsTab() {
  const { projects, loading, error } = useProjects();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId
    ? projects.find((p) => p.id === selectedId) || null
    : null;

  if (selected) {
    return (
      <ProjectDetailView
        project={selected}
        onBack={() => setSelectedId(null)}
      />
    );
  }
  return (
    <ProjectListView
      projects={projects}
      loading={loading}
      error={error}
      onPick={(p) => setSelectedId(p.id)}
    />
  );
}

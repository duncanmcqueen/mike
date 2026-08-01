// Tiny global store shared between the Projects/Workflows tabs and the Chat
// tab. Intentionally minimal: a module-scoped state object plus an
// EventTarget for change notifications, exposed through a `useChatContext`
// hook. No external deps.
//
// State:
//   - activeProjectId: scopes chat to a project (Chat tab uses
//     POST /projects/:id/chat when set). Persisted to localStorage so it
//     survives reloads.
//   - pendingWorkflow: a one-shot handoff from the Workflows tab to the
//     Chat composer. In-memory only; consumePendingWorkflow() reads-and-clears.

import { useEffect, useState, useCallback } from "react";

const PROJECT_KEY = "mike.activeProject";

export interface PendingWorkflow {
  id: string;
  title: string;
}

interface StoreState {
  activeProjectId: string | null;
  pendingWorkflow: PendingWorkflow | null;
}

function readInitialProjectId(): string | null {
  try {
    return window.localStorage.getItem(PROJECT_KEY);
  } catch {
    return null;
  }
}

const state: StoreState = {
  activeProjectId: readInitialProjectId(),
  pendingWorkflow: null,
};

const bus = new EventTarget();
const CHANGE = "change";

function emit() {
  bus.dispatchEvent(new Event(CHANGE));
}

function persistProject(id: string | null) {
  try {
    if (id) window.localStorage.setItem(PROJECT_KEY, id);
    else window.localStorage.removeItem(PROJECT_KEY);
  } catch {
    /* ignore */
  }
}

export function getChatContext(): StoreState {
  return { ...state };
}

export function setActiveProjectId(id: string | null): void {
  if (state.activeProjectId === id) return;
  state.activeProjectId = id;
  persistProject(id);
  emit();
}

export function setPendingWorkflow(wf: PendingWorkflow | null): void {
  state.pendingWorkflow = wf;
  emit();
}

/** Read and clear the pending workflow. Chat tab calls this once it picks it up. */
export function consumePendingWorkflow(): PendingWorkflow | null {
  const wf = state.pendingWorkflow;
  if (wf) {
    state.pendingWorkflow = null;
    emit();
  }
  return wf;
}

export function useChatContext() {
  const [snapshot, setSnapshot] = useState<StoreState>(() => getChatContext());

  useEffect(() => {
    const handler = () => setSnapshot(getChatContext());
    bus.addEventListener(CHANGE, handler);
    return () => bus.removeEventListener(CHANGE, handler);
  }, []);

  const setProject = useCallback((id: string | null) => {
    setActiveProjectId(id);
  }, []);
  const setWorkflow = useCallback((wf: PendingWorkflow | null) => {
    setPendingWorkflow(wf);
  }, []);
  const consume = useCallback(() => consumePendingWorkflow(), []);

  return {
    activeProjectId: snapshot.activeProjectId,
    setActiveProjectId: setProject,
    pendingWorkflow: snapshot.pendingWorkflow,
    setPendingWorkflow: setWorkflow,
    consumePendingWorkflow: consume,
  };
}

// ---------------------------------------------------------------------------
// Tab switching helper. Coordinated with Agent A: MainLayout listens for
// `mike.tab.switch` events on window with `detail` set to a TabId string.
// If the listener isn't wired yet, this is a no-op (the pendingWorkflow
// is still set, so the user can switch manually).
// ---------------------------------------------------------------------------

export type TabSwitchTarget =
  | "chat"
  | "projects"
  | "tabular"
  | "workflows"
  | "track";

export function requestTabSwitch(target: TabSwitchTarget): void {
  try {
    window.dispatchEvent(
      new CustomEvent<TabSwitchTarget>("mike.tab.switch", { detail: target }),
    );
  } catch {
    /* ignore */
  }
}

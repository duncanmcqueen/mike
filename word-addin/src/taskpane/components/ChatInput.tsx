import React, { useEffect, useRef, useState } from "react";
import ModelSelector from "./ModelSelector";
import WorkflowPickerModal, {
  type PickedWorkflow,
} from "./WorkflowPickerModal";
import DocumentPickerModal, { type DocRef } from "./DocumentPickerModal";
import ProjectPickerModal from "./ProjectPickerModal";
import { useChatContext } from "../contexts/ChatContextStore";
// EditModeToggle import removed — the Track-changes / Comments choice now
// lives on each suggestion card. EditMode type still threads through for
// per-card primary-button styling.
import type { WordSelectionState } from "../hooks/useWordDoc";

const CREATION_MODE_STORAGE_KEY = "mike.creationMode";

type EditMode = "track" | "comments";
export type CreationMode = "project" | "this_word_doc";

interface SendOpts {
  useDoc: boolean;
  selection?: WordSelectionState;
  creationMode: CreationMode;
}

interface Props {
  onSend: (text: string, opts: SendOpts) => void;
  isLoading: boolean;
  onCancel: () => void;
  // Composer state — owned by the surrounding ChatPanel/useChat hook.
  selectedModel: string;
  onModelChange: (id: string) => void;
  selectedWorkflow: PickedWorkflow | null;
  onWorkflowChange: (wf: PickedWorkflow | null) => void;
  attachedDocs: DocRef[];
  onAttachedDocsChange: (refs: DocRef[]) => void;
  editMode: EditMode;
  onEditModeChange: (m: EditMode) => void;
  /** Current Word selection at compose time. Drives the selection chip. */
  selection?: WordSelectionState;
  /** Optional callback fired when the user dismisses the selection chip. */
  onSelectionDismiss?: () => void;
  /**
   * Click-action buttons that operate on the most recent assistant message.
   * Disabled (hidden) until ChatPanel has a finalized assistant turn.
   */
  canApplyOutput: boolean;
  onCreateNewDoc: () => Promise<void> | void;
  onInsertToDoc: () => Promise<void> | void;
}

export default function ChatInput({
  onSend,
  isLoading,
  onCancel,
  selectedModel,
  onModelChange,
  selectedWorkflow,
  onWorkflowChange,
  attachedDocs,
  onAttachedDocsChange,
  editMode,
  onEditModeChange,
  selection,
  onSelectionDismiss,
  canApplyOutput,
  onCreateNewDoc,
  onInsertToDoc,
}: Props) {
  const [text, setText] = useState("");
  const [useDoc, setUseDoc] = useState(false);
  const [docPickerOpen, setDocPickerOpen] = useState(false);
  const [workflowPickerOpen, setWorkflowPickerOpen] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [creationMode, setCreationModeState] = useState<CreationMode>("project");
  // Click-action button state. `applyBusy` holds the in-flight action
  // (or null), `applyStatus` is a transient success/error toast that
  // auto-fades after a few seconds.
  const [applyBusy, setApplyBusy] = useState<"create" | "insert" | null>(null);
  const [applyStatus, setApplyStatus] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  useEffect(() => {
    if (!applyStatus) return;
    const t = setTimeout(() => setApplyStatus(null), 3000);
    return () => clearTimeout(t);
  }, [applyStatus]);
  // Local one-shot dismiss for the selection chip — clears the upcoming
  // send's selection without changing the underlying Word selection.
  const [ignoreSelection, setIgnoreSelection] = useState(false);

  // Reset ignore-selection whenever the underlying selection changes — the
  // user re-selecting in Word should re-arm the chip.
  useEffect(() => {
    setIgnoreSelection(false);
  }, [selection?.text]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { activeProjectId, setActiveProjectId } = useChatContext();

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const cm = window.localStorage.getItem(CREATION_MODE_STORAGE_KEY);
        if (cm === "this_word_doc" || cm === "project") {
          setCreationModeState(cm);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setCreationMode = (next: CreationMode) => {
    setCreationModeState(next);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(CREATION_MODE_STORAGE_KEY, next);
      }
    } catch {
      /* ignore */
    }
  };

  // If any attached doc is the current Word doc, send useDoc=true regardless
  // of the toggle. The chip provides a more discoverable affordance.
  const computedUseDoc =
    useDoc || attachedDocs.some((d) => d.isCurrentDoc === true);

  const activeSelection =
    selection && !selection.isEmpty && !ignoreSelection ? selection : undefined;

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed, {
      useDoc: computedUseDoc,
      selection: activeSelection,
      creationMode,
    });
    setText("");
    setIgnoreSelection(false);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const removeDoc = (idx: number) => {
    const next = [...attachedDocs];
    next.splice(idx, 1);
    onAttachedDocsChange(next);
  };

  const hasChips =
    attachedDocs.length > 0 || selectedWorkflow || !!activeSelection;

  return (
    <div className="border-t border-gray-100 p-2 shrink-0 bg-white">
      {/* Chip row — selection + attached docs + workflow */}
      {hasChips && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {activeSelection && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 text-xs"
              title={`The agent will scope its edits to your ${activeSelection.length}-character selection.`}
            >
              <span className="font-medium">Selection:</span>
              <span className="truncate max-w-[160px] font-serif italic">
                "{activeSelection.snippet}"
              </span>
              <button
                onClick={() => {
                  setIgnoreSelection(true);
                  onSelectionDismiss?.();
                }}
                className="text-amber-700 hover:text-amber-900"
                aria-label="Ignore selection for next message"
              >
                ✕
              </button>
            </span>
          )}
          {selectedWorkflow && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-mike-50 text-mike-700 text-[11px] border border-mike-200">
              <span className="font-medium">Workflow:</span>
              <span className="truncate max-w-[140px]">
                {selectedWorkflow.title}
              </span>
              <button
                onClick={() => onWorkflowChange(null)}
                className="text-mike-500 hover:text-mike-700"
                aria-label="Remove workflow"
              >
                ✕
              </button>
            </span>
          )}
          {attachedDocs.map((d, i) => (
            <span
              key={`${d.document_id ?? "current"}-${i}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 text-[11px]"
            >
              <span className="truncate max-w-[140px]">{d.filename}</span>
              <button
                onClick={() => removeDoc(i)}
                className="text-gray-400 hover:text-gray-700"
                aria-label="Remove document"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-1.5">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          rows={1}
          placeholder="Ask Mike anything…"
          disabled={isLoading}
          className="flex-1 resize-none px-2.5 py-2 text-sm border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-mike-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
          style={{ minHeight: "36px", maxHeight: "120px" }}
        />

        {isLoading ? (
          <button
            onClick={onCancel}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
            title="Cancel"
          >
            ■
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-mike-500 hover:bg-mike-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Send (Enter)"
          >
            ▸
          </button>
        )}
      </div>

      {/* Toolbar row */}
      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
        <button
          type="button"
          onClick={() => setDocPickerOpen(true)}
          title="Attach documents"
          className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setWorkflowPickerOpen(true)}
          title="Pick a workflow"
          className="px-2 h-7 rounded-md border border-gray-200 text-[11px] text-gray-600 hover:bg-gray-50"
        >
          Workflow
        </button>
        <ModelSelector value={selectedModel} onChange={onModelChange} />

        {/* Edit-mode toggle removed — Track / Comments choice now lives on
            each suggestion card (and in workflows). Keeping the props alive
            so the parent can still drive per-card primary styling without
            this row of pills cluttering the composer. */}

        {/*
          Click-action buttons: act on the latest assistant message.
          - "Create new" saves the chat output to the active project as a
            new .docx (opens project picker if no project is bound).
          - "Insert to doc" appends the chat output at the end of the
            currently open Word document.
          Both are disabled until ChatPanel reports a finalized assistant
          turn (canApplyOutput).
        */}
        <button
          type="button"
          disabled={!canApplyOutput || applyBusy !== null}
          onClick={async () => {
            if (applyBusy) return;
            setApplyBusy("create");
            setApplyStatus(null);
            try {
              await onCreateNewDoc();
              setApplyStatus({ kind: "ok", text: "Saved to project" });
            } catch (e) {
              setApplyStatus({
                kind: "err",
                text: (e as Error).message || "Save failed",
              });
            } finally {
              setApplyBusy(null);
            }
          }}
          className="inline-flex items-center gap-1 px-2 h-5 rounded-full border border-gray-300 bg-white text-[10px] text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Save the latest reply to your project as a new document."
        >
          {applyBusy === "create" && (
            <span className="inline-block w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />
          )}
          Create new
        </button>
        <button
          type="button"
          disabled={!canApplyOutput || applyBusy !== null}
          onClick={async () => {
            if (applyBusy) return;
            setApplyBusy("insert");
            setApplyStatus(null);
            try {
              await onInsertToDoc();
              setApplyStatus({ kind: "ok", text: "Inserted into Word" });
            } catch (e) {
              setApplyStatus({
                kind: "err",
                text: (e as Error).message || "Insert failed",
              });
            } finally {
              setApplyBusy(null);
            }
          }}
          className="inline-flex items-center gap-1 px-2 h-5 rounded-full border border-gray-300 bg-white text-[10px] text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Append the latest reply to the end of the current Word document."
        >
          {applyBusy === "insert" && (
            <span className="inline-block w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />
          )}
          Insert to doc
        </button>
        {applyStatus && (
          <span
            className={
              "text-[10px] " +
              (applyStatus.kind === "ok"
                ? "text-green-700"
                : "text-red-600")
            }
          >
            {applyStatus.text}
          </span>
        )}

        {/* Use current document toggle */}
        <label className="flex items-center gap-1 cursor-pointer select-none ml-auto">
          <div
            onClick={() => setUseDoc((v) => !v)}
            className={`relative w-7 h-4 rounded-full transition-colors ${
              useDoc ? "bg-mike-500" : "bg-gray-300"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${
                useDoc ? "translate-x-3" : ""
              }`}
            />
          </div>
          <span className="text-[11px] text-gray-600">Current doc</span>
        </label>
      </div>

      {(useDoc || attachedDocs.some((d) => d.isCurrentDoc)) && (
        <p className="text-[10px] text-gray-400 mt-1">
          The full text of your open Word document will be sent as context.
        </p>
      )}

      {/* Modals */}
      <WorkflowPickerModal
        open={workflowPickerOpen}
        onClose={() => setWorkflowPickerOpen(false)}
        onSelect={(wf) => {
          onWorkflowChange(wf);
          setWorkflowPickerOpen(false);
        }}
      />
      <DocumentPickerModal
        open={docPickerOpen}
        activeProjectId={activeProjectId}
        initialSelected={attachedDocs}
        onClose={() => setDocPickerOpen(false)}
        onConfirm={(refs) => {
          onAttachedDocsChange(refs);
          setDocPickerOpen(false);
        }}
      />
      <ProjectPickerModal
        open={projectPickerOpen}
        onClose={() => setProjectPickerOpen(false)}
        onSelect={(projectId) => {
          // Bind the chat to the picked project so subsequent assistant
          // turns route through /projects/:id/chat (and generated docs
          // attach to that project). Then flip the creation-mode toggle
          // to "project" — that's what the user clicked toward.
          setActiveProjectId(projectId);
          setCreationMode("project");
        }}
      />
    </div>
  );
}

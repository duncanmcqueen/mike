import React, { useEffect, useRef, useState } from "react";
import { useChat } from "../hooks/useChat";
import {
  getDocumentForContext,
  getSelectionState,
  type WordSelectionState,
} from "../hooks/useWordDoc";
import { useChatContext } from "../contexts/ChatContextStore";
import ChatMessageBubble from "./ChatMessage";
import ChatInput from "./ChatInput";
import ChatHistoryList from "./ChatHistoryList";
import ProjectPickerModal from "./ProjectPickerModal";
import RiskInsightsCard from "./RiskInsightsCard";
import { useRiskScan } from "../hooks/useRiskScan";
import { uploadDocumentBlob } from "../lib/api";
import { applyWriteToWord } from "../lib/wordWrite";
import { getOpenDocumentBytes } from "../lib/wordDocBytes";
import { useAuth } from "../contexts/AuthContext";

export default function ChatPanel() {
  const { signOut } = useAuth();
  const {
    messages,
    isLoading,
    activeChatId,
    chatTitle,
    sendMessage,
    cancelStream,
    newChat,
    loadChat,
    selectedModel,
    setSelectedModel,
    selectedWorkflow,
    setSelectedWorkflow,
    attachedDocs,
    setAttachedDocs,
    editMode,
    setEditMode,
  } = useChat();

  const { activeProjectId, setActiveProjectId, consumePendingWorkflow } =
    useChatContext();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  // Pending action that needs a project to be picked first. When the user
  // clicks "Create new" with no active project, we open the picker; once
  // they pick we re-fire the pending action.
  const [pendingAfterPick, setPendingAfterPick] = useState<
    "create-new-doc" | null
  >(null);
  const riskScan = useRiskScan();
  const [selection, setSelection] = useState<WordSelectionState>({
    text: "",
    isEmpty: true,
    length: 0,
    snippet: "",
  });
  const bottomRef = useRef<HTMLDivElement>(null);

  // Refresh the Word selection state on mount and whenever the taskpane
  // gains focus — that's the closest signal we have to "the user is about
  // to compose a message and may have just highlighted something".
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await getSelectionState();
        if (!cancelled) setSelection(next);
      } catch {
        /* ignore */
      }
    };
    refresh();
    const onFocus = () => {
      void refresh();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("focus", onFocus);
    }
    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", onFocus);
      }
    };
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Consume any pending workflow handed off from the Workflows tab.
  useEffect(() => {
    const pending = consumePendingWorkflow();
    if (pending) {
      setSelectedWorkflow({
        id: pending.id,
        title: pending.title,
        prompt_md: null,
      });
    }
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = async (
    text: string,
    opts:
      | {
          useDoc: boolean;
          selection?: WordSelectionState;
          creationMode?: "project" | "this_word_doc";
        }
      | boolean,
  ) => {
    const useDoc = typeof opts === "boolean" ? opts : opts.useDoc;
    const sel = typeof opts === "boolean" ? undefined : opts.selection;
    const creationMode =
      typeof opts === "boolean" ? "project" : opts.creationMode ?? "project";

    // Re-read the selection at send time so a stale chip doesn't get used.
    let liveSelection = sel;
    if (sel && !sel.isEmpty) {
      try {
        const fresh = await getSelectionState();
        if (!fresh.isEmpty) liveSelection = fresh;
      } catch {
        /* fall back to whatever the chip captured */
      }
    }

    let docContext: string | undefined;
    if (useDoc) {
      try {
        docContext = await getDocumentForContext();
      } catch {
        docContext = undefined;
      }
    }
    sendMessage(text, docContext, {
      selection: liveSelection,
      creationMode,
    });
  };

  // ------------------------------------------------------------------
  // "Create new" / "Insert to doc" click actions
  // ------------------------------------------------------------------
  // Both buttons act on the latest *finalized* assistant message — the
  // markdown body of that turn, with any fenced JSON edit/write blocks
  // stripped out (those are handled separately by the proposal cards
  // and live in the assistant's reasoning, not in user-visible content).

  const lastAssistant = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "assistant" && !m.isStreaming && m.content?.trim()) {
        return m;
      }
    }
    return null;
  })();

  const cleanAssistantBody = (raw: string): string =>
    raw
      .replace(/```(?:json)?\s*\{[\s\S]*?"edits"[\s\S]*?```/g, "")
      .replace(/```(?:json)?\s*\{[\s\S]*?"writes"[\s\S]*?```/g, "")
      .trim();

  // "Create new" is always enabled — it acts on the currently open Word
  // document, not on the chat. The Insert action still needs an assistant
  // reply to insert.
  const canApplyOutput = !!lastAssistant;

  const handleCreateNewDoc = async () => {
    // Snapshot whatever Word doc is open right now (works even if it
    // hasn't been saved to disk — Office hands us an in-memory .docx)
    // and POST the bytes to the active project. If no project is bound
    // yet, defer behind the picker; once the user picks, we re-fire.
    if (!activeProjectId) {
      setPendingAfterPick("create-new-doc");
      setProjectPickerOpen(true);
      return;
    }
    const { blob, filename } = await getOpenDocumentBytes();
    await uploadDocumentBlob({
      blob,
      filename,
      projectId: activeProjectId,
    });
  };

  const handleInsertToDoc = async () => {
    if (!lastAssistant) throw new Error("No assistant reply to insert yet.");
    const body = cleanAssistantBody(lastAssistant.content);
    if (!body) throw new Error("The latest reply is empty.");
    await applyWriteToWord({ at: "end", content_md: body });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 shrink-0">
        <button
          onClick={() => setHistoryOpen(true)}
          className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50"
          aria-label="Show chat history"
          title="Chat history"
        >
          <svg
            viewBox="0 0 16 16"
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="2" y1="4" x2="14" y2="4" />
            <line x1="2" y1="8" x2="14" y2="8" />
            <line x1="2" y1="12" x2="14" y2="12" />
          </svg>
        </button>
        <div className="flex-1 min-w-0 font-serif text-sm text-gray-700 truncate">
          {chatTitle?.trim() || (activeChatId ? "Chat" : "New chat")}
          {activeProjectId && (
            <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full bg-mike-50 text-mike-700 text-[9px] uppercase tracking-wider">
              project
            </span>
          )}
        </div>
        <button
          onClick={() => {
            void riskScan.runRedFlagScan();
          }}
          className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
          aria-label="Run risk scan"
          title="Run risk scan on current document"
          disabled={isLoading || riskScan.status === "running"}
        >
          <svg
            viewBox="0 0 16 16"
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 1.5l5.5 2v4.2c0 3.4-2.3 6.4-5.5 7.3-3.2-.9-5.5-3.9-5.5-7.3V3.5L8 1.5z" />
            <line x1="8" y1="6" x2="8" y2="9" />
            <circle cx="8" cy="11" r="0.5" />
          </svg>
        </button>
        <button
          onClick={newChat}
          className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50"
          aria-label="New chat"
          title="New chat"
          disabled={isLoading}
        >
          +
        </button>
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50"
          aria-label="Sign out"
          title="Sign out"
        >
          <svg
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6.5 2.5H3.5v11h3" />
            <path d="M8.5 5l3 3-3 3" />
            <path d="M11.5 8h-6" />
          </svg>
        </button>
      </div>

      {/* Risk Insights — pinned above messages when a scan has run or is in flight */}
      {(riskScan.status === "running" ||
        riskScan.status === "error" ||
        (riskScan.redFlags && riskScan.redFlags.length > 0) ||
        (riskScan.definedTermIssues &&
          riskScan.definedTermIssues.length > 0)) && (
        <RiskInsightsCard
          redFlags={riskScan.redFlags}
          definedTermIssues={riskScan.definedTermIssues}
          status={riskScan.status}
          error={riskScan.error}
          onRunRedFlag={() => void riskScan.runRedFlagScan()}
          onRunDefinedTerms={() => void riskScan.runDefinedTermsCheck()}
          onDismiss={riskScan.clear}
        />
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-3 pt-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center pb-8">
            <div className="w-10 h-10 rounded-xl bg-mike-50 flex items-center justify-center mb-3">
              <span className="text-mike-500 text-lg">✦</span>
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">
              Mike AI for Word
            </p>
            <p className="text-xs text-gray-400 max-w-[220px]">
              Ask Mike to analyze, edit, or improve your document. Toggle
              "Current doc" or attach files to add context.
            </p>
            <div className="mt-4 space-y-1.5 w-full max-w-[240px]">
              {[
                "Review this contract for risky clauses",
                "Fix grammar and punctuation",
                "Summarize the key obligations",
                "Make the tone more formal",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s, true)}
                  className="w-full text-left text-xs text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-2.5 py-1.5 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <ChatMessageBubble key={i} message={msg} />
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        isLoading={isLoading}
        onCancel={cancelStream}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        selectedWorkflow={selectedWorkflow}
        onWorkflowChange={setSelectedWorkflow}
        attachedDocs={attachedDocs}
        onAttachedDocsChange={setAttachedDocs}
        editMode={editMode}
        onEditModeChange={setEditMode}
        canApplyOutput={canApplyOutput}
        onCreateNewDoc={handleCreateNewDoc}
        onInsertToDoc={handleInsertToDoc}
      />

      {/* History drawer */}
      <ChatHistoryList
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        activeChatId={activeChatId}
        onPick={(id) => loadChat(id)}
        onNewChat={newChat}
      />

      {/* Project picker — opened by "Create new" when no active project */}
      <ProjectPickerModal
        open={projectPickerOpen}
        onClose={() => {
          setProjectPickerOpen(false);
          setPendingAfterPick(null);
        }}
        onSelect={(projectId) => {
          setActiveProjectId(projectId);
          // Re-fire any deferred action now that a project is bound.
          if (pendingAfterPick === "create-new-doc") {
            void (async () => {
              try {
                const { blob, filename } = await getOpenDocumentBytes();
                await uploadDocumentBlob({
                  blob,
                  filename,
                  projectId,
                });
              } catch (e) {
                // eslint-disable-next-line no-console
                console.error("[create-new-doc deferred]", e);
              }
            })();
          }
          setPendingAfterPick(null);
        }}
      />
    </div>
  );
}

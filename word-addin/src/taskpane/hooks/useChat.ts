import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiChatMessage, StreamChatPayload } from "../lib/api";
import { getChat, streamChat, streamProjectChat } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useChatContext } from "../contexts/ChatContextStore";
import type { EditProposal, WordSelectionState } from "./useWordDoc";
import {
  DEFAULT_MODEL_ID,
  MODEL_STORAGE_KEY,
} from "../components/ModelSelector";
import type { DocRef } from "../components/DocumentPickerModal";
import type { PickedWorkflow } from "../components/WorkflowPickerModal";

export type { EditProposal, WordSelectionState };
export type EditMode = "track" | "comments";
export type CreationMode = "project" | "this_word_doc";

export type WriteProposal = {
  at: "selection" | "end" | "after_selection";
  content_md: string;
};

export interface ChatMessage {
  role: "user" | "assistant";
  /** Displayed content (user text or assistant markdown). */
  content: string;
  isStreaming?: boolean;
  /** Parsed from AI JSON block — available after stream completes. */
  editProposals?: EditProposal[];
  /** Parsed from AI JSON block — write-into-document proposals. */
  writeProposals?: WriteProposal[];
  error?: string;
  /**
   * Streaming reasoning / thinking text from the model when extended
   * thinking is enabled (Claude `thinking: adaptive`, Gemini
   * `includeThoughts: true`). Rendered as a collapsible block above the
   * visible answer. Kept for back-compat — new code reads from `steps`.
   */
  thinking?: string;
  /** True while reasoning is actively streaming — drives the "Thinking…" pill. */
  isThinking?: boolean;
  /**
   * Multi-step trace of the assistant's turn — interleaved reasoning
   * blocks and tool calls. Rendered as a vertical timeline with the
   * current step highlighted. Mirrors the desktop's "Completed in N
   * steps" panel.
   */
  steps?: TraceStep[];
  /**
   * Documents the assistant created during this turn (via `generate_docx`).
   * Rendered below the bubble as click-to-open-in-Word cards.
   */
  createdDocs?: CreatedDocRef[];
}

export interface CreatedDocRef {
  documentId?: string;
  filename: string;
  /** Server-signed loopback URL the file can be fetched from. */
  downloadUrl: string;
}

export type TraceStep =
  | { kind: "thinking"; text: string; done: boolean }
  | { kind: "doc_read"; filename: string; done: boolean }
  | { kind: "doc_find"; done: boolean }
  | { kind: "doc_edited"; filename: string; done: boolean }
  | { kind: "doc_created"; filename: string; done: boolean }
  | { kind: "doc_replicated"; filename: string; done: boolean };

// ---------------------------------------------------------------------------
// JSON edit block parser
// Looks for: ```json\n{"edits": [...]}``` anywhere in the assistant reply.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Trace-step helpers — small pure utilities used by the SSE handler to push
// new steps and mark them complete. Keeping them here so the streaming
// switch stays readable.
// ---------------------------------------------------------------------------

function updateLast(
  prev: ChatMessage[],
  patch: (last: ChatMessage) => ChatMessage,
): ChatMessage[] {
  const updated = [...prev];
  const last = updated[updated.length - 1];
  if (last?.role === "assistant") {
    updated[updated.length - 1] = patch(last);
  }
  return updated;
}

function closeLastStep(
  steps: TraceStep[] | undefined,
  kind: TraceStep["kind"],
  filename?: string,
): TraceStep[] {
  if (!steps) return [];
  const out = [...steps];
  for (let i = out.length - 1; i >= 0; i--) {
    const s = out[i];
    if (s.kind !== kind || s.done) continue;
    if (
      filename &&
      "filename" in s &&
      typeof s.filename === "string" &&
      s.filename &&
      s.filename !== filename
    ) {
      continue;
    }
    out[i] = { ...s, done: true };
    return out;
  }
  return out;
}

function parseEditProposals(text: string): EditProposal[] {
  const blockRe = /```(?:json)?\s*([\s\S]*?)\s*```/g;
  const proposals: EditProposal[] = [];
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = blockRe.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      if (Array.isArray(parsed?.edits)) {
        for (const e of parsed.edits) {
          if (typeof e.find === "string" && typeof e.replace === "string") {
            const sig = `${e.find}${e.replace}`;
            if (seen.has(sig)) continue;
            seen.add(sig);
            proposals.push({
              find: e.find,
              replace: e.replace,
              reason: e.reason,
            });
          }
        }
      }
    } catch {
      /* ignore non-JSON blocks */
    }
  }
  // Loose fallback: when the model runs out of `max_tokens` mid-JSON, the
  // fenced block never closes, so the strict regex above finds no match.
  // Scan the trailing text for an unclosed `"edits":[` array and extract
  // every well-formed `{find,replace,reason}` inside it. We accept partial
  // outputs because a 28-page review hitting the token cap should still
  // surface the 30+ suggestions the model managed to emit before stopping,
  // not vanish into a blank pane.
  const loose = parseLooseEditObjects(text);
  for (const e of loose) {
    const sig = `${e.find}${e.replace}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    proposals.push(e);
  }
  return proposals;
}

/**
 * Best-effort extractor for `{find, replace, reason}` JSON objects sitting
 * inside an unclosed `"edits":[ ... ]` array. Returns whatever objects parse
 * cleanly; ignores the (likely truncated) tail.
 */
function parseLooseEditObjects(text: string): EditProposal[] {
  const idx = text.lastIndexOf('"edits"');
  if (idx < 0) return [];
  const bracket = text.indexOf("[", idx);
  if (bracket < 0) return [];
  const out: EditProposal[] = [];
  let i = bracket + 1;
  while (i < text.length) {
    // Skip whitespace and commas between objects.
    while (i < text.length && /[\s,]/.test(text[i])) i++;
    if (i >= text.length || text[i] === "]") break;
    if (text[i] !== "{") {
      i++;
      continue;
    }
    // Walk the next balanced `{...}`, respecting string escapes.
    let depth = 0;
    let inString = false;
    let escape = false;
    let end = -1;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\" && inString) {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end < 0) break; // truncated mid-object
    const slice = text.slice(i, end + 1);
    try {
      const e = JSON.parse(slice);
      if (typeof e?.find === "string" && typeof e?.replace === "string") {
        out.push({ find: e.find, replace: e.replace, reason: e.reason });
      }
    } catch {
      /* skip malformed object */
    }
    i = end + 1;
  }
  return out;
}

/**
 * Parse `{"writes":[{"at": "...", "content_md": "..."}]}` JSON blocks from
 * the assistant text. Iterates over every fenced ```json code block and
 * extracts any matching `writes` array — tolerant to non-JSON blocks.
 */
function parseWriteProposals(text: string): WriteProposal[] {
  const blockRe = /```(?:json)?\s*([\s\S]*?)\s*```/g;
  const proposals: WriteProposal[] = [];
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      if (Array.isArray(parsed?.writes)) {
        for (const w of parsed.writes) {
          if (
            typeof w?.content_md === "string" &&
            (w.at === "selection" ||
              w.at === "end" ||
              w.at === "after_selection")
          ) {
            proposals.push({ at: w.at, content_md: w.content_md });
          }
        }
      }
    } catch {
      /* ignore non-JSON blocks */
    }
  }
  return proposals;
}

// ---------------------------------------------------------------------------
// Document context wrapper
// Injects the Word document text into the user message and appends
// instructions asking the AI to output structured edit proposals.
// ---------------------------------------------------------------------------

const EDIT_INSTRUCTION = `

If you are proposing specific text changes to this document, please append a JSON code block at the very end of your response in this exact format (use real text from the document for "find"):
\`\`\`json
{"edits": [{"find": "exact original text", "replace": "replacement text", "reason": "brief reason"}]}
\`\`\`
Only include the JSON block when you are proposing edits. Each "find" value must be a verbatim excerpt from the document.`;

export function buildMessageWithContext(
  userText: string,
  documentText?: string,
): string {
  if (!documentText) return userText;
  return `[Current Word document content below — use it as context for my request]\n\n${documentText}\n\n---\n\n${userText}${EDIT_INSTRUCTION}`;
}

function readInitialModel(): string {
  try {
    const v = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (v) return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_MODEL_ID;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface SendOptions {
  /** Current Word selection at compose time (Agent B — selection awareness). */
  selection?: WordSelectionState;
  /** Where assistant-authored content should land (Agent B — creation mode). */
  creationMode?: CreationMode;
}

export function useChat() {
  const { isAuthenticated } = useAuth();
  const { activeProjectId, setActiveProjectId } = useChatContext();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | undefined>();
  const [chatTitle, setChatTitle] = useState<string | null>(null);

  // Composer state lives in the hook so chat-load and "new chat" can reset it.
  const [selectedModel, setSelectedModelState] =
    useState<string>(readInitialModel);
  const [selectedWorkflow, setSelectedWorkflow] =
    useState<PickedWorkflow | null>(null);
  const [attachedDocs, setAttachedDocs] = useState<DocRef[]>([]);
  const [editMode, setEditMode] = useState<EditMode>("track");

  const setSelectedModel = useCallback((id: string) => {
    setSelectedModelState(id);
    try {
      window.localStorage.setItem(MODEL_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  const abortRef = useRef<AbortController | null>(null);
  const fullTextRef = useRef<string>("");

  // Keep activeProjectId in a ref so sendMessage can read the latest value
  // without forcing useCallback to invalidate on every snapshot tick.
  const projectRef = useRef(activeProjectId);
  useEffect(() => {
    projectRef.current = activeProjectId;
  }, [activeProjectId]);

  const sendMessage = useCallback(
    async (
      userText: string,
      documentContext?: string,
      options?: SendOptions,
    ) => {
      if (!isAuthenticated || isLoading) return;

      const displayContent = userText;
      const apiContent = buildMessageWithContext(userText, documentContext);

      const userMsg: ChatMessage = {
        role: "user",
        content: displayContent,
      };
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: "",
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsLoading(true);
      fullTextRef.current = "";

      const userApiMessage: ApiChatMessage = {
        role: "user",
        content: apiContent,
        files: attachedDocs
          .filter((d) => !!d.document_id)
          .map((d) => ({
            document_id: d.document_id,
            filename: d.filename,
          })),
        workflow: selectedWorkflow
          ? { id: selectedWorkflow.id, title: selectedWorkflow.title }
          : undefined,
      };

      const history: ApiChatMessage[] = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        userApiMessage,
      ];

      const controller = new AbortController();
      abortRef.current = controller;

      const selectionPayload =
        options?.selection && !options.selection.isEmpty
          ? {
              text: options.selection.text,
              has_selection: true,
            }
          : undefined;

      const payload: StreamChatPayload = {
        messages: history,
        chat_id: activeChatId,
        model: selectedModel,
        workflow: selectedWorkflow
          ? { id: selectedWorkflow.id, title: selectedWorkflow.title }
          : undefined,
        files: userApiMessage.files,
        editMode,
        selection: selectionPayload,
        creation_mode: options?.creationMode ?? "project",
        signal: controller.signal,
      };

      try {
        const projectId = projectRef.current;
        const response = projectId
          ? await streamProjectChat({ ...payload, projectId })
          : await streamChat(payload);

        if (!response.ok) {
          // A 404 on a project-scoped chat almost always means the active
          // project ID we have cached in localStorage no longer maps to a
          // real project (deleted, different login, fresh DB). Clear the
          // stale context so the next send falls back to a global chat.
          if (response.status === 404 && projectRef.current) {
            const detail = await response
              .text()
              .catch(() => "");
            setActiveProjectId(null);
            projectRef.current = null;
            throw new Error(
              `Project chat context cleared — the saved project no longer exists. Try again now${
                detail ? ` (server: ${detail.slice(0, 120)})` : ""
              }.`,
            );
          }
          const detail = await response.text().catch(() => "");
          throw new Error(detail || `HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const raw = trimmed.slice(5).trim();
            if (raw === "[DONE]") continue;

            try {
              const evt = JSON.parse(raw) as Record<string, unknown>;

              if (evt.type === "chat_id") {
                setActiveChatId(evt.chatId as string);
              } else if (evt.type === "reasoning_delta") {
                // Extended thinking trace streaming in alongside (or before)
                // the visible answer. Accumulate on the last assistant
                // message and append into the current thinking step (or
                // start a new one).
                const delta = typeof evt.text === "string" ? evt.text : "";
                if (!delta) continue;
                setMessages((prev) =>
                  updateLast(prev, (last) => {
                    const steps = [...(last.steps ?? [])];
                    const tail = steps[steps.length - 1];
                    if (tail?.kind === "thinking" && !tail.done) {
                      steps[steps.length - 1] = {
                        ...tail,
                        text: tail.text + delta,
                      };
                    } else {
                      steps.push({ kind: "thinking", text: delta, done: false });
                    }
                    return {
                      ...last,
                      thinking: (last.thinking ?? "") + delta,
                      isThinking: true,
                      steps,
                    };
                  }),
                );
              } else if (evt.type === "reasoning_block_end") {
                // The model finished a reasoning block — mark the current
                // thinking step done so the timeline shows it as a completed
                // bullet rather than the active one.
                setMessages((prev) =>
                  updateLast(prev, (last) => ({
                    ...last,
                    isThinking: false,
                    steps: closeLastStep(last.steps, "thinking"),
                  })),
                );
              } else if (
                evt.type === "doc_read_start" ||
                evt.type === "doc_read" ||
                evt.type === "doc_find_start" ||
                evt.type === "doc_find" ||
                evt.type === "doc_edited_start" ||
                evt.type === "doc_edited" ||
                evt.type === "doc_created_start" ||
                evt.type === "doc_created" ||
                evt.type === "doc_replicate_start" ||
                evt.type === "doc_replicated"
              ) {
                const filename =
                  typeof evt.filename === "string" ? evt.filename : "";
                const isStart = String(evt.type).endsWith("_start");
                const baseKind = String(evt.type).replace(/_start$/, "");
                setMessages((prev) =>
                  updateLast(prev, (last) => {
                    const steps = [...(last.steps ?? [])];
                    if (isStart) {
                      // Close any in-flight thinking before pushing a tool step.
                      const closed = closeLastStep(steps, "thinking");
                      const next: TraceStep =
                        baseKind === "doc_find"
                          ? { kind: "doc_find", done: false }
                          : ({
                              kind: baseKind as
                                | "doc_read"
                                | "doc_edited"
                                | "doc_created"
                                | "doc_replicated"
                                | "doc_replicate",
                              filename,
                              done: false,
                            } as TraceStep);
                      return {
                        ...last,
                        isThinking: false,
                        steps: [...closed, next],
                      };
                    }
                    // Tool-end event: mark the matching open step as done.
                    const targetKind = (
                      baseKind === "doc_replicate" ? "doc_replicated" : baseKind
                    ) as TraceStep["kind"];
                    // doc_created brings a download_url + document_id back
                    // — capture so we can render an "Open in Word" card.
                    let createdDocs = last.createdDocs;
                    if (baseKind === "doc_created") {
                      const downloadUrl =
                        typeof evt.download_url === "string"
                          ? evt.download_url
                          : "";
                      if (downloadUrl) {
                        const ref: CreatedDocRef = {
                          documentId:
                            typeof evt.document_id === "string"
                              ? evt.document_id
                              : undefined,
                          filename: filename || "Document.docx",
                          downloadUrl,
                        };
                        createdDocs = [...(createdDocs ?? []), ref];
                      }
                    }
                    return {
                      ...last,
                      steps: closeLastStep(steps, targetKind, filename),
                      createdDocs,
                    };
                  }),
                );
              } else if (evt.type === "content_delta") {
                fullTextRef.current += evt.text as string;
                const snapshot = fullTextRef.current;
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      content: snapshot,
                      isStreaming: true,
                      isThinking: false,
                    };
                  }
                  return updated;
                });
              } else if (evt.type === "content_done") {
                const finalText = fullTextRef.current;
                const editProposals = parseEditProposals(finalText);
                const writeProposals = parseWriteProposals(finalText);
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      content: finalText,
                      isStreaming: false,
                      isThinking: false,
                      steps: (last.steps ?? []).map((s) => ({
                        ...s,
                        done: true,
                      })),
                      editProposals,
                      writeProposals,
                    };
                  }
                  return updated;
                });
              } else if (evt.type === "error") {
                const message =
                  typeof evt.message === "string" ? evt.message : "The model request failed.";
                setMessages((prev) =>
                  updateLast(prev, (last) => ({
                    ...last,
                    isStreaming: false,
                    isThinking: false,
                    error: message,
                  })),
                );
              }
            } catch {
              /* ignore parse errors */
            }
          }
        }

        const finalText = fullTextRef.current;
        const editProposals = parseEditProposals(finalText);
        const writeProposals = parseWriteProposals(finalText);
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant" && last.isStreaming) {
            updated[updated.length - 1] = {
              ...last,
              content: finalText || last.content,
              isStreaming: false,
              isThinking: false,
              steps: (last.steps ?? []).map((s) => ({ ...s, done: true })),
              editProposals: editProposals.length
                ? editProposals
                : last.editProposals,
              writeProposals: writeProposals.length
                ? writeProposals
                : last.writeProposals,
            };
          }
          return updated;
        });
      } catch (err) {
        const isAbort = (err as Error).name === "AbortError";
        if (!isAbort) {
          const raw = (err as Error).message ?? "";
          // Surface the real fetch/HTTP/parse error to the user rather
          // than collapsing every failure into a generic "Failed to get a
          // response."
          // eslint-disable-next-line no-console
          console.error("[useChat] send failed", err);
          const errorText = raw
            ? `Send failed — ${raw}`
            : "Send failed. Check the backend service log for details.";
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === "assistant") {
              updated[updated.length - 1] = {
                ...last,
                content: last.content || "",
                isStreaming: false,
                error: errorText,
              };
            }
            return updated;
          });
        }
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      isAuthenticated,
      isLoading,
      activeChatId,
      messages,
      selectedModel,
      selectedWorkflow,
      attachedDocs,
      editMode,
    ],
  );

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last?.role === "assistant" && last.isStreaming) {
        updated[updated.length - 1] = { ...last, isStreaming: false };
      }
      return updated;
    });
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setActiveChatId(undefined);
    setChatTitle(null);
    setSelectedWorkflow(null);
    setAttachedDocs([]);
    fullTextRef.current = "";
  }, []);

  const newChat = clearChat;

  const loadChat = useCallback(async (chatId: string) => {
    try {
      setIsLoading(true);
      const detail = await getChat(chatId);
      // Defensive shaping — old chats stored before the role union was
      // narrowed can include "tool"/"system" rows we don't render; skip
      // them so they don't poison the messages array. Also coerce
      // missing/null content to "" so downstream renderers don't blow up.
      const loaded: ChatMessage[] = (detail.messages ?? [])
        .filter((m) => m && (m.role === "user" || m.role === "assistant"))
        .map((m) => {
          const content = typeof m.content === "string" ? m.content : "";
          const proposals = content
            ? parseEditProposals(content)
            : [];
          const writes = content
            ? parseWriteProposals(content)
            : [];
          return {
            role: m.role as "user" | "assistant",
            content,
            editProposals: proposals.length ? proposals : undefined,
            writeProposals: writes.length ? writes : undefined,
            error: m.error,
          };
        });
      setMessages(loaded);
      setActiveChatId(detail.chat.id);
      setChatTitle(detail.chat.title);
      setSelectedWorkflow(null);
      setAttachedDocs([]);
      fullTextRef.current = "";
    } catch (err) {
      // Surface the failure as an error bubble so the user sees what
      // went wrong instead of an empty pane. Previously this swallowed
      // any error and left the chat in whatever state it was in, which
      // — when an `m.role === "tool"` row slipped through the
      // ChatMessage union and threw mid-render — manifested as a fully
      // blank task pane.
      // eslint-disable-next-line no-console
      console.error("[loadChat] failed", err);
      const text = (err as Error)?.message || "Could not load this chat.";
      setMessages([
        {
          role: "assistant",
          content: "",
          error: `Couldn't open chat: ${text}`,
        },
      ]);
      setActiveChatId(undefined);
      setChatTitle(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    // Core chat state
    messages,
    isLoading,
    chatId: activeChatId,
    activeChatId,
    chatTitle,
    sendMessage,
    cancelStream,
    clearChat,
    newChat,
    loadChat,

    // Composer state
    selectedModel,
    setSelectedModel,
    selectedWorkflow,
    setSelectedWorkflow,
    attachedDocs,
    setAttachedDocs,
    editMode,
    setEditMode,
  };
}

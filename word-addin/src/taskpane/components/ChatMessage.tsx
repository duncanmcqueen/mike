import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import type {
  ChatMessage,
  CreatedDocRef,
  EditProposal,
  TraceStep,
  WriteProposal,
} from "../hooks/useChat";
import {
  applyEditsAsComments,
  applyTrackedChangeWithComment,
  type EditMode,
} from "../lib/wordComments";
import { applyWriteToWord } from "../lib/wordWrite";
import { createOfficeDownloadUrl } from "../lib/api";

interface Props {
  message: ChatMessage;
}

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------

function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={
        "inline-block h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin " +
        className
      }
    />
  );
}

// ---------------------------------------------------------------------------
// TraceTimeline — vertical timeline of the assistant's steps
// (interleaved reasoning blocks + tool calls). Mirrors the desktop's
// "Completed in N steps" panel: each step is a row with a status bullet
// and a label; thinking steps expand inline to show the full trace.
// ---------------------------------------------------------------------------

function describeStep(step: TraceStep): string {
  switch (step.kind) {
    case "thinking":
      return "Thought process";
    case "doc_read":
      return step.filename ? `Read ${step.filename}` : "Read document";
    case "doc_find":
      return "Searched in document";
    case "doc_edited":
      return step.filename ? `Edited ${step.filename}` : "Edited document";
    case "doc_created":
      return step.filename
        ? `Created ${step.filename}`
        : "Created document";
    case "doc_replicated":
      return step.filename
        ? `Built from ${step.filename}`
        : "Built from template";
  }
}

function StepBullet({ done, active }: { done: boolean; active: boolean }) {
  if (active) {
    return (
      <span
        className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 ring-4 ring-green-100"
        aria-label="In progress"
      />
    );
  }
  if (done) {
    return (
      <span
        className="inline-block w-2.5 h-2.5 rounded-full bg-gray-400"
        aria-label="Done"
      />
    );
  }
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full border-2 border-gray-300 bg-white"
      aria-label="Pending"
    />
  );
}

function ThinkingStepRow({
  step,
  active,
}: {
  step: Extract<TraceStep, { kind: "thinking" }>;
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trimmed = step.text.trim();
  return (
    <li className="relative pl-6 pb-2 last:pb-0">
      <span className="absolute left-1 top-1.5">
        <StepBullet done={step.done} active={active} />
      </span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!trimmed}
        className="text-[11px] text-gray-700 hover:text-gray-900 disabled:cursor-default flex items-center gap-1"
      >
        <span className={active ? "font-medium" : ""}>
          {describeStep(step)}
        </span>
        {trimmed && (
          <span className="text-gray-400 text-[9px]">
            {open ? "▾" : "›"}
          </span>
        )}
      </button>
      {open && trimmed && (
        <div className="mt-1 mr-1 px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-[11px] text-gray-600 leading-relaxed whitespace-pre-wrap font-mono max-h-48 overflow-auto">
          {trimmed}
        </div>
      )}
    </li>
  );
}

function ToolStepRow({
  step,
  active,
}: {
  step: Exclude<TraceStep, { kind: "thinking" }>;
  active: boolean;
}) {
  return (
    <li className="relative pl-6 pb-2 last:pb-0">
      <span className="absolute left-1 top-1.5">
        <StepBullet done={step.done} active={active} />
      </span>
      <span
        className={
          "text-[11px] " +
          (active ? "text-gray-900 font-medium" : "text-gray-700")
        }
      >
        {describeStep(step)}
      </span>
    </li>
  );
}

function TraceTimeline({
  steps,
  isStreaming,
}: {
  steps: TraceStep[];
  isStreaming: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (!steps.length) return null;

  // Active step = first not-done while still streaming. After the stream
  // ends, no step is "active" — they're all rendered as completed bullets.
  const activeIndex = isStreaming ? steps.findIndex((s) => !s.done) : -1;
  const allDone = steps.every((s) => s.done);
  const headerLabel = isStreaming
    ? activeIndex >= 0
      ? `Working — step ${activeIndex + 1} of ${steps.length}`
      : `Working in ${steps.length} steps`
    : `Completed in ${steps.length} step${steps.length === 1 ? "" : "s"}`;

  return (
    <div className="mb-2 rounded-2xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-gray-700 hover:text-gray-900"
      >
        {!allDone ? (
          <span className="inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg
            viewBox="0 0 16 16"
            className="w-3 h-3 text-green-600"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 8 7 12 13 4" />
          </svg>
        )}
        <span className="font-medium">{headerLabel}</span>
        <span className="ml-auto text-gray-400 text-[10px]">
          {collapsed ? "›" : "▾"}
        </span>
      </button>
      {!collapsed && (
        <ol className="relative px-3 py-2 border-t border-gray-100">
          {/* vertical guideline */}
          <span
            aria-hidden="true"
            className="absolute left-[14px] top-3 bottom-3 w-px bg-gray-200"
          />
          {steps.map((s, i) => {
            const active = i === activeIndex;
            if (s.kind === "thinking")
              return <ThinkingStepRow key={i} step={s} active={active} />;
            return <ToolStepRow key={i} step={s} active={active} />;
          })}
        </ol>
      )}
    </div>
  );
}

function describeWriteLocation(at: WriteProposal["at"]): string {
  switch (at) {
    case "selection":
      return "at your current selection";
    case "after_selection":
      return "right after the selection";
    case "end":
      return "at the end of the document";
    default:
      return "into the document";
  }
}

function isWordAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as { Office?: unknown }).Office !== "undefined"
  );
}

// ---------------------------------------------------------------------------
// EditProposalCard — per-edit two-button row
// ---------------------------------------------------------------------------

type EditBusy = "track" | "comment" | null;

function EditRow({
  proposal,
  preferred,
  appliedAs,
  onApplied,
}: {
  proposal: EditProposal;
  preferred: EditMode;
  appliedAs: "track" | "comment" | null;
  onApplied: (mode: "track" | "comment") => void;
}) {
  const [busy, setBusy] = useState<EditBusy>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-fade transient errors after 3s. The success state ("appliedAs") is
  // sticky on purpose — the user wants the card to stay green so they can
  // see at a glance which suggestions they've already applied.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(t);
  }, [error]);

  const wordOk = isWordAvailable();
  const trackPrimary = preferred !== "comments";

  const onTrack = async () => {
    if (busy || appliedAs) return;
    setBusy("track");
    setError(null);
    try {
      const { applied, notFound } = await applyTrackedChangeWithComment(
        proposal,
      );
      if (applied > 0) onApplied("track");
      else if (notFound > 0) setError("Couldn't find text");
    } catch (e) {
      setError((e as Error).message || "Error");
    } finally {
      setBusy(null);
    }
  };

  const onComment = async () => {
    if (busy || appliedAs) return;
    setBusy("comment");
    setError(null);
    try {
      const { applied, notFound } = await applyEditsAsComments([proposal]);
      if (applied > 0) onApplied("comment");
      else if (notFound.length > 0) setError("Couldn't find text");
    } catch (e) {
      setError((e as Error).message || "Error");
    } finally {
      setBusy(null);
    }
  };

  const trackBtnClass = trackPrimary
    ? "bg-gray-900 text-white border border-gray-900 hover:bg-gray-800"
    : "bg-white border border-gray-300 text-gray-800 hover:bg-gray-50";
  const commentBtnClass = !trackPrimary
    ? "bg-gray-900 text-white border border-gray-900 hover:bg-gray-800"
    : "bg-white border border-gray-300 text-gray-800 hover:bg-gray-50";

  const disabled = busy !== null || !wordOk || appliedAs !== null;
  const cardClass = appliedAs
    ? "rounded-xl border border-green-300 bg-green-50 p-3"
    : "rounded-xl border border-gray-200 bg-white p-3";

  return (
    <li className={cardClass}>
      <div className="text-xs text-gray-700 leading-relaxed">
        <span className="line-through text-red-500">
          {proposal.find.length > 80
            ? proposal.find.slice(0, 80) + "…"
            : proposal.find}
        </span>
        <span className="text-gray-400"> → </span>
        <span className="text-green-700">
          {proposal.replace.length > 80
            ? proposal.replace.slice(0, 80) + "…"
            : proposal.replace}
        </span>
      </div>
      {proposal.reason && (
        <p className="mt-1 text-[11px] italic text-gray-500">
          {proposal.reason}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        {appliedAs ? (
          <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white">
            <svg
              viewBox="0 0 16 16"
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 8 7 12 13 4" />
            </svg>
            {appliedAs === "track" ? "Applied as track change" : "Comment added"}
          </span>
        ) : (
          <>
            <button
              type="button"
              onClick={onTrack}
              disabled={disabled}
              className={
                "inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 " +
                trackBtnClass
              }
            >
              {busy === "track" && <Spinner />}
              Apply as track change
            </button>
            <button
              type="button"
              onClick={onComment}
              disabled={disabled}
              className={
                "inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 " +
                commentBtnClass
              }
            >
              {busy === "comment" && <Spinner />}
              Add as comment
            </button>
          </>
        )}
      </div>
      {!wordOk && (
        <p className="mt-1.5 text-[11px] text-gray-500">
          Word isn't available — open this add-in inside Word to apply edits.
        </p>
      )}
      {error && (
        <p className="mt-1.5 text-[11px] text-red-600">{error}</p>
      )}
    </li>
  );
}

function EditProposalCard({
  proposals,
  preferred,
}: {
  proposals: EditProposal[];
  preferred: EditMode;
}) {
  // Per-edit applied state — sticky after success. Lifted to the parent so
  // the bulk-apply buttons can skip-and-update each row's status.
  const [appliedStates, setAppliedStates] = useState<
    ("track" | "comment" | null)[]
  >(() => proposals.map(() => null));
  const [bulkBusy, setBulkBusy] = useState<"track" | "comment" | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{
    done: number;
    total: number;
    failed: number;
  } | null>(null);

  // If the proposals array changes (rare — usually only on new messages),
  // reset the per-row state. Guarded by length+content fingerprint.
  useEffect(() => {
    setAppliedStates((prev) =>
      prev.length === proposals.length ? prev : proposals.map(() => null),
    );
  }, [proposals]);

  const wordOk = isWordAvailable();
  const remaining = appliedStates.filter((s) => s === null).length;

  const setApplied = (i: number, mode: "track" | "comment") => {
    setAppliedStates((prev) => {
      const next = [...prev];
      next[i] = mode;
      return next;
    });
  };

  const runBulk = async (mode: "track" | "comment") => {
    if (bulkBusy || remaining === 0) return;
    setBulkBusy(mode);
    let done = 0;
    let failed = 0;
    const total = remaining;
    setBulkProgress({ done, total, failed });

    for (let i = 0; i < proposals.length; i++) {
      if (appliedStates[i]) continue; // already applied
      const proposal = proposals[i];
      try {
        if (mode === "track") {
          const { applied, notFound } = await applyTrackedChangeWithComment(
            proposal,
          );
          if (applied > 0) setApplied(i, "track");
          else if (notFound > 0) failed += 1;
        } else {
          const { applied, notFound } = await applyEditsAsComments([proposal]);
          if (applied > 0) setApplied(i, "comment");
          else if (notFound.length > 0) failed += 1;
        }
      } catch {
        failed += 1;
      }
      done += 1;
      setBulkProgress({ done, total, failed });
    }

    setBulkBusy(null);
    // Hide the progress chip after a beat so the row green states remain
    // as the at-a-glance record.
    setTimeout(() => setBulkProgress(null), 2500);
  };

  const trackPrimary = preferred !== "comments";
  const allDisabled = bulkBusy !== null || !wordOk;

  return (
    <div className="mt-2 rounded-2xl border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between mb-2 gap-2">
        <p className="text-xs font-serif font-semibold text-gray-800 truncate">
          {proposals.length} suggestion
          {proposals.length > 1 ? "s" : ""}
          {remaining > 0 && remaining !== proposals.length && (
            <span className="ml-1.5 text-[10px] font-normal text-gray-500">
              · {remaining} pending
            </span>
          )}
        </p>
        {remaining === 0 && (
          <span className="text-[10px] text-green-700 font-medium">
            All applied
          </span>
        )}
      </div>

      {remaining > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => runBulk("track")}
            disabled={allDisabled}
            className={
              "inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 " +
              (trackPrimary
                ? "bg-gray-900 text-white hover:bg-gray-800"
                : "bg-white border border-gray-300 text-gray-800 hover:bg-gray-50")
            }
          >
            {bulkBusy === "track" && <Spinner />}
            Apply all as track changes
          </button>
          <button
            type="button"
            onClick={() => runBulk("comment")}
            disabled={allDisabled}
            className={
              "inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 " +
              (!trackPrimary
                ? "bg-gray-900 text-white hover:bg-gray-800"
                : "bg-white border border-gray-300 text-gray-800 hover:bg-gray-50")
            }
          >
            {bulkBusy === "comment" && <Spinner />}
            Apply all as comments
          </button>
          {bulkProgress && (
            <span className="text-[10px] text-gray-500">
              {bulkProgress.done}/{bulkProgress.total}
              {bulkProgress.failed > 0 &&
                ` · ${bulkProgress.failed} failed`}
            </span>
          )}
        </div>
      )}

      <ul className="space-y-2">
        {proposals.map((p, i) => (
          <EditRow
            key={i}
            proposal={p}
            preferred={preferred}
            appliedAs={appliedStates[i] ?? null}
            onApplied={(mode) => setApplied(i, mode)}
          />
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WriteProposalCard — render a write-into-document proposal
// ---------------------------------------------------------------------------

function WriteProposalCard({ proposal }: { proposal: WriteProposal }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 3000);
    return () => clearTimeout(t);
  }, [status]);

  const wordOk = isWordAvailable();

  const lines = proposal.content_md.split("\n");
  const isLong = lines.length > 10;
  const previewText =
    expanded || !isLong ? proposal.content_md : lines.slice(0, 10).join("\n");

  const onInsert = async () => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      await applyWriteToWord(proposal);
      setStatus({ kind: "ok", text: "Inserted" });
    } catch (e) {
      setStatus({ kind: "err", text: (e as Error).message || "Error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 rounded-2xl border border-gray-200 bg-white p-3">
      <p className="text-xs font-serif font-semibold text-gray-800">
        Write into this document
      </p>
      <p className="mt-0.5 text-[11px] text-gray-500">
        {describeWriteLocation(proposal.at)}
      </p>
      <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-[11px] font-mono text-gray-700 whitespace-pre-wrap">
        {previewText}
        {isLong && !expanded && "\n…"}
      </pre>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-[11px] text-gray-600 underline hover:text-gray-800"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={onInsert}
          disabled={busy || !wordOk}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white border border-gray-900 hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {busy && <Spinner />}
          Insert into Word
        </button>
      </div>
      {!wordOk && (
        <p className="mt-1.5 text-[11px] text-gray-500">
          Word isn't available — open this add-in inside Word to insert
          content.
        </p>
      )}
      {status && (
        <p
          className={
            "mt-1.5 text-[11px] transition-opacity " +
            (status.kind === "ok" ? "text-green-700" : "text-red-600")
          }
        >
          {status.text}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CreatedDocCard — "Open in Word" affordance for docs the assistant
// created during the turn via generate_docx. Uses the `ms-word:` URI
// scheme so macOS/Windows route directly to Word (no browser tab).
// ---------------------------------------------------------------------------

function CreatedDocCard({ doc }: { doc: CreatedDocRef }) {
  const [status, setStatus] = useState<"idle" | "opening" | "err">("idle");
  const onOpen = async () => {
    try {
      setStatus("opening");
      const safeUrl = await createOfficeDownloadUrl(doc.downloadUrl);
      // ms-word:ofe|u|<url>  →  Open For Editing in Word.
      // Word for Mac and Windows both honor this scheme.
      const wordUri = `ms-word:ofe|u|${safeUrl}`;
      window.open(wordUri, "_self");
      setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setStatus("err");
    }
  };
  return (
    <div className="mt-2 flex items-center gap-2 rounded-2xl border border-gray-200 bg-white p-2.5">
      <svg
        viewBox="0 0 24 24"
        className="w-5 h-5 text-gray-500 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-gray-900 truncate">
          {doc.filename}
        </div>
        <div className="text-[10px] text-gray-500">Saved to project</div>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-gray-900 text-white hover:bg-gray-800"
        title="Open this document in Microsoft Word"
      >
        {status === "opening" ? "Opening…" : status === "err" ? "Try again" : "Open in Word"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

export default function ChatMessageBubble({ message }: Props) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end mb-3">
        <div className="relative max-w-[85%] bg-mike-500 text-white rounded-2xl rounded-tr-sm px-3 py-2 text-sm">
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant message
  //
  // We strip any fenced ```json``` block from the visible content so the
  // non-technical reader never sees raw `{"edits":[…]}` payloads — the
  // edit/write cards below carry that information in a usable form.
  // During streaming the closing ``` may not have arrived yet, so we also
  // truncate at the first opening ```json fence to hide the in-flight
  // payload. While it's being generated we surface a small placeholder so
  // the user knows the model is still working.
  let cleanedContent = (message.content ?? "")
    .replace(/```(?:json)?\s*\{[\s\S]*?"edits"[\s\S]*?```/g, "")
    .replace(/```(?:json)?\s*\{[\s\S]*?"writes"[\s\S]*?```/g, "");

  let preparingKind: "edits" | "writes" | null = null;
  // Truncated = the model ran out of tokens (or otherwise stopped) mid-JSON.
  // We detect by finding an unclosed ```json fence after streaming ends.
  let truncated = false;
  const openFence = cleanedContent.match(/```(?:json)?\s*(\{[\s\S]*)$/);
  if (openFence) {
    const candidate = openFence[1];
    if (/"writes"/.test(candidate)) preparingKind = "writes";
    else if (/"edits"/.test(candidate)) preparingKind = "edits";
    else if (message.isStreaming) preparingKind = "edits";
    if (preparingKind) {
      cleanedContent = cleanedContent.slice(0, openFence.index ?? 0);
      if (!message.isStreaming) truncated = true;
    }
  }
  cleanedContent = cleanedContent.trim();

  return (
    <div className="mb-3">
      <div className="max-w-[95%]">
        {message.steps && message.steps.length > 0 ? (
          <TraceTimeline
            steps={message.steps}
            isStreaming={!!message.isStreaming}
          />
        ) : message.thinking ? (
          // Back-compat: messages loaded from history before steps existed
          // still have a flat `thinking` blob — render as a single-row
          // thinking step so the user sees the trace.
          <TraceTimeline
            steps={[
              {
                kind: "thinking",
                text: message.thinking,
                done: !message.isStreaming,
              },
            ]}
            isStreaming={!!message.isStreaming}
          />
        ) : null}
        {message.error ? (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {message.error}
          </p>
        ) : cleanedContent ? (
          <div className="prose-sm text-sm text-gray-800 leading-relaxed">
            <ReactMarkdown>{cleanedContent}</ReactMarkdown>
          </div>
        ) : message.isStreaming && !preparingKind ? (
          <span className="inline-block w-4 h-4 border-2 border-mike-400 border-t-transparent rounded-full animate-spin" />
        ) : null}

        {/* In-flight JSON block placeholder — while the assistant is mid-emit
            of an edits/writes block, hide the raw JSON and show a friendly
            chip instead. The card with actionable buttons renders below as
            soon as streaming finishes. */}
        {message.isStreaming && preparingKind && (
          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-[11px] text-gray-700">
            <span className="inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            {preparingKind === "writes"
              ? "Preparing content to insert into Word…"
              : "Preparing proposed edits…"}
          </div>
        )}

        {/* Truncated output warning — the model ran out of tokens (or stopped
            for some other reason) mid-JSON. The cards below still render
            whatever complete `{find, replace, reason}` objects the loose
            parser could extract, so the user sees partial coverage instead
            of a blank pane. */}
        {!message.isStreaming && truncated && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">
            <span className="font-medium">Response was cut off.</span>{" "}
            The model hit its output-token limit mid-
            {preparingKind === "writes" ? "draft" : "edit-list"}. Suggestions
            below are partial — re-run on a smaller section of the document
            to see the rest.
          </div>
        )}

        {/* Edit proposals — per-edit two-button row. The user's earlier
            global mode pick (if any) is used only to choose which button
            gets primary styling; both are always clickable. */}
        {!message.isStreaming &&
          message.editProposals &&
          message.editProposals.length > 0 && (
            <EditProposalCard
              proposals={message.editProposals}
              preferred={
                ((message as ChatMessage & { editMode?: EditMode })
                  .editMode as EditMode | undefined) ?? "track"
              }
            />
          )}

        {/* Write-into-document proposals (Agent C protocol). */}
        {!message.isStreaming &&
          message.writeProposals &&
          message.writeProposals.length > 0 && (
            <div className="flex flex-col gap-2">
              {message.writeProposals.map((w, i) => (
                <WriteProposalCard key={i} proposal={w} />
              ))}
            </div>
          )}

        {/* Docs the assistant produced this turn — one card per file with
            an Open-in-Word button that uses the ms-word: URI scheme. */}
        {message.createdDocs && message.createdDocs.length > 0 && (
          <div className="flex flex-col gap-2">
            {message.createdDocs.map((d, i) => (
              <CreatedDocCard key={i} doc={d} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

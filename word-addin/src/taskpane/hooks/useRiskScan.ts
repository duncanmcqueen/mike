import { useCallback, useEffect, useState } from "react";
import { streamChat, streamProjectChat } from "../lib/api";
import { getDocumentText } from "./useWordDoc";
import { useChatContext } from "../contexts/ChatContextStore";

export type RedFlag = {
  severity: "high" | "medium" | "low";
  title: string;
  summary: string;
  location?: string;
};

export type DefinedTermIssue = {
  term: string;
  issue:
    | "missing_definition"
    | "inconsistent_case"
    | "undefined_capitalized";
  detail: string;
  location?: string;
};

export type RiskScanResult = {
  redFlags: RedFlag[] | null;
  definedTermIssues: DefinedTermIssue[] | null;
};

const SESSION_KEY = "mike.lastRiskScan";

const RED_FLAG_PROMPT = `Review the document for material legal and commercial risks. Return a concise explanation followed by exactly one fenced JSON block with this shape:
{"red_flags":[{"severity":"high|medium|low","title":"...","summary":"...","location":"..."}]}
Do not put any other JSON in the response.`;

const DEFINED_TERMS_PROMPT = `Review the document for missing definitions, inconsistent capitalization, and capitalized terms used without definition. Return a concise explanation followed by exactly one fenced JSON block with this shape:
{"defined_terms_issues":[{"term":"...","issue":"missing_definition|inconsistent_case|undefined_capitalized","detail":"...","location":"..."}]}
Do not put any other JSON in the response.`;

function readCache(): RiskScanResult {
  try {
    if (typeof window === "undefined") return { redFlags: null, definedTermIssues: null };
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return { redFlags: null, definedTermIssues: null };
    return JSON.parse(raw) as RiskScanResult;
  } catch {
    return { redFlags: null, definedTermIssues: null };
  }
}

function writeCache(next: RiskScanResult) {
  try {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function tryParseTrailingJSON(text: string): unknown {
  // Find the last fenced ```json ... ``` block.
  const re = /```json\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let last: string | null = null;
  while ((match = re.exec(text)) !== null) last = match[1];
  if (!last) return null;
  try {
    return JSON.parse(last);
  } catch {
    return null;
  }
}

async function streamAndCollect(
  body: string,
  workflow: { id: string; title: string },
  activeProjectId: string | null,
): Promise<string> {
  const messages = [
    {
      role: "user" as const,
      content: `[Workflow: ${workflow.title} (id: ${workflow.id})]\n\n${body}`,
      workflow,
    },
  ];

  const res = await (activeProjectId
    ? streamProjectChat({
        projectId: activeProjectId,
        messages,
        workflow,
      })
    : streamChat({
        messages,
        workflow,
      }));

  if (!res.ok) {
    throw new Error(`scan request failed: ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("no response stream");
  const decoder = new TextDecoder();
  let buffer = "";
  let assistantText = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const event = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLine = event
        .split("\n")
        .find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      const payload = dataLine.slice("data:".length).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload) as Record<string, unknown>;
        const delta =
          typeof json.text_chunk === "string"
            ? json.text_chunk
            : typeof json.text === "string"
              ? json.text
              : typeof json.delta === "string"
                ? json.delta
                : typeof json.content === "string"
                  ? json.content
                  : "";
        if (delta) assistantText += delta;
      } catch {
        /* ignore non-JSON keepalives */
      }
    }
  }
  return assistantText;
}

export function useRiskScan() {
  const [redFlags, setRedFlags] = useState<RedFlag[] | null>(null);
  const [definedTermIssues, setDefinedTermIssues] = useState<
    DefinedTermIssue[] | null
  >(null);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const { activeProjectId } = useChatContext();

  // Hydrate from sessionStorage on mount so the card survives tab switches.
  useEffect(() => {
    const cached = readCache();
    if (cached.redFlags) setRedFlags(cached.redFlags);
    if (cached.definedTermIssues)
      setDefinedTermIssues(cached.definedTermIssues);
    if (cached.redFlags || cached.definedTermIssues) setStatus("done");
  }, []);

  const persist = (
    next: Partial<RiskScanResult>,
  ): void => {
    const merged: RiskScanResult = {
      redFlags: next.redFlags !== undefined ? next.redFlags : redFlags,
      definedTermIssues:
        next.definedTermIssues !== undefined
          ? next.definedTermIssues
          : definedTermIssues,
    };
    writeCache(merged);
  };

  const runRedFlagScan = useCallback(async () => {
    setStatus("running");
    setError(null);
    try {
      const docText = await getDocumentText();
      if (!docText.trim()) {
        throw new Error("Open a Word document with content before running a scan.");
      }
      const reply = await streamAndCollect(
        `${RED_FLAG_PROMPT}\n\nDocument body:\n\n${docText}`,
        { id: "word-red-flag-scan", title: "Red-Flag Scan" },
        activeProjectId,
      );
      const parsed = tryParseTrailingJSON(reply) as
        | { red_flags?: RedFlag[] }
        | null;
      const flags = Array.isArray(parsed?.red_flags) ? parsed!.red_flags : [];
      setRedFlags(flags);
      persist({ redFlags: flags });
      setStatus("done");
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  }, [activeProjectId, redFlags, definedTermIssues]);

  const runDefinedTermsCheck = useCallback(async () => {
    setStatus("running");
    setError(null);
    try {
      const docText = await getDocumentText();
      if (!docText.trim()) {
        throw new Error("Open a Word document with content before running a check.");
      }
      const reply = await streamAndCollect(
        `${DEFINED_TERMS_PROMPT}\n\nDocument body:\n\n${docText}`,
        {
          id: "word-defined-terms",
          title: "Check Defined Terms",
        },
        activeProjectId,
      );
      const parsed = tryParseTrailingJSON(reply) as
        | { defined_terms_issues?: DefinedTermIssue[] }
        | null;
      const issues = Array.isArray(parsed?.defined_terms_issues)
        ? parsed!.defined_terms_issues
        : [];
      setDefinedTermIssues(issues);
      persist({ definedTermIssues: issues });
      setStatus("done");
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  }, [activeProjectId, redFlags, definedTermIssues]);

  const clear = useCallback(() => {
    setRedFlags(null);
    setDefinedTermIssues(null);
    setStatus("idle");
    setError(null);
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return {
    redFlags,
    definedTermIssues,
    status,
    error,
    runRedFlagScan,
    runDefinedTermsCheck,
    clear,
  };
}

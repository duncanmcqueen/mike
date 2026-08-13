import React from "react";
import type {
  DefinedTermIssue,
  RedFlag,
} from "../hooks/useRiskScan";

interface Props {
  redFlags: RedFlag[] | null;
  definedTermIssues: DefinedTermIssue[] | null;
  status: "idle" | "running" | "done" | "error";
  error: string | null;
  onRunRedFlag: () => void;
  onRunDefinedTerms: () => void;
  onDismiss: () => void;
}

const SEV_COLOR: Record<RedFlag["severity"], string> = {
  high: "bg-red-500",
  medium: "bg-amber-400",
  low: "bg-gray-400",
};

const SEV_LABEL: Record<RedFlag["severity"], string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const ISSUE_LABEL: Record<DefinedTermIssue["issue"], string> = {
  missing_definition: "Missing definition",
  inconsistent_case: "Inconsistent case",
  undefined_capitalized: "Undefined but capitalized",
};

export default function RiskInsightsCard(props: Props) {
  const {
    redFlags,
    definedTermIssues,
    status,
    error,
    onRunRedFlag,
    onRunDefinedTerms,
    onDismiss,
  } = props;

  const flagCount = redFlags?.length ?? 0;
  const issueCount = definedTermIssues?.length ?? 0;
  const hasResults = flagCount > 0 || issueCount > 0;
  const showLoading = status === "running";

  return (
    <div className="m-2 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden shrink-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-base font-serif text-gray-900">
            {showLoading
              ? "Scanning document…"
              : status === "error"
                ? "Scan failed"
                : flagCount > 0
                  ? `Risk Scan — ${flagCount} issue${flagCount === 1 ? "" : "s"}`
                  : issueCount > 0
                    ? `Defined Terms — ${issueCount} issue${issueCount === 1 ? "" : "s"}`
                    : "Insights"}
          </span>
        </div>
        <button
          onClick={onDismiss}
          className="text-gray-400 hover:text-gray-700 text-sm leading-none"
          title="Dismiss"
          aria-label="Dismiss insights"
        >
          ✕
        </button>
      </div>

      <div className="px-3 py-2.5 space-y-2.5">
        {showLoading && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
            <span>This may take 10–30 seconds depending on document size.</span>
          </div>
        )}

        {status === "error" && error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
            {error}
          </div>
        )}

        {flagCount > 0 && (
          <div className="space-y-2">
            {redFlags!.map((f, i) => (
              <div
                key={`flag-${i}`}
                className="border border-gray-100 rounded-xl p-2.5 bg-gray-50/50"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${SEV_COLOR[f.severity]}`}
                    title={SEV_LABEL[f.severity]}
                  />
                  <span className="text-xs font-semibold text-gray-900">
                    {f.title}
                  </span>
                </div>
                <p className="text-[11px] text-gray-700 leading-relaxed">
                  {f.summary}
                </p>
                {f.location && (
                  <p className="text-[10px] text-gray-400 mt-1">
                    Location: {f.location}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {issueCount > 0 && (
          <div className="space-y-1.5">
            {flagCount > 0 && (
              <div className="text-[10px] uppercase tracking-wide text-gray-400 mt-1">
                Defined terms
              </div>
            )}
            {definedTermIssues!.map((it, i) => (
              <div
                key={`term-${i}`}
                className="flex items-start gap-2 text-[11px]"
              >
                <span className="font-mono text-gray-900 truncate max-w-[140px]">
                  {it.term}
                </span>
                <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] whitespace-nowrap">
                  {ISSUE_LABEL[it.issue] ?? it.issue}
                </span>
                <span className="text-gray-600 flex-1">{it.detail}</span>
              </div>
            ))}
          </div>
        )}

        {!showLoading && status !== "error" && !hasResults && (
          <p className="text-xs text-gray-500">
            Run a quick analysis on the document open in Word.
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onRunRedFlag}
            disabled={showLoading}
            className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {flagCount > 0 ? "Run risk scan again" : "Run risk scan"}
          </button>
          <button
            onClick={onRunDefinedTerms}
            disabled={showLoading}
            className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {issueCount > 0
              ? "Re-check defined terms"
              : "Check defined terms"}
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import {
  importOpenPlaybook,
  listPlaybooks,
  publishPlaybook,
  reviewWithPlaybook,
  type ApiPlaybook,
  type ApiPlaybookRun,
} from "../lib/api";
import { getOpenDocumentBytes } from "../lib/wordDocBytes";
import { getDocumentText } from "../hooks/useWordDoc";
import { applyTrackedChangeWithComment, insertCommentAtRange } from "../lib/wordComments";
import ModelSelector, { DEFAULT_MODEL_ID } from "./ModelSelector";

const statusClass: Record<string, string> = {
  acceptable: "bg-green-100 text-green-800",
  not_applicable: "bg-gray-100 text-gray-700",
  needs_review: "bg-amber-100 text-amber-900",
  unacceptable: "bg-red-100 text-red-800",
  missing_required: "bg-red-100 text-red-800",
  outside_scope: "bg-blue-100 text-blue-800",
};

export default function PlaybooksTab() {
  const [playbooks, setPlaybooks] = useState<ApiPlaybook[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [model, setModel] = useState(() => window.localStorage.getItem("mike.lastModel") || DEFAULT_MODEL_ID);
  const [mode, setMode] = useState<"strict" | "permissive">("strict");
  const [run, setRun] = useState<ApiPlaybookRun | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selected = useMemo(() => playbooks.find((item) => item.id === selectedId) ?? null, [playbooks, selectedId]);

  function refresh(preferredId?: string) {
    return listPlaybooks().then((items) => {
      setPlaybooks(items);
      setSelectedId((current) => preferredId || (current && items.some((item) => item.id === current) ? current : items.find((item) => item.publishedVersionId)?.id ?? items[0]?.id ?? null));
    });
  }

  useEffect(() => { setBusy("load"); refresh().catch((err) => setError(err.message)).finally(() => setBusy(null)); }, []);
  useEffect(() => { window.localStorage.setItem("mike.lastModel", model); }, [model]);

  async function importCurrentDocument() {
    setBusy("import"); setError(null); setRun(null);
    try {
      const open = await getOpenDocumentBytes();
      const created = await importOpenPlaybook({ ...open, model });
      await refresh(created.id);
      setNotice("Draft created. Review and publish it in the Mike web app before use.");
    } catch (err) { setError(err instanceof Error ? err.message : "Playbook import failed."); }
    finally { setBusy(null); }
  }

  async function publishSelected() {
    if (!selected) return;
    setBusy("publish"); setError(null);
    try { const updated = await publishPlaybook(selected.id); setPlaybooks((items) => items.map((item) => item.id === updated.id ? updated : item)); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not publish playbook."); }
    finally { setBusy(null); }
  }

  async function reviewCurrentDocument() {
    if (!selected) return;
    setBusy("review"); setError(null); setNotice(null);
    try {
      const [documentText, open] = await Promise.all([getDocumentText(), getOpenDocumentBytes()]);
      const result = await reviewWithPlaybook(selected.id, { documentText, documentName: open.filename, model, reviewMode: mode });
      setRun(result);
    } catch (err) { setError(err instanceof Error ? err.message : "Playbook review failed."); }
    finally { setBusy(null); }
  }

  async function applyFinding(finding: ApiPlaybookRun["findings"][number], commentsOnly: boolean) {
    if (!finding.quote) { setError("This finding does not have anchor text. Add the missing clause manually."); return; }
    setBusy(`apply-${finding.id}`); setError(null);
    try {
      if (commentsOnly || !finding.suggestedText) {
        await insertCommentAtRange(finding.quote, `Mike playbook: ${finding.analysis}${finding.suggestedText ? `\n\nSuggested language:\n${finding.suggestedText}` : ""}`);
      } else {
        const result = await applyTrackedChangeWithComment({ find: finding.quote, replace: finding.suggestedText, reason: finding.analysis });
        if (!result.applied) throw new Error("The quoted provision could not be found in the current document.");
      }
      setNotice(commentsOnly ? "Comment added." : "Tracked change applied.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not apply finding."); }
    finally { setBusy(null); }
  }

  return <div className="flex h-full flex-col overflow-hidden">
    <div className="border-b border-gray-200 px-3 py-3">
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-serif text-xl">Playbooks</h2><ModelSelector value={model} onChange={setModel} /></div>
      <button onClick={() => void importCurrentDocument()} disabled={!!busy} className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-medium hover:bg-gray-50 disabled:opacity-50">Create playbook from this document</button>
    </div>
    <div className="flex-1 overflow-y-auto px-3 py-3">
      {error && <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
      {notice && <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">{notice}</div>}
      {busy === "load" ? <div className="py-10 text-center text-xs text-gray-500">Loading…</div> : playbooks.length === 0 ? <div className="py-10 text-center text-xs text-gray-500">No playbooks yet.</div> : <>
        <label className="block text-[10px] font-semibold uppercase text-gray-500">Review playbook</label>
        <select value={selectedId ?? ""} onChange={(event) => { setSelectedId(event.target.value); setRun(null); }} className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-2 text-xs"><option value="" disabled>Select a playbook</option>{playbooks.map((item) => <option key={item.id} value={item.id}>{item.name}{item.publishedVersionNumber ? ` (v${item.publishedVersionNumber})` : " (draft)"}</option>)}</select>
        {selected && <div className="mt-3"><div className="flex items-center justify-between text-xs"><span>{selected.draft.topics.length} topics · {selected.draft.topics.reduce((sum, topic) => sum + topic.rules.length, 0)} rules</span><span className={selected.publishedVersionId ? "text-green-700" : "text-amber-700"}>{selected.publishedVersionId ? `Published v${selected.publishedVersionNumber}` : "Draft"}</span></div>{!selected.publishedVersionId ? <button onClick={() => void publishSelected()} disabled={!!busy} className="mt-3 w-full rounded-md bg-gray-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">Publish draft</button> : <><div className="mt-3 grid grid-cols-2 gap-1 rounded-md bg-gray-100 p-1"><button onClick={() => setMode("strict")} className={`rounded px-2 py-1.5 text-xs ${mode === "strict" ? "bg-white shadow-sm" : "text-gray-500"}`}>Strict</button><button onClick={() => setMode("permissive")} className={`rounded px-2 py-1.5 text-xs ${mode === "permissive" ? "bg-white shadow-sm" : "text-gray-500"}`}>Permissive</button></div><button onClick={() => void reviewCurrentDocument()} disabled={!!busy} className="mt-3 w-full rounded-md bg-gray-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">{busy === "review" ? "Reviewing document…" : "Review this document"}</button></>}</div>}
      </>}
      {run && <section className="mt-5 border-t border-gray-200 pt-4"><h3 className="font-serif text-base">Review results</h3><p className="mt-1 text-xs text-gray-600">{run.summary}</p><div className="mt-3 space-y-2">{run.findings.map((finding) => <article key={finding.id} className="rounded-md border border-gray-200 bg-white p-3"><div className="flex items-start justify-between gap-2"><div className="text-xs font-semibold">{finding.ruleName}</div><span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] ${statusClass[finding.status]}`}>{finding.status.replaceAll("_", " ")}</span></div>{finding.location && <div className="mt-1 text-[10px] text-gray-400">{finding.location}</div>}<p className="mt-2 text-xs text-gray-600">{finding.analysis}</p>{finding.suggestedText && <div className="mt-2 border-l-2 border-gray-300 pl-2 text-[11px] text-gray-700">{finding.suggestedText}</div>}{finding.quote && finding.status !== "acceptable" && finding.status !== "not_applicable" && <div className="mt-3 flex gap-2"><button onClick={() => void applyFinding(finding, false)} disabled={!!busy} className="rounded bg-gray-900 px-2 py-1 text-[10px] text-white disabled:opacity-50">Apply edit</button><button onClick={() => void applyFinding(finding, true)} disabled={!!busy} className="rounded border border-gray-200 px-2 py-1 text-[10px] disabled:opacity-50">Add comment</button></div>}</article>)}</div></section>}
    </div>
  </div>;
}

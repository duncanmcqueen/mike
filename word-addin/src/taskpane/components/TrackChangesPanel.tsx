import React, { useCallback, useEffect, useState } from "react";
import {
  acceptAllChanges,
  applyEditsWithTracking,
  getRevisionCount,
  getTrackChangesMode,
  rejectAllChanges,
  setTrackChangesMode,
  type EditProposal,
  type TrackChangesMode,
} from "../hooks/useWordDoc";

const MODE_LABELS: Record<TrackChangesMode, string> = {
  off: "Off",
  all: "Track all",
  mine: "Mine only",
};

export default function TrackChangesPanel() {
  const [mode, setMode] = useState<TrackChangesMode>("off");
  const [revCount, setRevCount] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  // Manual edit proposal form
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [reason, setReason] = useState("");

  const toast = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(""), 3000);
  };

  const refresh = useCallback(() => {
    getTrackChangesMode().then(setMode).catch(() => {});
    getRevisionCount().then(setRevCount).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [refresh]);

  const handleSetMode = async (m: TrackChangesMode) => {
    try {
      await setTrackChangesMode(m);
      setMode(m);
      toast(`Track changes: ${MODE_LABELS[m]}`);
    } catch (e) {
      toast(`Error: ${(e as Error).message}`);
    }
  };

  const handleAcceptAll = async () => {
    setBusy(true);
    const result = await acceptAllChanges();
    setBusy(false);
    if (result.fallback) {
      toast(
        "Your Word version doesn't support the revision API. Use Review → Accept All in the ribbon.",
      );
    } else if (result.ok) {
      toast(
        result.count > 0
          ? `Accepted ${result.count} revision${result.count > 1 ? "s" : ""}`
          : "No revisions to accept",
      );
      refresh();
    }
  };

  const handleRejectAll = async () => {
    setBusy(true);
    const result = await rejectAllChanges();
    setBusy(false);
    if (result.fallback) {
      toast(
        "Your Word version doesn't support the revision API. Use Review → Reject All in the ribbon.",
      );
    } else if (result.ok) {
      toast(
        result.count > 0
          ? `Rejected ${result.count} revision${result.count > 1 ? "s" : ""}`
          : "No revisions to reject",
      );
      refresh();
    }
  };

  const handleApplyEdit = async () => {
    if (!findText) return;
    const edits: EditProposal[] = [
      { find: findText, replace: replaceText, reason: reason || undefined },
    ];
    setBusy(true);
    try {
      const { applied, notFound } = await applyEditsWithTracking(edits);
      if (applied > 0) {
        toast(`Applied as tracked change (${applied} occurrence${applied > 1 ? "s" : ""})`);
        setFindText("");
        setReplaceText("");
        setReason("");
        refresh();
      } else {
        toast(`"${notFound[0]}" not found in document`);
      }
    } catch (e) {
      toast(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-2 space-y-4">
      {/* Track changes mode */}
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Track changes mode
        </p>
        <div className="flex gap-1">
          {(["off", "all", "mine"] as TrackChangesMode[]).map((m) => (
            <button
              key={m}
              onClick={() => handleSetMode(m)}
              className={`flex-1 py-1.5 text-xs rounded-lg transition-colors font-medium ${
                mode === m
                  ? "bg-mike-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
        {mode !== "off" && (
          <p className="text-[10px] text-mike-600 mt-1.5 bg-mike-50 rounded px-2 py-1">
            ✓ Track changes is active — edits will be recorded as revisions
          </p>
        )}
      </div>

      {/* Revision count + accept/reject */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            Pending revisions
          </p>
          {revCount !== null && (
            <span
              className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                revCount > 0
                  ? "bg-orange-100 text-orange-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {revCount}
            </span>
          )}
          {revCount === null && (
            <span className="text-[10px] text-gray-400">
              unavailable in this Word version
            </span>
          )}
        </div>

        <div className="flex gap-1.5">
          <button
            onClick={handleAcceptAll}
            disabled={busy}
            className="flex-1 py-1.5 text-xs bg-green-100 text-green-700 hover:bg-green-200 rounded-lg font-medium transition-colors disabled:opacity-40"
          >
            ✓ Accept all
          </button>
          <button
            onClick={handleRejectAll}
            disabled={busy}
            className="flex-1 py-1.5 text-xs bg-red-100 text-red-700 hover:bg-red-200 rounded-lg font-medium transition-colors disabled:opacity-40"
          >
            ✗ Reject all
          </button>
        </div>
      </div>

      {/* Apply a single tracked edit */}
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Apply edit as tracked change
        </p>
        <div className="space-y-1.5">
          <input
            type="text"
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            placeholder="Find (exact text from document)…"
            className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-mike-500"
          />
          <input
            type="text"
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            placeholder="Replace with…"
            className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-mike-500"
          />
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)…"
            className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-mike-500"
          />
          <button
            onClick={handleApplyEdit}
            disabled={!findText || busy}
            className="w-full py-1.5 text-xs bg-mike-500 text-white rounded-lg hover:bg-mike-600 disabled:opacity-40 transition-colors font-medium"
          >
            {busy ? "Applying…" : "Apply as tracked change"}
          </button>
          <p className="text-[10px] text-gray-400">
            The change will appear in Word as a tracked revision. Use the
            Accept/Reject buttons above (or Word's Review tab) to finalise it.
          </p>
        </div>
      </div>

      {/* Status */}
      {status && (
        <p className="text-xs text-center text-gray-500 bg-gray-50 rounded py-1.5 border border-gray-100">
          {status}
        </p>
      )}
    </div>
  );
}

// Slide-in drawer listing the user's chats. At ~80% width it fits even the
// narrowest task panes; the remaining strip on the right shows the chat
// underneath so the user can tap it to dismiss.

import React from "react";
import { useChatHistory } from "../hooks/useChatHistory";

interface Props {
  open: boolean;
  onClose: () => void;
  /** When set, that chat is highlighted in the list. */
  activeChatId?: string;
  onPick: (chatId: string) => void;
  onNewChat: () => void;
}

function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const delta = Date.now() - t;
  const m = Math.round(delta / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(t).toLocaleDateString();
}

export default function ChatHistoryList({
  open,
  onClose,
  activeChatId,
  onPick,
  onNewChat,
}: Props) {
  const { chats, loading, error, refresh } = useChatHistory(open);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex">
      <div className="w-4/5 max-w-sm h-full bg-white border-r border-gray-200 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 shrink-0">
          <h2 className="font-serif text-sm text-gray-800">Recent chats</h2>
          <button
            onClick={() => {
              onNewChat();
              onClose();
            }}
            className="text-[11px] px-2 py-1 rounded-md bg-mike-500 text-white hover:bg-mike-600"
          >
            New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-xs text-gray-400">Loading…</div>
          ) : error ? (
            <div className="p-4 text-xs text-red-600">
              Failed: {error}{" "}
              <button
                onClick={refresh}
                className="underline hover:text-red-700"
              >
                Retry
              </button>
            </div>
          ) : chats.length === 0 ? (
            <div className="p-4 text-xs text-gray-400">No chats yet.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {chats.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => {
                      onPick(c.id);
                      onClose();
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${
                      c.id === activeChatId ? "bg-mike-50/60" : ""
                    }`}
                  >
                    <div className="text-xs font-medium text-gray-800 truncate">
                      {c.title?.trim() || "Untitled chat"}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {relativeTime(c.created_at)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {/* Click-outside dismiss area */}
      <button
        aria-label="Close chat history"
        onClick={onClose}
        className="flex-1 h-full bg-black/20"
      />
    </div>
  );
}

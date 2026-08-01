// Hook into the backend SSE event bus. The add-in uses this so changes made
// in the desktop Electron app (project created, document uploaded, etc.)
// appear live in the Word task pane without polling.

import { useEffect } from "react";
import { mike } from "../lib/api";
import type { MikeBridgeEvent } from "../lib/types";

export function useBridgeEvents(onEvent: (event: MikeBridgeEvent) => void) {
  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;
    let backoffMs = 1000;

    async function run() {
      while (!cancelled) {
        try {
          const res = await mike.events(ctrl.signal);
          if (!res.ok || !res.body) {
            await new Promise((r) => setTimeout(r, backoffMs));
            backoffMs = Math.min(backoffMs * 2, 30_000);
            continue;
          }
          backoffMs = 1000;

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (!cancelled) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n\n");
            buffer = lines.pop() ?? "";
            for (const block of lines) {
              const m = block.match(/^data:\s*(.*)$/m);
              if (!m) continue;
              try {
                const event = JSON.parse(m[1]) as MikeBridgeEvent;
                onEvent(event);
              } catch {
                /* ignore malformed payloads */
              }
            }
          }
        } catch (err) {
          if (cancelled) return;
          await new Promise((r) => setTimeout(r, backoffMs));
          backoffMs = Math.min(backoffMs * 2, 30_000);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [onEvent]);
}

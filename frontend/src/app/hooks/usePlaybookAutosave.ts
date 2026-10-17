"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  updatePlaybook,
  type Playbook,
  type PlaybookContent,
} from "@/app/lib/mikeApi";
import { notifyError } from "@/app/lib/userFacingError";

type Change = {
  id: string;
  content: PlaybookContent;
  access: Pick<Playbook, "visibility">;
};

/** Serialize writes so a slow response cannot overwrite more recent typing. */
export function usePlaybookAutosave(onSaved: (playbook: Playbook) => void) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const pending = useRef<Change | null>(null);
  const running = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedCallback = useRef(onSaved);
  useEffect(() => {
    savedCallback.current = onSaved;
  }, [onSaved]);

  // Match the workflow editor: acknowledge a completed save briefly. Cleanup
  // prevents that acknowledgement from hiding a later save or failure.
  useEffect(() => {
    if (status !== "saved") return;
    const timeout = setTimeout(() => setStatus("idle"), 2000);
    return () => clearTimeout(timeout);
  }, [status]);

  const flush = useCallback(function flush(): Promise<boolean> {
    if (timer.current) clearTimeout(timer.current);
    if (running.current) return running.current;
    if (!pending.current) return Promise.resolve(true);
    setStatus("saving");
    running.current = (async () => {
      try {
        while (pending.current) {
          const change = pending.current;
          const saved = await updatePlaybook(
            change.id,
            change.content,
            change.access,
          );
          if (pending.current === change) {
            pending.current = null;
            savedCallback.current(saved);
          }
        }
        setStatus("saved");
        return true;
      } catch (error) {
        setStatus("error");
        notifyError(error, {
          action: "save your playbook",
          dedupeKey: `playbook-autosave:${pending.current?.id}`,
          onRetry: () => {
            void flush();
          },
        });
        return false;
      } finally {
        running.current = null;
      }
    })();
    return running.current;
  }, []);

  const schedule = useCallback(
    (change: Change) => {
      pending.current = change;
      setStatus("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush();
      }, 800);
    },
    [flush],
  );

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!pending.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      // Internal navigation must not discard the trailing debounce.
      void flush();
    };
  }, [flush]);

  return { status, schedule, flush, resetStatus: () => setStatus("idle") };
}

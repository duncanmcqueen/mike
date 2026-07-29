"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function PreResponseWrapper({
    children,
    stepCount,
    shouldMinimize,
    isStreaming,
    compact = false,
    forceOpen = false,
}: {
    children: React.ReactNode;
    stepCount: number;
    shouldMinimize: boolean;
    isStreaming: boolean;
    /** Tighter typography + child gap for narrow side panels (e.g. TR chat). */
    compact?: boolean;
    forceOpen?: boolean;
}) {
    const [toggledOpen, setToggledOpen] = useState<boolean | null>(null);
    // Once content has streamed in (shouldMinimize=true even once), stay
    // minimized even if a later render briefly evaluates shouldMinimize=false.
    // Without this latch, the wrapper visibly pops open when isStreaming
    // flips off at the end of the response.
    const [hasMinimized, setHasMinimized] = useState(shouldMinimize);
    if (shouldMinimize && !hasMinimized) {
        setHasMinimized(true);
    }

    const isOpen = forceOpen
        ? true
        : toggledOpen !== null
          ? toggledOpen
          : !shouldMinimize && !hasMinimized;

    const stepWord = `step${stepCount === 1 ? "" : "s"}`;
    const label = isStreaming
        ? "Working"
        : `Completed in ${stepCount} ${stepWord}`;

    const buttonTextClass = compact ? "text-xs" : "text-sm";
    const childrenGapClass = compact ? "gap-2.5" : "gap-4";

    return (
        <div className="rounded-xl border border-white/70 bg-white/55 px-3 py-2 shadow-[0_3px_9px_rgba(15,23,42,0.03),inset_0_1px_0_rgba(255,255,255,0.9),inset_0_-4px_9px_rgba(255,255,255,0.05)] backdrop-blur-2xl">
            <button
                type="button"
                onClick={() => {
                    setToggledOpen(!isOpen);
                }}
                className={`w-full flex items-center justify-between font-serif text-gray-500 hover:text-gray-700 transition-colors ${buttonTextClass}`}
            >
                <span className="flex items-baseline min-w-0">
                    <span className="truncate">{label}</span>
                    {isStreaming && (
                        <span className="inline-flex ml-1 shrink-0 items-baseline">
                            <span className="w-0.5 h-0.5 rounded-full bg-gray-400 mr-0.5 animate-[bounce_1.4s_infinite_0s]" />
                            <span className="w-0.5 h-0.5 rounded-full bg-gray-400 mr-0.5 animate-[bounce_1.4s_infinite_0.2s]" />
                            <span className="w-0.5 h-0.5 rounded-full bg-gray-400 animate-[bounce_1.4s_infinite_0.4s]" />
                        </span>
                    )}
                </span>
                <ChevronDown
                    size={12}
                    className={`relative top-px shrink-0 ml-2 transition-transform duration-200 ${isOpen ? "" : "-rotate-90"}`}
                />
            </button>
            {isOpen && (
                <div className={`mt-3 flex flex-col ${childrenGapClass}`}>
                    {children}
                </div>
            )}
        </div>
    );
}

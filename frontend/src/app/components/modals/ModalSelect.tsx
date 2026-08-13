"use client";

import { useState } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/app/lib/utils";

export type ModalSelectOption =
    | string
    | {
          value: string;
          label: string;
          icon?: LucideIcon;
          iconClassName?: string;
      };

interface ModalSelectProps {
    id: string;
    value: string;
    options: readonly ModalSelectOption[];
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    className?: string;
    menuClassName?: string;
    searchable?: boolean;
    searchPlaceholder?: string;
}

function normalizeOption(option: ModalSelectOption) {
    return typeof option === "string"
        ? { value: option, label: option }
        : option;
}

export function ModalSelect({
    id,
    value,
    options,
    onChange,
    placeholder = "Select...",
    disabled = false,
    open,
    onOpenChange,
    className,
    menuClassName,
    searchable = false,
    searchPlaceholder = "Search options...",
}: ModalSelectProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const [query, setQuery] = useState("");
    const isOpen = open ?? internalOpen;
    const normalizedOptions = options.map(normalizeOption);
    const normalizedQuery = query.trim().toLowerCase();
    const visibleOptions = normalizedQuery
        ? normalizedOptions.filter(
              (option) =>
                  option.label.toLowerCase().includes(normalizedQuery) ||
                  option.value.toLowerCase().includes(normalizedQuery),
          )
        : normalizedOptions;
    const selected = normalizedOptions.find((option) => option.value === value);
    const hasValue = value.trim().length > 0;

    function setOpen(next: boolean) {
        if (!next) setQuery("");
        onOpenChange?.(next);
        if (open === undefined) {
            setInternalOpen(next);
        }
    }

    function handleSelect(nextValue: string) {
        setOpen(false);
        onChange(nextValue);
    }

    return (
        <div className="relative">
            <button
                id={id}
                type="button"
                onClick={() => setOpen(!isOpen)}
                disabled={disabled}
                className={cn(
                    "flex h-10 w-full items-center justify-between rounded-xl border border-white/70 bg-white/55 px-3 text-sm text-gray-700 shadow-[0_3px_9px_rgba(15,23,42,0.052),inset_0_1px_0_rgba(255,255,255,0.86),inset_0_-1px_0_rgba(255,255,255,0.58)] backdrop-blur-xl transition-colors hover:bg-white/70 focus:bg-white/70 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60",
                    className,
                )}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
            >
                <span className="flex min-w-0 items-center gap-2">
                    {selected?.icon && (
                        <selected.icon
                            className={cn(
                                "h-3.5 w-3.5 shrink-0",
                                selected.iconClassName,
                            )}
                        />
                    )}
                    <span
                        className={cn(
                            "truncate",
                            !selected && !hasValue && "text-gray-400",
                        )}
                    >
                        {selected?.label ?? (hasValue ? value : placeholder)}
                    </span>
                </span>
                <ChevronDown
                    className={cn(
                        "ml-2 h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform",
                        isOpen && "rotate-180",
                    )}
                />
            </button>
            {isOpen && !disabled && (
                <div
                    className={cn(
                        "absolute left-0 top-full z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-2xl border border-white/70 bg-gray-50/95 p-1 shadow-[0_12px_32px_rgba(15,23,42,0.156),inset_0_1px_0_rgba(255,255,255,0.86),inset_0_-1px_0_rgba(255,255,255,0.58)] backdrop-blur-2xl",
                        menuClassName,
                    )}
                >
                    {searchable && (
                        <div className="sticky top-0 z-10 bg-gray-50/95 p-1 backdrop-blur-2xl">
                            <input
                                autoFocus
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Escape") setOpen(false);
                                }}
                                placeholder={searchPlaceholder}
                                aria-label={searchPlaceholder}
                                className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-gray-400"
                            />
                        </div>
                    )}
                    <div role="listbox" aria-labelledby={id}>
                        {visibleOptions.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                role="option"
                                aria-selected={option.value === value}
                                onClick={() => handleSelect(option.value)}
                                className={cn(
                                    "flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition-all hover:bg-gray-100/70",
                                    option.value === value
                                        ? "bg-gray-100 text-gray-900"
                                        : "text-gray-700",
                                )}
                            >
                                <span className="flex min-w-0 items-center gap-2">
                                    {option.icon && (
                                        <option.icon
                                            className={cn(
                                                "h-3.5 w-3.5 shrink-0",
                                                option.iconClassName,
                                            )}
                                        />
                                    )}
                                    <span className="truncate">
                                        {option.label}
                                    </span>
                                </span>
                            </button>
                        ))}
                    </div>
                    {visibleOptions.length === 0 && (
                        <p className="px-3 py-4 text-center text-xs text-gray-400">
                            No options found.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

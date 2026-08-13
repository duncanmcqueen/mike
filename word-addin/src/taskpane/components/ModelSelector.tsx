import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  getApiKeyStatus,
  getConfiguredModels,
  type ApiKeyStatus,
  type ConfiguredModelSummary,
} from "../lib/api";

export type ModelGroup =
  | "Committee"
  | "Local"
  | "Anthropic"
  | "Moonshot"
  | "Google"
  | "OpenAI";

export interface ModelOption {
  id: string;
  label: string;
  group: ModelGroup;
}

export const MODELS: ModelOption[] = [
  { id: "claude-fable-5", label: "Claude Fable 5", group: "Anthropic" },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8", group: "Anthropic" },
  { id: "claude-opus-4-7", label: "Claude Opus 4.7", group: "Anthropic" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", group: "Anthropic" },
  { id: "kimi-k3", label: "Kimi K3", group: "Moonshot" },
  { id: "kimi-k3-256k", label: "Kimi K3 256K", group: "Moonshot" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", group: "Google" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", group: "Google" },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash", group: "Google" },
  { id: "gpt-5.5", label: "GPT-5.5", group: "OpenAI" },
  { id: "gpt-5.4", label: "GPT-5.4", group: "OpenAI" },
];

export const DEFAULT_MODEL_ID = "gemini-3-flash-preview";
export const MODEL_STORAGE_KEY = "mike.lastModel";

const GROUPS: ModelGroup[] = [
  "Committee",
  "Local",
  "Anthropic",
  "Moonshot",
  "Google",
  "OpenAI",
];

function configuredOption(model: ConfiguredModelSummary): ModelOption {
  const group: ModelGroup =
    model.location === "committee"
      ? "Committee"
      : model.location === "local"
        ? "Local"
        : model.provider === "claude"
          ? "Anthropic"
          : model.id.startsWith("kimi-")
            ? "Moonshot"
            : model.provider === "gemini"
              ? "Google"
              : "OpenAI";
  return { id: model.id, label: model.label, group };
}

function isAvailable(model: ModelOption, keys: ApiKeyStatus | null): boolean {
  if (!keys || model.group === "Local" || model.group === "Committee") return true;
  if (model.group === "Anthropic") return keys.claude === true;
  if (model.group === "Moonshot") return keys.kimi === true;
  if (model.group === "Google") return keys.gemini === true;
  return keys.openai === true || keys.openrouter === true;
}

interface Props {
  value: string;
  onChange: (id: string) => void;
}

export default function ModelSelector({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ModelOption[]>(MODELS);
  const [keys, setKeys] = useState<ApiKeyStatus | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getConfiguredModels(), getApiKeyStatus()])
      .then(([configured, status]) => {
        if (cancelled) return;
        const merged = new Map(MODELS.map((model) => [model.id, model]));
        configured.map(configuredOption).forEach((model) => merged.set(model.id, model));
        setOptions([...merged.values()]);
        setKeys(status);
      })
      .catch(() => {
        // The built-in choices remain usable and the send request will show
        // the backend's provider-specific error if a key is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const selected = options.find((model) => model.id === value) ?? options[0];
  const grouped = useMemo(
    () => GROUPS.map((group) => ({ group, items: options.filter((model) => model.group === group) }))
      .filter(({ items }) => items.length > 0),
    [options],
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        title="Choose model"
        className="flex h-7 max-w-[150px] items-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-[11px] text-gray-600 hover:bg-gray-50"
      >
        <span className="truncate">{selected.label}</span>
        <span aria-hidden="true" className="shrink-0 text-[9px]">▾</span>
      </button>

      {open ? (
        <div className="absolute bottom-full left-0 z-30 mb-1 max-h-72 w-56 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {grouped.map(({ group, items }, index) => (
            <div key={group}>
              {index > 0 ? <div className="my-1 border-t border-gray-100" /> : null}
              <div className="px-2 py-0.5 text-[9px] uppercase text-gray-400">{group}</div>
              {items.map((model) => {
                const available = isAvailable(model, keys);
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      onChange(model.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-1.5 px-2 py-1 text-left text-[11px] hover:bg-gray-50 ${model.id === value ? "bg-gray-50" : ""}`}
                  >
                    {!available ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" title="API key missing" /> : null}
                    <span className={`flex-1 truncate ${available ? "text-gray-700" : "text-gray-400"}`}>{model.label}</span>
                    {model.id === value ? <span aria-label="Selected">✓</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

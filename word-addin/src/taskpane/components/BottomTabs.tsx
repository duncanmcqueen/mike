import React from "react";

export type TabId = "chat" | "projects" | "tabular" | "workflows" | "playbooks" | "track";

interface Props {
  active: TabId;
  onChange: (tab: TabId) => void;
}

// Inline SVG icons modeled on lucide-react glyphs. We use SVG directly rather
// than importing lucide-react to avoid adding a new dependency to the
// add-in's bundle.
const Icon = {
  chat: (props: React.SVGProps<SVGSVGElement>) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  projects: (props: React.SVGProps<SVGSVGElement>) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      <path d="M2 10h20" />
      <path d="M12 15v3" />
      <path d="M9 15v3" />
      <path d="M15 15v3" />
    </svg>
  ),
  tabular: (props: React.SVGProps<SVGSVGElement>) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
      <path d="M9 3v18" />
      <path d="M15 3v18" />
    </svg>
  ),
  workflows: (props: React.SVGProps<SVGSVGElement>) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="15" y="15" width="6" height="6" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
      <path d="M3 6h3" />
      <path d="M18 18h3" />
    </svg>
  ),
  playbooks: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 5h11" /><path d="M9 12h11" /><path d="M9 19h11" />
      <path d="m3 5 1 1 2-2" /><path d="m3 12 1 1 2-2" /><path d="m3 19 1 1 2-2" />
    </svg>
  ),
  track: (props: React.SVGProps<SVGSVGElement>) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  ),
};

const TABS: { id: TabId; label: string; icon: keyof typeof Icon }[] = [
  { id: "chat", label: "Chat", icon: "chat" },
  { id: "projects", label: "Projects", icon: "projects" },
  { id: "tabular", label: "Tabular", icon: "tabular" },
  { id: "workflows", label: "Workflows", icon: "workflows" },
  { id: "playbooks", label: "Playbooks", icon: "playbooks" },
  { id: "track", label: "Track", icon: "track" },
];

export default function BottomTabs({ active, onChange }: Props) {
  return (
    <nav
      className="shrink-0 flex items-stretch border-t border-gray-200 bg-white/90 backdrop-blur-sm"
      style={{ height: 54 }}
      aria-label="Primary navigation"
    >
      {TABS.map((t) => {
        const IconCmp = Icon[t.icon];
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-current={isActive ? "page" : undefined}
            className={`group relative flex-1 flex flex-col items-center justify-center gap-0.5 px-1 transition-colors ${
              isActive
                ? "text-gray-900"
                : "text-gray-400 hover:text-gray-700"
            }`}
          >
            {isActive && (
              <span
                aria-hidden
                className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full bg-gray-900"
              />
            )}
            <IconCmp
              width={18}
              height={18}
              strokeWidth={isActive ? 2.25 : 1.75}
            />
            <span
              className={`text-[10px] leading-none whitespace-nowrap ${
                isActive ? "font-semibold" : "font-medium"
              }`}
            >
              {t.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

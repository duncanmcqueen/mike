// Canonical Mike domain types — used by backend, frontend, word-addin, electron, mcp-server.

export interface MikeFolder {
  id: string;
  project_id: string;
  user_id: string;
  name: string;
  parent_folder_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MikeProject {
  id: string;
  user_id: string;
  is_owner?: boolean;
  name: string;
  cm_number: string | null;
  shared_with: string[];
  created_at: string;
  updated_at: string;
  documents?: MikeDocument[];
  folders?: MikeFolder[];
  document_count?: number;
  chat_count?: number;
  review_count?: number;
}

export interface StructureNode {
  id: string;
  title: string;
  level: number;
  page_number: number | null;
  children: StructureNode[];
}

export interface MikeDocument {
  id: string;
  user_id?: string;
  project_id: string | null;
  folder_id?: string | null;
  filename: string;
  file_type: string | null; // pdf | docx | doc
  storage_path: string | null;
  pdf_storage_path: string | null;
  size_bytes: number | null;
  page_count: number | null;
  structure_tree: StructureNode[] | null;
  status: "pending" | "processing" | "ready" | "error";
  created_at: string | null;
  updated_at?: string | null;
  latest_version_number?: number | null;
}

export interface MikeChat {
  id: string;
  project_id: string | null;
  user_id: string;
  title: string | null;
  created_at: string;
}

export interface MikeEditAnnotation {
  type?: "edit_data";
  kind?: "edit";
  edit_id: string;
  document_id: string;
  version_id: string;
  version_number?: number | null;
  change_id: string;
  del_w_id?: string;
  ins_w_id?: string;
  deleted_text: string;
  inserted_text: string;
  context_before?: string;
  context_after?: string;
  reason?: string;
  status: "pending" | "accepted" | "rejected";
}

export type AssistantEvent =
  | { type: "reasoning"; text: string; isStreaming?: boolean }
  | { type: "tool_call_start"; name: string; isStreaming?: boolean }
  | { type: "thinking"; isStreaming?: boolean }
  | {
      type: "doc_read";
      filename: string;
      document_id?: string;
      isStreaming?: boolean;
    }
  | {
      type: "doc_find";
      filename: string;
      query: string;
      total_matches: number;
      isStreaming?: boolean;
    }
  | {
      type: "doc_created";
      filename: string;
      download_url: string;
      document_id?: string;
      version_id?: string;
      version_number?: number | null;
      isStreaming?: boolean;
    }
  | { type: "doc_download"; filename: string; download_url: string }
  | {
      type: "doc_replicated";
      filename: string;
      count: number;
      copies?: {
        new_filename: string;
        document_id: string;
        version_id: string;
      }[];
      error?: string;
      isStreaming?: boolean;
    }
  | { type: "workflow_applied"; workflow_id: string; title: string }
  | {
      type: "doc_edited";
      filename: string;
      document_id: string;
      version_id: string;
      version_number?: number | null;
      download_url: string;
      annotations: MikeEditAnnotation[];
      error?: string;
      isStreaming?: boolean;
    }
  | { type: "content"; text: string; isStreaming?: boolean };

export interface MikeMessage {
  role: "user" | "assistant";
  content: string;
  files?: { filename: string; document_id?: string }[];
  workflow?: { id: string; title: string };
  model?: string;
  annotations?: MikeCitationAnnotation[];
  events?: AssistantEvent[];
  error?: string;
}

export interface CitationQuote {
  page: number;
  quote: string;
}

export interface MikeCitationAnnotation {
  type: "citation_data";
  ref: number;
  doc_id: string;
  document_id: string;
  version_id?: string | null;
  version_number?: number | null;
  filename: string;
  page: number | string;
  quote: string;
}

export const PAGE_BREAK_SENTINEL = "[[PAGE_BREAK]]";

export function expandCitationToEntries(
  a: MikeCitationAnnotation,
): CitationQuote[] {
  const rangeMatch =
    typeof a.page === "string" ? a.page.match(/^(\d+)\s*-\s*(\d+)$/) : null;
  if (rangeMatch && a.quote.includes(PAGE_BREAK_SENTINEL)) {
    const startPage = parseInt(rangeMatch[1], 10);
    const endPage = parseInt(rangeMatch[2], 10);
    const [before, after] = a.quote.split(PAGE_BREAK_SENTINEL);
    return [
      { page: startPage, quote: before.trim() },
      { page: endPage, quote: after.trim() },
    ].filter((e) => e.quote.length > 0);
  }
  const pageNum =
    typeof a.page === "number" ? a.page : parseInt(String(a.page), 10);
  if (!Number.isFinite(pageNum)) return [];
  return [{ page: pageNum, quote: a.quote }];
}

export function formatCitationPage(a: MikeCitationAnnotation): string {
  return `Page ${a.page}`;
}

export function displayCitationQuote(a: MikeCitationAnnotation): string {
  return a.quote.replaceAll(PAGE_BREAK_SENTINEL, "...");
}

// ---------------------------------------------------------------------------
// Tabular Review
// ---------------------------------------------------------------------------

export type ColumnFormat =
  | "text"
  | "bulleted_list"
  | "number"
  | "currency"
  | "yes_no"
  | "date"
  | "tag"
  | "percentage"
  | "monetary_amount";

export interface ColumnConfig {
  index: number;
  name: string;
  prompt: string;
  format?: ColumnFormat;
  tags?: string[];
}

export interface TabularReview {
  id: string;
  project_id: string | null;
  user_id: string;
  title: string | null;
  columns_config: ColumnConfig[] | null;
  workflow_id: string | null;
  practice?: string | null;
  shared_with?: string[];
  is_owner?: boolean;
  created_at: string;
  updated_at: string;
  document_count?: number;
}

export interface TabularCell {
  id: string;
  review_id: string;
  document_id: string;
  column_index: number;
  content: {
    summary: string;
    flag?: "green" | "grey" | "yellow" | "red";
    reasoning?: string;
  } | null;
  status: "pending" | "generating" | "done" | "error";
  created_at: string;
}

// ---------------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------------

export interface MikeWorkflow {
  id: string;
  user_id: string | null;
  title: string;
  type: "assistant" | "tabular";
  prompt_md: string | null;
  columns_config: ColumnConfig[] | null;
  is_system: boolean;
  created_at: string;
  practice?: string | null;
  shared_by_name?: string | null;
  allow_edit?: boolean;
  is_owner?: boolean;
}

// ---------------------------------------------------------------------------
// Playbooks
// ---------------------------------------------------------------------------

export interface PlaybookClause {
  text: string;
  usage: "illustrative" | "preferred" | "verbatim" | "accepted" | "unacceptable";
  sourceRefs: string[];
}
export interface PlaybookPosition { name: string; criteria: string; sampleClauses: PlaybookClause[]; }
export interface PlaybookRule {
  id: string;
  name: string;
  concept: string;
  scope: "clause" | "agreement";
  required: boolean;
  guidance: string;
  standard: PlaybookPosition | null;
  fallbacks: PlaybookPosition[];
  unacceptable: PlaybookPosition[];
  conditions: string[];
  actions: Array<{ scenario: string; instruction: string }>;
  sourceRefs: string[];
}
export interface PlaybookTopic { id: string; name: string; rules: PlaybookRule[]; }
export interface PlaybookContent {
  name: string;
  description: string;
  globalGuidance: string;
  representedParty: string;
  documentTypes: string[];
  jurisdictions: string[];
  topics: PlaybookTopic[];
}
export interface MikePlaybook {
  id: string;
  userId: string;
  name: string;
  description: string;
  status: "draft" | "published";
  draft: PlaybookContent;
  publishedVersionId: string | null;
  publishedVersionNumber: number | null;
  publishedName: string | null;
  sourceFilename: string | null;
  importModel: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface PlaybookFinding {
  id: string;
  topicId: string | null;
  ruleId: string | null;
  ruleName: string;
  status: "not_applicable" | "acceptable" | "needs_review" | "unacceptable" | "missing_required" | "outside_scope";
  quote: string;
  location: string;
  analysis: string;
  suggestedText: string;
}
export interface PlaybookRun {
  id: string;
  playbookId: string;
  versionId: string;
  model: string;
  documentName: string | null;
  reviewMode: "strict" | "permissive";
  status: "running" | "completed" | "failed";
  summary: string | null;
  findings: PlaybookFinding[];
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

// ---------------------------------------------------------------------------
// Aggregate / detail responses
// ---------------------------------------------------------------------------

export interface MikeChatDetailOut {
  chat: MikeChat;
  messages: MikeMessage[];
}

export interface TabularReviewDetailOut {
  review: TabularReview;
  cells: TabularCell[];
  documents: MikeDocument[];
}

// ---------------------------------------------------------------------------
// AI Keys (Phase 3)
// ---------------------------------------------------------------------------

export type AiProvider =
  | "anthropic"
  | "openai"
  | "gemini"
  | "openrouter"
  | "custom";

export interface AiProviderKey {
  /** Whether this key is enabled and should be used for routing */
  enabled: boolean;
  /** When reading from API: masked preview only (e.g. sk-ant-•••••xyz). When writing: full key. */
  key: string | null;
  /** For "custom" providers, optional friendly label. */
  label?: string;
  /** For "custom" providers, optional base URL. */
  base_url?: string;
  /** Optional default model id for this provider. */
  default_model?: string;
}

export type AiKeysMap = Partial<Record<AiProvider, AiProviderKey>>;

export type ConfiguredModelSummary = {
  id: string;
  label: string;
  provider: "claude" | "gemini" | "openai" | "openai-compatible" | "committee";
  location: "cloud" | "local" | "committee";
};

export type MikeBridgeEvent =
  | { type: "ping"; ts: number }
  | { type: "project.created" | "project.updated"; project: MikeProject }
  | { type: "project.deleted"; project_id: string }
  | { type: "document.created" | "document.updated"; document: MikeDocument }
  | { type: "document.deleted"; document_id: string }
  | { type: "chat.created"; chat: MikeChat }
  | { type: "chat.deleted"; chat_id: string }
  | { type: "chat.message_appended"; chat_id: string; message_id: string };

// ---------------------------------------------------------------------------
// MCP (Phase 4)
// ---------------------------------------------------------------------------

export interface McpToken {
  id: string;
  user_id: string;
  /** Friendly label e.g. "Claude Desktop on MacBook" */
  label: string;
  /** Token preview (last 6 chars) — full token only returned on creation. */
  preview: string;
  scope: "read" | "read_write";
  created_at: string;
  last_used_at: string | null;
}

// Hidden / PII redaction types removed alongside the Presidio sidecar.

import { API_BASE, authHeader } from "./auth";
import type {
  ConfiguredModelSummary,
  MikeChat,
  MikeChatDetailOut,
  MikeDocument,
  MikeMessage,
  MikeProject,
  MikeWorkflow,
  MikePlaybook,
  PlaybookRun,
  TabularReview,
  TabularReviewDetailOut,
} from "./types";

export { API_BASE };
export type {
  ConfiguredModelSummary,
  MikeChat,
  MikeChatDetailOut,
  MikeWorkflow,
};
export type ApiProject = MikeProject;
export type ApiDocument = MikeDocument;
export type ApiWorkflow = MikeWorkflow;
export type ApiTabularReview = TabularReview;
export type ApiTabularReviewDetail = TabularReviewDetailOut;
export type ApiPlaybook = MikePlaybook;
export type ApiPlaybookRun = PlaybookRun;

declare const process: {
  env: { MIKE_WEB_URL?: string };
};

const WEB_APP_URL =
  process.env.MIKE_WEB_URL?.trim().replace(/\/$/, "") ||
  "http://localhost:3000";

export class MikeApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Mike API request failed (${status}): ${body || "No response body"}`);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      ...authHeader(),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let detail = text;
    try {
      const parsed = JSON.parse(text) as { detail?: unknown };
      if (typeof parsed.detail === "string") detail = parsed.detail;
    } catch {
      // Preserve non-JSON backend errors.
    }
    throw new MikeApiError(response.status, detail);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const mike = {
  events(signal?: AbortSignal) {
    return fetch(`${API_BASE}/events`, {
      headers: { Accept: "text/event-stream", ...authHeader() },
      signal,
    });
  },
};

export interface ApiChatMessage {
  role: string;
  content: string;
  files?: { filename: string; document_id?: string }[];
  workflow?: { id: string; title: string };
}

export interface StreamChatPayload {
  messages: ApiChatMessage[];
  chat_id?: string;
  model?: string;
  workflow?: { id: string; title: string };
  files?: { document_id?: string; filename: string }[];
  editMode?: "track" | "comments";
  selection?: { text: string; has_selection: boolean };
  creation_mode?: "project" | "this_word_doc";
  signal?: AbortSignal;
}

export function streamChat(payload: StreamChatPayload): Promise<Response> {
  const { signal, ...body } = payload;
  return fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...authHeader(),
    },
    body: JSON.stringify(body),
    signal,
  });
}

export function streamProjectChat(
  payload: StreamChatPayload & { projectId: string },
): Promise<Response> {
  const { signal, projectId, files, ...rest } = payload;
  return fetch(`${API_BASE}/projects/${encodeURIComponent(projectId)}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...authHeader(),
    },
    body: JSON.stringify({
      ...rest,
      attached_documents: files ?? undefined,
    }),
    signal,
  });
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((event) => {
      if (!event || typeof event !== "object") return "";
      const row = event as { type?: unknown; text?: unknown; message?: unknown };
      if (row.type === "content" && typeof row.text === "string") {
        return row.text;
      }
      return "";
    })
    .join("");
}

export function listChats(): Promise<MikeChat[]> {
  return request<MikeChat[]>("/chat");
}

export async function getChat(chatId: string): Promise<MikeChatDetailOut> {
  const detail = await request<{
    chat: MikeChat;
    messages: Array<Omit<MikeMessage, "content"> & { content: unknown }>;
  }>(`/chat/${encodeURIComponent(chatId)}`);
  return {
    chat: detail.chat,
    messages: detail.messages.map((message) => ({
      ...message,
      content: messageText(message.content),
    })),
  };
}

export function listProjects(): Promise<MikeProject[]> {
  return request<MikeProject[]>("/projects");
}

export function getProject(projectId: string): Promise<MikeProject> {
  return request<MikeProject>(`/projects/${encodeURIComponent(projectId)}`);
}

export function listProjectDocuments(projectId: string): Promise<MikeDocument[]> {
  return request<MikeDocument[]>(
    `/projects/${encodeURIComponent(projectId)}/documents`,
  );
}

export function getProjectDetail(projectId: string): Promise<MikeDocument[]> {
  return listProjectDocuments(projectId);
}

type WorkflowWire = Partial<MikeWorkflow> & {
  id: string;
  metadata?: {
    title?: string;
    type?: "assistant" | "tabular";
    practice?: string | null;
  };
  skill_md?: string | null;
};

function normalizeWorkflow(workflow: WorkflowWire): MikeWorkflow {
  return {
    id: workflow.id,
    user_id: workflow.user_id ?? null,
    title: workflow.metadata?.title ?? workflow.title ?? "Untitled workflow",
    type: workflow.metadata?.type ?? workflow.type ?? "assistant",
    prompt_md: workflow.skill_md ?? workflow.prompt_md ?? null,
    columns_config: workflow.columns_config ?? null,
    is_system: workflow.is_system ?? false,
    created_at: workflow.created_at ?? "",
    practice: workflow.metadata?.practice ?? workflow.practice ?? null,
    shared_by_name: workflow.shared_by_name ?? null,
    allow_edit: workflow.allow_edit,
    is_owner: workflow.is_owner,
  };
}

export async function listWorkflows(): Promise<MikeWorkflow[]> {
  const rows = await request<WorkflowWire[]>("/workflows");
  return rows.map(normalizeWorkflow);
}

export async function listAssistantWorkflows(): Promise<MikeWorkflow[]> {
  const rows = await request<WorkflowWire[]>("/workflows?type=assistant");
  return rows.map(normalizeWorkflow).filter((workflow) => workflow.type === "assistant");
}

export function listTabularReviews(projectId?: string): Promise<TabularReview[]> {
  const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : "";
  return request<TabularReview[]>(`/tabular-review${query}`);
}

export function getTabularReview(reviewId: string): Promise<TabularReviewDetailOut> {
  return request<TabularReviewDetailOut>(
    `/tabular-review/${encodeURIComponent(reviewId)}`,
  );
}

export async function getConfiguredModels(): Promise<ConfiguredModelSummary[]> {
  const response = await request<{ configured: ConfiguredModelSummary[] }>(
    "/user/models",
  );
  return response.configured;
}

export type ApiKeyStatus = {
  claude?: boolean;
  kimi?: boolean;
  gemini?: boolean;
  openai?: boolean;
  openrouter?: boolean;
};

export function getApiKeyStatus(): Promise<ApiKeyStatus> {
  return request<ApiKeyStatus>("/user/api-keys");
}

export async function uploadDocument(
  file: File,
): Promise<{ id: string; filename: string }> {
  const form = new FormData();
  form.append("file", file);
  return request<{ id: string; filename: string }>("/single-documents", {
    method: "POST",
    body: form,
  });
}

export function openInDesktop(route: string): Promise<void> {
  const safeRoute = route.startsWith("/") ? route : `/${route}`;
  window.open(`${WEB_APP_URL}${safeRoute}`, "_blank", "noopener,noreferrer");
  return Promise.resolve();
}

export async function uploadDocumentBlob(opts: {
  blob: Blob;
  filename: string;
  projectId: string | null;
}): Promise<{ id: string; filename: string }> {
  const form = new FormData();
  form.append("file", opts.blob, opts.filename);
  const path = opts.projectId
    ? `/projects/${encodeURIComponent(opts.projectId)}/documents`
    : "/single-documents";
  return request<{ id: string; filename: string }>(path, {
    method: "POST",
    body: form,
  });
}

export function listPlaybooks(): Promise<MikePlaybook[]> {
  return request<MikePlaybook[]>("/playbooks");
}

export async function importOpenPlaybook(opts: {
  blob: Blob;
  filename: string;
  model: string;
}): Promise<MikePlaybook> {
  const form = new FormData();
  form.append("file", opts.blob, opts.filename);
  form.append("model", opts.model);
  return request<MikePlaybook>("/playbooks/import", { method: "POST", body: form });
}

export function publishPlaybook(playbookId: string): Promise<MikePlaybook> {
  return request<MikePlaybook>(`/playbooks/${encodeURIComponent(playbookId)}/publish`, { method: "POST" });
}

export function reviewWithPlaybook(playbookId: string, payload: {
  documentText: string;
  documentName?: string;
  model: string;
  reviewMode: "strict" | "permissive";
}): Promise<PlaybookRun> {
  return request<PlaybookRun>(`/playbooks/${encodeURIComponent(playbookId)}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function absoluteApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const prefix = /^https?:\/\//i.test(API_BASE)
    ? API_BASE
    : `${window.location.origin}${API_BASE}`;
  return `${prefix.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function createOfficeDownloadUrl(downloadUrl: string): Promise<string> {
  const url = new URL(absoluteApiUrl(downloadUrl));
  const token = url.pathname.split("/").filter(Boolean).pop();
  if (!token) throw new Error("The document download link is invalid.");
  const result = await request<{ download_url: string }>(
    `/download/office-link/${encodeURIComponent(token)}`,
    { method: "POST" },
  );
  return absoluteApiUrl(result.download_url);
}

import type {
  ConfiguredModel,
  LlmMessage,
  NormalizedToolCall,
  StreamChatParams,
  StreamChatResult,
} from "./types";
import { apiKeyForConfiguredModel, getConfiguredModel } from "./registry";

type ChatCompletionResponse = {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
};

type ChatMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: {
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

type StreamDelta = {
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: {
    index: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }[];
};

type StreamChunk = {
  choices?: { delta?: StreamDelta; finish_reason?: string | null }[];
  error?: { message?: string };
};

const COURTLISTENER_CITATION_REMINDER_TOOL_NAMES = new Set([
  "courtlistener_find_in_case",
  "courtlistener_read_case",
]);
const COURTLISTENER_CITATION_REMINDER = `COURTLISTENER CITATION REMINDER:
If your final answer relies on any CourtListener case, every such case reference must have BOTH a clickable markdown case link and an inline [N] marker.
Include the clickable case link only the first time you cite that case; later references to the same case should reuse the existing inline [N] marker without repeating the link unless clarity requires it.
Assign new refs in first-use order as much as possible: [1], then [2], then [3]. Reuse an existing ref when citing the same case/passage again, even if that means a later sentence cites [3] and then [1] again.
End the response with a <CITATIONS> block containing one matching case entry per [N] marker:
{"ref": N, "cluster_id": 123, "quotes": [{"opinion_id": 456, "quote": "exact verbatim opinion text"}]}.
Do not use doc_id, page, top-level quote, case_name, or citation fields for CourtListener case entries.`;

function baseUrl(model: ConfiguredModel): string {
  const value = model.baseUrl?.trim();
  if (!value) {
    throw new Error(
      `Model ${model.id} is openai-compatible but has no baseUrl configured.`,
    );
  }
  return value.replace(/\/+$/, "");
}

function apiKey(model: ConfiguredModel): string {
  return apiKeyForConfiguredModel(model) || "not-needed";
}

function apiModel(model: ConfiguredModel): string {
  return model.apiModel?.trim() || model.modelName?.trim() || model.id;
}

export async function completeOpenAICompatibleText(params: {
  model: ConfiguredModel;
  systemPrompt?: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const response = await fetch(`${baseUrl(params.model)}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(120_000),
    headers: {
      Authorization: `Bearer ${apiKey(params.model)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: apiModel(params.model),
      messages: [
        ...(params.systemPrompt
          ? [{ role: "system", content: params.systemPrompt }]
          : []),
        { role: "user", content: params.user },
      ],
      max_tokens: params.maxTokens ?? 512,
      stream: false,
    }),
  });

  const text = await response.text();
  let json: ChatCompletionResponse = {};
  try {
    json = text ? (JSON.parse(text) as ChatCompletionResponse) : {};
  } catch {
    json = {};
  }

  if (!response.ok) {
    const detail = json.error?.message || text || response.statusText;
    throw new Error(
      `OpenAI-compatible request failed (${response.status}): ${detail}`,
    );
  }

  return json.choices?.[0]?.message?.content ?? "";
}

function extractSseJson(buffer: string): { events: unknown[]; rest: string } {
  const events: unknown[] = [];
  const chunks = buffer.split(/\n\n/);
  const rest = chunks.pop() ?? "";

  for (const chunk of chunks) {
    const dataLines = chunk
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());

    for (const data of dataLines) {
      if (!data || data === "[DONE]") continue;
      try {
        events.push(JSON.parse(data));
      } catch {
        // Incomplete events stay buffered until the next read.
      }
    }
  }

  return { events, rest };
}

function abortError(): Error {
  const err = new Error("Stream aborted.");
  err.name = "AbortError";
  return err;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

function toChatMessages(
  systemPrompt: string,
  messages: LlmMessage[],
): ChatMessage[] {
  return [
    { role: "system", content: systemPrompt },
    ...messages.map(
      (message): ChatMessage => ({
        role: message.role,
        content: message.content,
      }),
    ),
  ];
}

function configuredModelOrThrow(id: string): ConfiguredModel {
  const configured = getConfiguredModel(id);
  if (!configured) throw new Error(`Unknown configured model: ${id}`);
  return configured;
}

export async function streamOpenAICompatible(
  params: StreamChatParams,
): Promise<StreamChatResult> {
  const {
    systemPrompt,
    tools = [],
    callbacks = {},
    runTools,
  } = params;
  const configured = configuredModelOrThrow(params.model);
  const url = `${baseUrl(configured)}/chat/completions`;
  const key = apiKey(configured);
  const modelName = apiModel(configured);
  const maxIter = params.maxIterations ?? 10;
  let messages = toChatMessages(systemPrompt, params.messages);
  let fullText = "";
  let needsCourtlistenerCitationReminder = false;

  for (let iter = 0; iter < maxIter; iter++) {
    throwIfAborted(params.abortSignal);
    if (needsCourtlistenerCitationReminder) {
      messages = [
        {
          role: "system",
          content: `${systemPrompt}\n\n${COURTLISTENER_CITATION_REMINDER}`,
        },
        ...messages.slice(1),
      ];
      needsCourtlistenerCitationReminder = false;
    }

    const response = await fetch(url, {
      method: "POST",
      signal: params.abortSignal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelName,
        messages,
        tools: tools.length ? tools : undefined,
        stream: true,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let detail = text || response.statusText;
      try {
        const json = JSON.parse(text) as ChatCompletionResponse;
        detail = json.error?.message || detail;
      } catch {
        // keep raw text
      }
      const err = new Error(
        `OpenAI-compatible request failed (${response.status}): ${detail}`,
      );
      (err as { status?: number }).status = response.status;
      throw err;
    }
    if (!response.body) throw new Error("OpenAI-compatible response had no body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let iterationText = "";
    let sawReasoning = false;
    const pendingToolCalls = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();

    while (true) {
      throwIfAborted(params.abortSignal);
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const extracted = extractSseJson(buffer);
      buffer = extracted.rest;

      for (const event of extracted.events as StreamChunk[]) {
        if (event.error?.message) {
          throw new Error(
            `OpenAI-compatible stream failed: ${event.error.message}`,
          );
        }
        const delta = event.choices?.[0]?.delta;
        if (!delta) continue;

        if (typeof delta.reasoning_content === "string" && delta.reasoning_content) {
          sawReasoning = true;
          callbacks.onReasoningDelta?.(delta.reasoning_content);
        }

        if (typeof delta.content === "string" && delta.content) {
          iterationText += delta.content;
          callbacks.onContentDelta?.(delta.content);
        }

        for (const toolCall of delta.tool_calls ?? []) {
          const existing = pendingToolCalls.get(toolCall.index) ?? {
            id: "",
            name: "",
            arguments: "",
          };
          if (toolCall.id) existing.id = toolCall.id;
          if (toolCall.function?.name) existing.name += toolCall.function.name;
          if (toolCall.function?.arguments)
            existing.arguments += toolCall.function.arguments;
          pendingToolCalls.set(toolCall.index, existing);
        }
      }
    }

    if (sawReasoning) callbacks.onReasoningBlockEnd?.();
    fullText += iterationText;
    throwIfAborted(params.abortSignal);

    const toolCalls: NormalizedToolCall[] = [...pendingToolCalls.values()].map(
      (call, index) => {
        let input: Record<string, unknown> = {};
        try {
          const parsed = JSON.parse(call.arguments || "{}");
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            input = parsed as Record<string, unknown>;
          }
        } catch {
          input = {};
        }
        return {
          id: call.id || `call_${iter}_${index}`,
          name: call.name,
          input,
        };
      },
    );

    if (!toolCalls.length || !runTools) break;

    for (const call of toolCalls) {
      callbacks.onToolCallStart?.(call);
    }
    if (
      toolCalls.some((call) =>
        COURTLISTENER_CITATION_REMINDER_TOOL_NAMES.has(call.name),
      )
    ) {
      needsCourtlistenerCitationReminder = true;
    }

    const results = await runTools(toolCalls);
    throwIfAborted(params.abortSignal);

    messages = [
      ...messages,
      {
        role: "assistant",
        content: iterationText || null,
        tool_calls: toolCalls.map((call) => ({
          id: call.id,
          type: "function" as const,
          function: {
            name: call.name,
            arguments: JSON.stringify(call.input),
          },
        })),
      },
      ...results.map(
        (result): ChatMessage => ({
          role: "tool",
          tool_call_id: result.tool_use_id,
          content: result.content,
        }),
      ),
    ];
  }

  return { fullText };
}

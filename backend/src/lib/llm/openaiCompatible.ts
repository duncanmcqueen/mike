import type { ConfiguredModel } from "./types";
import { apiKeyForConfiguredModel } from "./registry";

type ChatCompletionResponse = {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
};

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

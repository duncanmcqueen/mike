import { streamClaude, completeClaudeText } from "./claude";
import { streamGemini, completeGeminiText } from "./gemini";
import { streamOpenAI, completeOpenAIText } from "./openai";
import { providerForModel } from "./models";
import { completeOpenAICompatibleText, streamOpenAICompatible } from "./openaiCompatible";
import { completeCommitteeText, isCommitteeId, streamCommitteeChat } from "./committee";
import { getConfiguredModel } from "./registry";
import type { StreamChatParams, StreamChatResult, UserApiKeys } from "./types";

export * from "./types";
export * from "./models";

export async function streamChatWithTools(
    params: StreamChatParams,
): Promise<StreamChatResult> {
    if (isCommitteeId(params.model)) return streamCommitteeChat(params);
    const provider = providerForModel(params.model);
    if (provider === "claude") return streamClaude(params);
    if (provider === "openai") return streamOpenAI(params);
    if (provider === "openai-compatible") return streamOpenAICompatible(params);
    return streamGemini(params);
}

export async function completeText(params: {
    model: string;
    systemPrompt?: string;
    user: string;
    maxTokens?: number;
    apiKeys?: UserApiKeys;
    committeeStack?: string[];
}): Promise<string> {
    if (isCommitteeId(params.model)) return completeCommitteeText(params);
    const provider = providerForModel(params.model);
    if (provider === "claude") return completeClaudeText(params);
    if (provider === "openai") return completeOpenAIText(params);
    if (provider === "openai-compatible") {
        const configured = getConfiguredModel(params.model);
        if (!configured) throw new Error(`Unknown configured model: ${params.model}`);
        return completeOpenAICompatibleText({
            model: configured,
            systemPrompt: params.systemPrompt,
            user: params.user,
            maxTokens: params.maxTokens,
        });
    }
    return completeGeminiText(params);
}

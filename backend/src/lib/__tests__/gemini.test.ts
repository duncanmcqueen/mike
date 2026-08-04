import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateContentStream } = vi.hoisted(() => ({
  generateContentStream: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContentStream };
  },
}));

import { streamGemini } from "../llm/gemini";

const searchTool = {
  type: "function" as const,
  function: {
    name: "specialized_search",
    description: "Search a specialized source.",
    parameters: { type: "object", properties: {} },
  },
};

function chunks(...parts: Record<string, unknown>[]) {
  return (async function* () {
    for (const part of parts) {
      yield { candidates: [{ content: { parts: [part] } }] };
    }
  })();
}

describe("streamGemini", () => {
  beforeEach(() => {
    generateContentStream.mockReset();
  });

  it("reserves a tool-free final answer after exhausting tool rounds", async () => {
    generateContentStream.mockImplementation(
      ({ config }: { config: { tools?: unknown } }) =>
        config.tools
          ? chunks({
              functionCall: {
                name: "specialized_search",
                args: { query: "latest news" },
              },
            })
          : chunks({
              text: "I could not verify current news because no general news source is connected.",
            }),
    );
    const runTools = vi.fn().mockResolvedValue([
      { tool_use_id: "specialized_search-0", content: "No relevant results." },
    ]);
    const onContentDelta = vi.fn();

    const result = await streamGemini({
      model: "gemini-test",
      systemPrompt: "Answer accurately.",
      messages: [{ role: "user", content: "What happened yesterday?" }],
      tools: [searchTool],
      maxIterations: 2,
      apiKeys: { gemini: "test-key" },
      callbacks: { onContentDelta },
      runTools,
    });

    expect(generateContentStream).toHaveBeenCalledTimes(3);
    expect(generateContentStream.mock.calls[0][0].config.tools).toBeDefined();
    expect(generateContentStream.mock.calls[1][0].config.tools).toBeDefined();
    expect(generateContentStream.mock.calls[2][0].config.tools).toBeUndefined();
    expect(
      generateContentStream.mock.calls[2][0].config.systemInstruction,
    ).toContain("FINAL RESPONSE REQUIRED");
    expect(runTools).toHaveBeenCalledTimes(2);
    expect(result.fullText).toBe(
      "I could not verify current news because no general news source is connected.",
    );
    expect(onContentDelta).toHaveBeenCalledWith(result.fullText);
  });

  it("does not add a synthesis request when Gemini answers normally", async () => {
    generateContentStream.mockReturnValue(chunks({ text: "A direct answer." }));

    const result = await streamGemini({
      model: "gemini-test",
      systemPrompt: "Answer accurately.",
      messages: [{ role: "user", content: "A stable question" }],
      tools: [searchTool],
      maxIterations: 2,
      apiKeys: { gemini: "test-key" },
      runTools: vi.fn(),
    });

    expect(generateContentStream).toHaveBeenCalledTimes(1);
    expect(result.fullText).toBe("A direct answer.");
  });

  it("reports an error instead of completing with reasoning only", async () => {
    generateContentStream.mockReturnValue(
      chunks({ text: "Checking the available sources.", thought: true }),
    );

    await expect(
      streamGemini({
        model: "gemini-test",
        systemPrompt: "Answer accurately.",
        messages: [{ role: "user", content: "What happened yesterday?" }],
        maxIterations: 2,
        enableThinking: true,
        apiKeys: { gemini: "test-key" },
      }),
    ).rejects.toThrow(/without a final answer/i);
  });
});

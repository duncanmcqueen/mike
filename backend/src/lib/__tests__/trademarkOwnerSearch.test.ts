import { describe, expect, it, vi } from "vitest";
import {
  exactOwnerCandidateArgs,
  exactOwnerSearchResponse,
  exactTrademarkOwnerNames,
  executeExactTrademarkOwnerBatchSearch,
  executeExactTrademarkOwnerSearch,
  managedTrademarkToolSchema,
  normalizeTrademarkOwnerName,
  parseTrademarkToolResult,
  trademarkRecordMatchesExactOwner,
  trademarkRecordOwnerNames,
} from "../mcp/trademarkOwnerSearch";

describe("exact trademark owner search", () => {
  const toolResult = (envelope: Record<string, unknown>) => ({
    content: [{ type: "text", text: JSON.stringify(envelope) }],
  });

  it("normalizes harmless owner-name punctuation without dropping entity suffixes", () => {
    expect(normalizeTrademarkOwnerName("Agent Pipeline, LLC")).toBe(
      "AGENT PIPELINE LLC",
    );
    expect(normalizeTrademarkOwnerName("Smith & Jones, L.L.C.")).toBe(
      "SMITH AND JONES LLC",
    );
    expect(normalizeTrademarkOwnerName("Smith & Jones, L.L.C.")).toBe(
      normalizeTrademarkOwnerName("Smith and Jones LLC"),
    );
    expect(normalizeTrademarkOwnerName("Agent Pipeline, LLC")).not.toBe(
      normalizeTrademarkOwnerName("Agent Pipeline, Inc."),
    );
  });

  it("uses ownerName instead of address-bearing ownerFullText when available", () => {
    const record = {
      ownerName: [
        "Agent Pipeline, LLC (LIMITED LIABILITY COMPANY; DELAWARE, USA)",
      ],
      ownerFullText: "Agent Pipeline, LLC 100 Pipeline Road Dallas Texas 75001",
    };

    expect(trademarkRecordOwnerNames(record)).toEqual(["Agent Pipeline, LLC"]);
    expect(trademarkRecordMatchesExactOwner(record, "AGENT PIPELINE LLC")).toBe(
      true,
    );
  });

  it("rejects broad keyword hits from marks, addresses, and other owners", () => {
    const records = [
      {
        id: "1",
        wordmark: "AGENT FORCE",
        ownerName: ["Unrelated Holdings LLC"],
      },
      {
        id: "2",
        wordmark: "PIPELINE",
        ownerName: ["Agent Pipeline, LLC"],
      },
      {
        id: "3",
        wordmark: "ANOTHER MARK",
        ownerName: ["Pipeline Agent Corporation"],
      },
    ];

    const response = exactOwnerSearchResponse({
      ownerName: "Agent Pipeline, LLC",
      records,
      requestedOffset: 0,
      requestedLimit: 25,
      candidatesExamined: records.length,
      upstreamTotal: 3_847,
      exhaustive: true,
      usedPhraseQuery: true,
    });

    expect(response).toMatchObject({
      count: 1,
      total: 1,
      has_more: false,
      results: [records[1]],
      metadata: {
        match_mode: "exact_normalized_current_owner",
        upstream_candidate_total: 3_847,
      },
    });
  });

  it("builds an owner-field phrase query and removes a broad user query", () => {
    expect(
      exactOwnerCandidateArgs(
        { query: "AGENT PIPELINE", status_filter: "live", limit: 25 },
        'Agent "Pipeline", LLC',
        100,
      ),
    ).toEqual({
      query: 'ownerFullText:"Agent \\"Pipeline\\", LLC"',
      owner_name: 'Agent "Pipeline", LLC',
      status_filter: "live",
      offset: 100,
      limit: 100,
    });
  });

  it("parses the nested FastMCP text response", () => {
    const envelope = {
      success: true,
      results: [{ id: "123", ownerName: ["Exact Owner LLC"] }],
      total: 2,
      offset: 0,
      has_more: true,
    };
    expect(
      parseTrademarkToolResult({
        content: [{ type: "text", text: JSON.stringify(envelope) }],
      }),
    ).toMatchObject({
      results: envelope.results,
      total: 2,
      offset: 0,
      hasMore: true,
      error: false,
    });
  });

  it("parses upstream status codes for retry decisions", () => {
    expect(
      parseTrademarkToolResult(
        toolResult({
          error: true,
          message: "Too many requests",
          status_code: 429,
          error_code: "RATE_LIMITED",
        }),
      ),
    ).toMatchObject({
      error: true,
      statusCode: 429,
      errorCode: "RATE_LIMITED",
    });
  });

  it("teaches models to use owner_name for exact portfolios", () => {
    const schema = managedTrademarkToolSchema({
      type: "object",
      properties: {
        query: { type: ["string", "null"] },
        owner_name: { type: ["string", "null"] },
      },
    });
    expect(schema).toMatchObject({
      properties: {
        owner_name: {
          description: expect.stringContaining("normalized exact ownerName"),
        },
        owner_names: {
          maxItems: 10,
          description: expect.stringContaining("one tool call"),
        },
      },
    });
  });

  it("normalizes and deduplicates bulk owner names", () => {
    expect(
      exactTrademarkOwnerNames([
        "Agent Pipeline, LLC",
        " agent pipeline llc ",
        "Family First Life, LLC",
        null,
      ]),
    ).toEqual(["Agent Pipeline, LLC", "Family First Life, LLC"]);
  });

  it("runs a bulk portfolio search and returns one result per owner", async () => {
    const callTool = vi
      .fn<(args: Record<string, unknown>) => Promise<unknown>>()
      .mockImplementation(async (args) => {
        const owner = String(args.owner_name);
        return toolResult({
          success: true,
          results: [{ id: owner, ownerName: [owner] }],
          total: 1,
          offset: 0,
          has_more: false,
        });
      });

    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = (await executeExactTrademarkOwnerBatchSearch(
      callTool,
      { owner_names: ["Owner One LLC", "Owner Two LLC"] },
      ["Owner One LLC", "Owner Two LLC"],
      { sleep },
    )) as Record<string, unknown>;

    expect(callTool).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2_500);
    expect(callTool.mock.calls[0][0]).not.toHaveProperty("owner_names");
    expect(result.structuredContent).toMatchObject({
      success: true,
      owner_count: 2,
      failed_owner_count: 0,
      failed_owner_names: [],
      count: 2,
      portfolios: [
        { count: 1, metadata: { owner_name: "Owner One LLC" } },
        { count: 1, metadata: { owner_name: "Owner Two LLC" } },
      ],
    });
  });

  it("backs off and retries HTTP 429 without changing query modes", async () => {
    const rateLimited = toolResult({
      error: true,
      message: "TMSEARCH backend rate-limited (HTTP 429)",
      status_code: 429,
      error_code: "RATE_LIMITED",
    });
    const callTool = vi
      .fn<(args: Record<string, unknown>) => Promise<unknown>>()
      .mockResolvedValueOnce(rateLimited)
      .mockResolvedValueOnce(rateLimited)
      .mockResolvedValueOnce(
        toolResult({
          success: true,
          results: [{ id: "1", ownerName: ["EQUIS FINANCIAL LLC"] }],
          total: 1,
          offset: 0,
          has_more: false,
        }),
      );
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = (await executeExactTrademarkOwnerSearch(
      callTool,
      { owner_name: "EQUIS FINANCIAL LLC" },
      "EQUIS FINANCIAL LLC",
      { sleep },
    )) as Record<string, unknown>;

    expect(callTool).toHaveBeenCalledTimes(3);
    expect(callTool.mock.calls.map(([args]) => args.query)).toEqual([
      'ownerFullText:"EQUIS FINANCIAL LLC"',
      'ownerFullText:"EQUIS FINANCIAL LLC"',
      'ownerFullText:"EQUIS FINANCIAL LLC"',
    ]);
    expect(sleep.mock.calls).toEqual([[10_000], [20_000]]);
    expect(result.structuredContent).toMatchObject({
      success: true,
      count: 1,
    });
  });

  it("returns resumable failed owners after exhausting rate-limit retries", async () => {
    const callTool = vi
      .fn<(args: Record<string, unknown>) => Promise<unknown>>()
      .mockResolvedValue(
        toolResult({
          error: true,
          message: "HTTP 429 Too Many Requests",
          status_code: 429,
        }),
      );
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = (await executeExactTrademarkOwnerBatchSearch(
      callTool,
      { owner_names: ["Owner One LLC", "Owner Two LLC"] },
      ["Owner One LLC", "Owner Two LLC"],
      { sleep },
    )) as Record<string, unknown>;

    expect(callTool).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls).toEqual([[10_000], [20_000], [30_000]]);
    expect(result.structuredContent).toMatchObject({
      success: false,
      failed_owner_count: 2,
      failed_owner_names: ["Owner One LLC", "Owner Two LLC"],
      portfolios: [
        {
          success: false,
          status_code: 429,
          metadata: {
            rate_limit_retries: 3,
            retryable: true,
            retry_after_seconds: 60,
          },
        },
        {
          success: false,
          owner_name: "Owner Two LLC",
          deferred: true,
          status_code: 429,
        },
      ],
      metadata: {
        retry_guidance: expect.stringContaining("failed_owner_names"),
        retry_after_seconds: 60,
      },
    });
  });

  it("pages owner-field candidates and excludes unrelated records", async () => {
    const callTool = vi
      .fn<(args: Record<string, unknown>) => Promise<unknown>>()
      .mockResolvedValueOnce(
        toolResult({
          success: true,
          results: [
            { id: "1", ownerName: ["Agent Pipeline, LLC"] },
            { id: "2", ownerName: ["Pipeline Agent Corporation"] },
          ],
          total: 3,
          offset: 0,
          has_more: true,
        }),
      )
      .mockResolvedValueOnce(
        toolResult({
          success: true,
          results: [{ id: "3", ownerName: ["Agent Pipeline LLC"] }],
          total: 3,
          offset: 2,
          has_more: false,
        }),
      );

    const result = (await executeExactTrademarkOwnerSearch(
      callTool,
      { owner_name: "Agent Pipeline, LLC", limit: 25 },
      "Agent Pipeline, LLC",
    )) as Record<string, unknown>;

    expect(callTool).toHaveBeenCalledTimes(2);
    expect(callTool.mock.calls[0][0]).toMatchObject({
      query: 'ownerFullText:"Agent Pipeline, LLC"',
      owner_name: "Agent Pipeline, LLC",
      offset: 0,
      limit: 100,
    });
    expect(callTool.mock.calls[1][0]).toMatchObject({ offset: 2 });
    expect(result.structuredContent).toMatchObject({
      count: 2,
      total: 2,
      has_more: false,
      results: [{ id: "1" }, { id: "3" }],
      metadata: { exhaustive: true, owner_phrase_query_supported: true },
    });
  });

  it("falls back after a rejected field query but still filters exactly", async () => {
    const rejected = toolResult({
      error: true,
      message: "HTTP 400",
      results: [],
      total: 0,
    });
    const callTool = vi
      .fn<(args: Record<string, unknown>) => Promise<unknown>>()
      .mockResolvedValueOnce(rejected)
      .mockResolvedValueOnce(
        toolResult({
          success: true,
          results: [
            { id: "1", ownerName: ["Family First Life, LLC"] },
            { id: "2", ownerName: ["Another Family LLC"] },
          ],
          total: 2,
          offset: 0,
          has_more: false,
        }),
      );

    const result = (await executeExactTrademarkOwnerSearch(
      callTool,
      { query: "FAMILY FIRST LIFE", owner_name: "Family First Life, LLC" },
      "Family First Life, LLC",
    )) as Record<string, unknown>;

    expect(callTool).toHaveBeenCalledTimes(2);
    expect(callTool.mock.calls[1][0]).not.toHaveProperty("query");
    expect(callTool.mock.calls[1][0]).toMatchObject({
      owner_name: "Family First Life, LLC",
    });
    expect(result.structuredContent).toMatchObject({
      count: 1,
      results: [{ id: "1" }],
      metadata: { owner_phrase_query_supported: false },
    });
  });
});

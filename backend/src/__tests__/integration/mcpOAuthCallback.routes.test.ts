import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../app";

describe("GET /user/mcp-connectors/oauth/callback", () => {
  it("escapes attacker-controlled error text so it cannot break out of the script block", async () => {
    const response = await request(app)
      .get("/user/mcp-connectors/oauth/callback")
      .query({
        error: '</script><meta http-equiv="refresh" content="0;url=https://evil.example">',
        state: "state-token",
        code: "code",
      })
      .expect(400);

    expect(response.headers["content-type"]).toContain("text/html");
    // The payload must be JSON-escaped (<), never raw markup.
    expect(response.text).not.toContain("</script><meta");
    expect(response.text).toContain("\\u003c");
    expect(response.headers["content-security-policy"]).toContain(
      "script-src 'nonce-",
    );
  });

  it("returns the failure popup when state or code are missing", async () => {
    const response = await request(app)
      .get("/user/mcp-connectors/oauth/callback")
      .expect(400);
    expect(response.text).toContain("Authorization failed");
  });
});

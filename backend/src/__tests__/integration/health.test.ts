import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../app";

describe("GET /health", () => {
    it("returns 200 with { ok: true }", async () => {
        const res = await request(app).get("/health");
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true });
    });
});

describe("requireAuth middleware", () => {
    it("rejects requests with no Authorization header (401)", async () => {
        const res = await request(app).get("/chat");
        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty("detail");
    });

    it("rejects requests with a non-Bearer Authorization header (401)", async () => {
        const res = await request(app)
            .get("/chat")
            .set("Authorization", "Basic dXNlcjpwYXNz");
        expect(res.status).toBe(401);
    });

    it("rejects requests with an invalid Bearer token (401)", async () => {
        // The mocked createClient().auth.getUser returns { user: null } for
        // any token — simulating an expired/invalid token.
        const res = await request(app)
            .get("/chat")
            .set("Authorization", "Bearer invalid-token");
        expect(res.status).toBe(401);
        expect(res.body.detail).toMatch(/invalid|expired/i);
    });
});

describe("404 handling", () => {
    it("returns 404 for unknown routes", async () => {
        const res = await request(app).get("/this-route-does-not-exist");
        expect(res.status).toBe(404);
    });
});

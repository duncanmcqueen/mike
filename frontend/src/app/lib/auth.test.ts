import { describe, expect, it } from "vitest";
import { resolveBrowserAuthProvider } from "./auth";

describe("browser auth provider selection", () => {
    it("uses Supabase when the upstream browser credentials are configured", () => {
        expect(
            resolveBrowserAuthProvider({
                NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
                NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: "publishable-key",
            }),
        ).toBe("supabase");
    });

    it("keeps pre-provider local installations working", () => {
        expect(resolveBrowserAuthProvider({})).toBe("local");
    });

    it("honors an explicit provider", () => {
        expect(
            resolveBrowserAuthProvider({
                NEXT_PUBLIC_MIKE_AUTH_PROVIDER: "supabase",
            }),
        ).toBe("supabase");
        expect(
            resolveBrowserAuthProvider({
                NEXT_PUBLIC_MIKE_AUTH_PROVIDER: "LOCAL",
            }),
        ).toBe("local");
    });

    it("rejects an invalid provider", () => {
        expect(() =>
            resolveBrowserAuthProvider({
                NEXT_PUBLIC_MIKE_AUTH_PROVIDER: "firebase",
            }),
        ).toThrow('Unsupported NEXT_PUBLIC_MIKE_AUTH_PROVIDER "firebase"');
    });
});

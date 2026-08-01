import type { NextConfig } from "next";

// The Supabase public values are only baked into the bundle when the
// Supabase auth provider is in use; the local provider needs just the API
// base URL.
const isLocalAuthProvider =
    process.env.NEXT_PUBLIC_MIKE_AUTH_PROVIDER?.trim().toLowerCase() ===
    "local";
const REQUIRED_PUBLIC_BUILD_ENV = isLocalAuthProvider
    ? ["NEXT_PUBLIC_API_BASE_URL"]
    : [
          "NEXT_PUBLIC_SUPABASE_URL",
          "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY",
          "NEXT_PUBLIC_API_BASE_URL",
      ];

if (process.env.NODE_ENV === "production") {
    const missing = REQUIRED_PUBLIC_BUILD_ENV.filter(
        (key) => !process.env[key]?.trim(),
    );
    if (missing.length > 0) {
        throw new Error(
            `Missing required frontend build-time environment variables: ${missing.join(", ")}.` +
                (isLocalAuthProvider
                    ? ""
                    : " Local-profile builds should set NEXT_PUBLIC_MIKE_AUTH_PROVIDER=local, which drops the Supabase requirements."),
        );
    }
}

const nextConfig: NextConfig = {
    /* config options here */
    reactCompiler: true,
    experimental: {
        webpackBuildWorker: false,
    },
    turbopack: {
        root: __dirname,
    },
    async rewrites() {
        return [
            {
                source: "/sitemap.xml",
                destination: "/api/sitemap/sitemap.xml",
            },
            {
                source: "/sitemap_:slug.xml",
                destination: "/api/sitemap/sitemap_:slug.xml",
            },
        ];
    },
    skipTrailingSlashRedirect: true,
};

export default nextConfig;

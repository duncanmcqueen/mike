import {
    DEFAULT_MAIN_MODEL,
    DEFAULT_TABULAR_MODEL,
    DEFAULT_TITLE_MODEL,
} from "./llm";

/**
 * Whether Sign-in-with-Google is enabled for this deployment.
 *
 * Detected from the Supabase external-provider environment variables. On
 * locally provisioned Supabase projects these are set by the CLI config;
 * hosted-dashboards-only deployments that enable Google sign-in should set
 * both explicitly so the deployment keeps its historical defaults.
 */
export function isGoogleOauthEnabled(): boolean {
    return (
        !!process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID?.trim() &&
        !!process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET?.trim()
    );
}

type ModelTier = "main" | "title" | "tabular";

/**
 * The hardcoded per-tier Gemini default, retained ONLY for deployments where
 * Google sign-in is enabled (Google OAuth pairs naturally with a Google
 * default). Everywhere else callers must resolve from providers the user can
 * actually use — a silent default runs the risk of attributing a reply to,
 * and billing, a provider the user never chose. Returns null when there is
 * no such legacy default and callers fail loudly / pick from usable keys.
 */
export function legacyDefaultModel(tier: ModelTier): string | null {
    if (!isGoogleOauthEnabled()) return null;
    switch (tier) {
        case "main":
            return DEFAULT_MAIN_MODEL;
        case "title":
            return DEFAULT_TITLE_MODEL;
        case "tabular":
            return DEFAULT_TABULAR_MODEL;
    }
}

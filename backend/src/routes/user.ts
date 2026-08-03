// @ts-nocheck
import crypto from "crypto";
import { Router } from "express";
import {
    localAuthOnly,
    requireAuth,
    requireMfaIfEnrolled,
} from "../middleware/auth";
import {
    createLocalUser,
    createSession,
    deleteSession,
    findLocalUserByEmail,
    findLocalUserById,
    findSession,
    markSessionMfaVerified,
    updateLocalUserEmail,
    verifyPassword,
} from "../lib/sqlite";
import {
    createServerDatabase,
    type ServerDatabase,
} from "../lib/database";
import {
    createMfaChallenge,
    createMfaFactor,
    hasVerifiedTotpFactor,
    listMfaFactors,
    unenrollMfaFactor,
    verifyMfaFactorCode,
} from "../lib/mfa";
import {
    DEFAULT_TABULAR_MODEL,
    DEFAULT_TITLE_MODEL,
    CLAUDE_LOW_MODELS,
    OPENAI_LOW_MODELS,
    resolveModel,
} from "../lib/llm";
import { configuredModelSummaries } from "../lib/llm/registry";
import {
    type ApiKeyStatus,
    getUserApiKeyStatus,
    hasEnvApiKey,
    normalizeApiKeyProvider,
    saveUserApiKey,
} from "../lib/userApiKeys";
import {
    completeUserMcpConnectorOAuth,
    createUserMcpConnector,
    deleteUserMcpConnector,
    getUserMcpConnector,
    listUserMcpConnectors,
    provisionPatentMcpConnector,
    McpOAuthRequiredError,
    refreshUserMcpConnectorTools,
    setUserMcpToolEnabled,
    startUserMcpConnectorOAuth,
    updateUserMcpConnector,
} from "../lib/mcpConnectors";
import {
    deleteAllUserChats,
    deleteAllUserTabularReviews,
    deleteUserAccountData,
    deleteUserProjects,
} from "../lib/userDataCleanup";
import {
    buildUserAccountExport,
    buildUserChatsExport,
    buildUserTabularReviewsExport,
    userExportFilename,
} from "../lib/userDataExport";
import { findProfileUserByEmail } from "../lib/userLookup";
import {
    getUserFeatures,
    normalizeUserFeatures,
    requireUserFeature,
    USER_FEATURE_KEYS,
    type UserFeatures,
} from "../lib/userFeatures";
import { resolveDeploymentModules } from "../lib/deploymentModules";
import { sendServerError } from "../lib/safeError";

export const userRouter = Router();

const MONTHLY_CREDIT_LIMIT = 999999;

function publicUser(user: { id: string; email?: string | null }) {
    return { id: user.id, email: user.email ?? "", pendingEmail: null };
}

function bearerToken(req: { headers: { authorization?: string } }) {
    const auth = req.headers.authorization ?? "";
    return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: string): boolean {
    return email.length <= 254 && EMAIL_PATTERN.test(email);
}

userRouter.post("/auth/signup", localAuthOnly, async (req, res) => {
    const email =
        typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const password =
        typeof req.body?.password === "string" ? req.body.password : "";
    if (!isValidEmail(email) || password.length < 6) {
        return void res
            .status(400)
            .json({ detail: "A valid email and a 6+ character password are required" });
    }
    if (findLocalUserByEmail(email)) {
        return void res.status(409).json({ detail: "Email is already registered" });
    }
    const user = createLocalUser(email, password);
    const token = createSession(user.id);
    res.json({ token, user: publicUser(user) });
});

function profileMfaOnLogin(userId: string): boolean {
    const db = createServerDatabase();
    return db
        .from("user_profiles")
        .select("mfa_on_login")
        .eq("user_id", userId)
        .maybeSingle()
        .then(({ data }) => {
            const value = (data as { mfa_on_login?: unknown } | null)
                ?.mfa_on_login;
            return value === true || value === 1 || value === "1";
        })
        .catch(() => false);
}

userRouter.post("/auth/login", localAuthOnly, async (req, res) => {
    const email =
        typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const password =
        typeof req.body?.password === "string" ? req.body.password : "";
    const row = findLocalUserByEmail(email) as
        | {
              id: string;
              email: string;
              password_hash: string;
              password_salt: string;
          }
        | null;
    if (!row || !verifyPassword(password, row.password_hash, row.password_salt)) {
        return void res.status(401).json({ detail: "Invalid email or password" });
    }
    const mfaRequired =
        hasVerifiedTotpFactor(row.id) && (await profileMfaOnLogin(row.id));
    const token = createSession(row.id, !mfaRequired);
    res.json({ token, user: publicUser(row), mfaRequired });
});

userRouter.get("/auth/session", localAuthOnly, async (req, res) => {
    const session = findSession(bearerToken(req));
    if (!session) return void res.json({ user: null });
    const user = findLocalUserById(session.userId) as
        | { id: string; email?: string }
        | null;
    res.json({ user: user ? publicUser(user) : null });
});

userRouter.post("/auth/logout", localAuthOnly, async (req, res) => {
    const token = bearerToken(req);
    if (token) deleteSession(token);
    res.status(204).send();
});

userRouter.patch("/auth/email", localAuthOnly, requireAuth, async (req, res) => {
    const email =
        typeof req.body?.email === "string" ? req.body.email.trim() : "";
    if (!isValidEmail(email)) {
        return void res.status(400).json({ detail: "A valid email is required" });
    }
    const userId = res.locals.userId as string;
    const existing = findLocalUserByEmail(email) as { id: string } | null;
    if (existing && existing.id !== userId) {
        return void res.status(409).json({ detail: "Email is already registered" });
    }
    const user = updateLocalUserEmail(userId, email);
    res.json({ user: publicUser(user) });
});

const SUPPORT_FEEDBACK_TYPES = new Set(["bug", "feature", "question", "other"]);

userRouter.post("/support", requireAuth, async (req, res) => {
    const type = typeof req.body?.type === "string" ? req.body.type : "";
    const subject = typeof req.body?.subject === "string" ? req.body.subject.trim() : "";
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    const link = typeof req.body?.link === "string" ? req.body.link.trim() : "";
    if (!SUPPORT_FEEDBACK_TYPES.has(type) || !subject || !message) {
        return void res
            .status(400)
            .json({ detail: "type, subject, and message are required" });
    }
    const userId = res.locals.userId as string;
    const userEmail = (res.locals.userEmail as string) ?? "";
    const db = createServerDatabase();
    const { error } = await db.from("support_feedback").insert({
        id: crypto.randomUUID(),
        user_id: userId,
        email: userEmail,
        type,
        subject: subject.slice(0, 200),
        message: message.slice(0, 10000),
        link: link.slice(0, 2000) || null,
    });
    if (error) {
        return void res.status(500).json({ detail: "Failed to submit feedback" });
    }

    const inbox = process.env.SUPPORT_INBOX_EMAIL;
    const resendKey = process.env.RESEND_API_KEY;
    if (inbox && resendKey) {
        void (async () => {
            try {
                const { Resend } = await import("resend");
                const resend = new Resend(resendKey);
                await resend.emails.send({
                    from: process.env.SUPPORT_FROM_EMAIL ?? "Mike Support <onboarding@resend.dev>",
                    to: inbox,
                    subject: `[Mike ${type}] ${subject.slice(0, 200)}`,
                    text: `From: ${userEmail} (${userId})\nType: ${type}\nLink: ${link || "-"}\n\n${message}`,
                });
            } catch (err) {
                console.error("[user/support] email delivery failed", {
                    userId,
                    error: errorMessage(err),
                });
            }
        })();
    }
    res.status(204).send();
});

type UserProfileRow = {
    display_name: string | null;
    organisation: string | null;
    message_credits_used: number;
    credits_reset_date: string;
    tier: string;
    title_model: string | null;
    tabular_model: string;
    mfa_on_login: boolean | null;
    legal_research_us: boolean | null;
    email_integration_enabled: boolean | null;
    dark_mode: boolean | null;
    feature_flags?: unknown;
};

// GET /user/mfa/status — factors plus authenticator assurance levels.
userRouter.get("/mfa/status", localAuthOnly, requireAuth, async (_req, res) => {
    const userId = res.locals.userId as string;
    const factors = listMfaFactors(userId).map((factor) => ({
        id: factor.id,
        friendly_name: factor.friendly_name,
        factor_type: "totp",
        status: factor.status,
        created_at: factor.created_at,
        updated_at: factor.updated_at,
    }));
    const hasVerified = factors.some((factor) => factor.status === "verified");
    const mfaVerified = res.locals.mfaVerified !== false;
    res.json({
        factors,
        currentLevel: mfaVerified ? (hasVerified ? "aal2" : "aal1") : "aal1",
        nextLevel: hasVerified ? "aal2" : "aal1",
    });
});

// POST /user/mfa/enroll — create a pending TOTP factor.
userRouter.post("/mfa/enroll", localAuthOnly, requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = (res.locals.userEmail as string) ?? "";
    const friendlyName =
        typeof req.body?.friendlyName === "string" && req.body.friendlyName.trim()
            ? req.body.friendlyName.trim().slice(0, 100)
            : "Mike";
    try {
        const result = await createMfaFactor(userId, userEmail, friendlyName);
        if ("error" in result && result.error) {
            return void res.status(400).json({ detail: result.error });
        }
        res.json({
            id: result.id,
            totp: { qr_code: result.qrCode, secret: result.secret, uri: result.uri },
        });
    } catch (err) {
        sendServerError(res, err);
    }
});

// POST /user/mfa/challenge — TOTP challenges are stateless; the client must
// present the returned challenge id when verifying.
userRouter.post("/mfa/challenge", localAuthOnly, requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const factorId = typeof req.body?.factorId === "string" ? req.body.factorId : "";
    if (!factorId) {
        return void res.status(400).json({ detail: "factorId is required" });
    }
    try {
        const challenge = createMfaChallenge(factorId, userId);
        if (!challenge) {
            return void res.status(404).json({ detail: "Factor not found" });
        }
        res.json(challenge);
    } catch (err) {
        sendServerError(res, err);
    }
});

// POST /user/mfa/verify — verify a TOTP code; confirms pending factors and
// elevates the current session to aal2.
userRouter.post("/mfa/verify", localAuthOnly, requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const factorId = typeof req.body?.factorId === "string" ? req.body.factorId : "";
    const challengeId =
        typeof req.body?.challengeId === "string" ? req.body.challengeId : undefined;
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    if (!factorId || !code) {
        return void res.status(400).json({ detail: "factorId and code are required" });
    }
    try {
        const result = verifyMfaFactorCode({ factorId, userId, challengeId, code });
        if (!result.ok) {
            return void res.status(400).json({ detail: result.error });
        }
        markSessionMfaVerified(res.locals.token as string);
        res.status(204).send();
    } catch (err) {
        sendServerError(res, err);
    }
});

// POST /user/mfa/unenroll — requires an MFA-verified (aal2) session so a
// password-only session cannot disable MFA.
userRouter.post("/mfa/unenroll", localAuthOnly, requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const factorId = typeof req.body?.factorId === "string" ? req.body.factorId : "";
    if (!factorId) {
        return void res.status(400).json({ detail: "factorId is required" });
    }
    if (res.locals.mfaVerified === false) {
        return void res.status(403).json({
            detail: "Verify your authenticator before removing factors.",
            code: "mfa_verification_required",
        });
    }
    unenrollMfaFactor(factorId, userId);
    if (!hasVerifiedTotpFactor(userId)) {
        const db = createServerDatabase();
        await db
            .from("user_profiles")
            .update({ mfa_on_login: false })
            .eq("user_id", userId);
    }
    res.status(204).send();
});

function errorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    if (error && typeof error === "object") {
        const record = error as {
            message?: unknown;
            details?: unknown;
            hint?: unknown;
            code?: unknown;
        };
        return (
            [record.message, record.details, record.hint, record.code]
                .filter(
                    (value): value is string =>
                        typeof value === "string" && !!value,
                )
                .join(" ") || JSON.stringify(error)
        );
    }
    return String(error);
}

function backendPublicUrl(req: {
    protocol: string;
    get(name: string): string | undefined;
}) {
    return (
        process.env.API_PUBLIC_URL ||
        process.env.BACKEND_URL ||
        `${req.protocol}://${req.get("host")}`
    ).replace(/\/+$/, "");
}

function frontendUrl(path = "/account/connectors") {
    const base = (process.env.FRONTEND_URL ?? "http://localhost:3000").replace(
        /\/+$/,
        "",
    );
    return `${base}${path}`;
}

function shortHash(value: string) {
    return value
        ? crypto.createHash("sha256").update(value).digest("hex").slice(0, 12)
        : null;
}

function mcpOAuthPopupHtml(payload: {
    success: boolean;
    connectorId?: string;
    detail?: string;
}, nonce: string) {
    const targetOrigin = new URL(frontendUrl()).origin;
    const targetUrl = frontendUrl();
    // Escape "<" so attacker-influenced payload fields (e.g. the OAuth
    // ?error= query param echoed into `detail`) cannot break out of the
    // inline <script> block with a "</script>" sequence.
    const message = JSON.stringify({
        type: "mcp_oauth_result",
        ...payload,
    }).replace(/</g, "\\u003c");
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MCP authorization</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111827; background: #f9fafb; }
      main { max-width: 360px; padding: 24px; text-align: center; }
      p { color: #6b7280; }
    </style>
  </head>
  <body>
    <main>
      <h1>${payload.success ? "Authorization complete" : "Authorization failed"}</h1>
      <p>${payload.success ? "You can return to Mike." : "Return to Mike and try connecting again."}</p>
    </main>
    <script nonce="${nonce}">
      const message = ${message};
      const targetUrl = ${JSON.stringify(targetUrl)};
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(message, ${JSON.stringify(targetOrigin)});
      }
      setTimeout(() => window.close(), ${payload.success ? 600 : 2500});
      ${
          payload.success
              ? "setTimeout(() => window.location.assign(targetUrl), 1000);"
              : ""
      }
    </script>
  </body>
</html>`;
}

function mcpOAuthPopupCsp(nonce: string) {
    return [
        "default-src 'none'",
        `script-src 'nonce-${nonce}'`,
        "style-src 'unsafe-inline'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
    ].join("; ");
}

const PROFILE_SELECT =
    "display_name, organisation, message_credits_used, credits_reset_date, tier, title_model, tabular_model, mfa_on_login, legal_research_us, email_integration_enabled, dark_mode, feature_flags";
const PROFILE_SELECT_NO_DARK_MODE =
    "display_name, organisation, message_credits_used, credits_reset_date, tier, title_model, tabular_model, mfa_on_login, legal_research_us, email_integration_enabled, feature_flags";
const PROFILE_SELECT_NO_FEATURE_FLAGS =
    "display_name, organisation, message_credits_used, credits_reset_date, tier, title_model, tabular_model, mfa_on_login, legal_research_us, email_integration_enabled";
const PROFILE_SELECT_NO_EMAIL =
    "display_name, organisation, message_credits_used, credits_reset_date, tier, title_model, tabular_model, mfa_on_login, legal_research_us, feature_flags";
const PROFILE_SELECT_NO_LEGAL =
    "display_name, organisation, message_credits_used, credits_reset_date, tier, title_model, tabular_model, mfa_on_login";
const LEGACY_PROFILE_SELECT =
    "display_name, organisation, message_credits_used, credits_reset_date, tier, tabular_model";
const LEGACY_PROFILE_MODEL_SELECT =
    "display_name, organisation, message_credits_used, credits_reset_date, tier, title_model, tabular_model";

function isMissingProfileColumn(error: unknown, column: string): boolean {
    const record =
        error && typeof error === "object"
            ? (error as { code?: unknown; message?: unknown })
            : {};
    const message = typeof record.message === "string" ? record.message : "";
    return record.code === "42703" && message.includes(column);
}

// Loads a profile while tolerating databases created before feature columns
// were introduced.
async function selectProfile(
    db: ServerDatabase,
    userId: string,
    mode: "maybe" | "single",
) {
    const fullQuery = db
        .from("user_profiles")
        .select(PROFILE_SELECT)
        .eq("user_id", userId);
    const full =
        mode === "single"
            ? await fullQuery.single()
            : await fullQuery.maybeSingle();
    if (!full.error) return full;

    if (isMissingProfileColumn(full.error, "dark_mode")) {
        const noDarkQuery = db
            .from("user_profiles")
            .select(PROFILE_SELECT_NO_DARK_MODE)
            .eq("user_id", userId);
        const noDark = mode === "single"
            ? await noDarkQuery.single()
            : await noDarkQuery.maybeSingle();
        if (!noDark.error) {
            if (noDark.data && typeof noDark.data === "object") {
                Object.assign(noDark.data as Record<string, unknown>, {
                    dark_mode: false,
                });
            }
            return noDark;
        }
    }

    const noFlagsQuery = db
        .from("user_profiles")
        .select(PROFILE_SELECT_NO_FEATURE_FLAGS)
        .eq("user_id", userId);
    const noFlags = mode === "single"
        ? await noFlagsQuery.single()
        : await noFlagsQuery.maybeSingle();
    if (!noFlags.error) {
        if (noFlags.data && typeof noFlags.data === "object") {
            Object.assign(noFlags.data as Record<string, unknown>, {
                feature_flags: {},
            });
        }
        return noFlags;
    }

    const noEmailQuery = db
        .from("user_profiles")
        .select(PROFILE_SELECT_NO_EMAIL)
        .eq("user_id", userId);
    const noEmail = mode === "single"
        ? await noEmailQuery.single()
        : await noEmailQuery.maybeSingle();
    if (!noEmail.error) {
        if (noEmail.data && typeof noEmail.data === "object") {
            Object.assign(noEmail.data as Record<string, unknown>, {
                email_integration_enabled: false,
            });
        }
        return noEmail;
    }

    const legacy = await selectProfileLegacy(db, userId, mode);
    if (legacy.data && typeof legacy.data === "object") {
        const row = legacy.data as Record<string, unknown>;
        if (!("legal_research_us" in row)) {
            Object.assign(row, { legal_research_us: true });
        }
        Object.assign(row, { email_integration_enabled: false });
    }
    return legacy;
}

async function selectProfileLegacy(
    db: ServerDatabase,
    userId: string,
    mode: "maybe" | "single",
) {
    const query = db
        .from("user_profiles")
        .select(PROFILE_SELECT_NO_LEGAL)
        .eq("user_id", userId);
    const result =
        mode === "single" ? await query.single() : await query.maybeSingle();
    if (!result.error) {
        return result;
    }

    const missingMfaOnLogin = isMissingProfileColumn(
        result.error,
        "mfa_on_login",
    );
    if (missingMfaOnLogin) {
        const modelQuery = db
            .from("user_profiles")
            .select(LEGACY_PROFILE_MODEL_SELECT)
            .eq("user_id", userId);
        const modelLegacy =
            mode === "single"
                ? await modelQuery.single()
                : await modelQuery.maybeSingle();
        if (
            !modelLegacy.error ||
            !isMissingProfileColumn(modelLegacy.error, "title_model")
        ) {
            if (modelLegacy.data && typeof modelLegacy.data === "object") {
                const row = modelLegacy.data as Record<string, unknown>;
                Object.assign(row, {
                    mfa_on_login: false,
                });
            }
            return modelLegacy;
        }
    }

    if (
        !missingMfaOnLogin &&
        !isMissingProfileColumn(result.error, "title_model")
    ) {
        return result;
    }

    const legacyQuery = db
        .from("user_profiles")
        .select(LEGACY_PROFILE_SELECT)
        .eq("user_id", userId);
    const legacy =
        mode === "single"
            ? await legacyQuery.single()
            : await legacyQuery.maybeSingle();
    if (legacy.data && typeof legacy.data === "object") {
        const row = legacy.data as Record<string, unknown>;
        Object.assign(row, {
            title_model: null,
            mfa_on_login: false,
        });
    }
    return legacy;
}

function serializeProfile(row: UserProfileRow, apiKeyStatus?: ApiKeyStatus) {
    const creditsUsed = row.message_credits_used ?? 0;
    const titleFallback = apiKeyStatus?.gemini
        ? DEFAULT_TITLE_MODEL
        : apiKeyStatus?.openai
          ? OPENAI_LOW_MODELS[0]
          : apiKeyStatus?.claude
            ? CLAUDE_LOW_MODELS[0]
            : DEFAULT_TITLE_MODEL;
    return {
        displayName: row.display_name,
        organisation: row.organisation,
        messageCreditsUsed: creditsUsed,
        creditsResetDate: row.credits_reset_date,
        creditsRemaining: Math.max(MONTHLY_CREDIT_LIMIT - creditsUsed, 0),
        tier: row.tier || "Free",
        titleModel: resolveModel(row.title_model, titleFallback),
        tabularModel: resolveModel(row.tabular_model, DEFAULT_TABULAR_MODEL),
        mfaOnLogin: row.mfa_on_login === true,
        legalResearchUs: row.legal_research_us !== false,
        emailIntegrationEnabled: row.email_integration_enabled === true,
        darkMode: row.dark_mode === true,
        featureFlags: normalizeUserFeatures(row.feature_flags),
        deploymentModules: resolveDeploymentModules(),
        ...(apiKeyStatus ? { apiKeyStatus } : {}),
    };
}

function validateProfilePayload(body: unknown):
    | {
          ok: true;
          update: {
              display_name?: string | null;
              organisation?: string | null;
              title_model?: string;
              tabular_model?: string;
              legal_research_us?: boolean;
              email_integration_enabled?: boolean;
              dark_mode?: boolean;
              feature_flags?: UserFeatures;
              updated_at: string;
          };
      }
    | { ok: false; detail: string } {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return { ok: false, detail: "Expected a JSON object" };
    }

    const raw = body as Record<string, unknown>;
    const allowedFields = new Set([
        "displayName",
        "organisation",
        "titleModel",
        "tabularModel",
        "legalResearchUs",
        "emailIntegrationEnabled",
        "darkMode",
        "featureFlags",
    ]);
    const invalidField = Object.keys(raw).find(
        (key) => !allowedFields.has(key),
    );
    if (invalidField) {
        return {
            ok: false,
            detail: `Unsupported profile field: ${invalidField}`,
        };
    }

    const update: {
        display_name?: string | null;
        organisation?: string | null;
        title_model?: string;
        tabular_model?: string;
        legal_research_us?: boolean;
        email_integration_enabled?: boolean;
        dark_mode?: boolean;
        feature_flags?: UserFeatures;
        updated_at: string;
    } = { updated_at: new Date().toISOString() };

    if ("displayName" in raw) {
        if (raw.displayName !== null && typeof raw.displayName !== "string") {
            return {
                ok: false,
                detail: "displayName must be a string or null",
            };
        }
        update.display_name = raw.displayName?.trim() || null;
    }

    if ("organisation" in raw) {
        if (raw.organisation !== null && typeof raw.organisation !== "string") {
            return {
                ok: false,
                detail: "organisation must be a string or null",
            };
        }
        update.organisation = raw.organisation?.trim() || null;
    }

    if ("tabularModel" in raw) {
        if (typeof raw.tabularModel !== "string") {
            return { ok: false, detail: "tabularModel must be a string" };
        }
        const resolved = resolveModel(raw.tabularModel, "");
        if (!resolved) {
            return { ok: false, detail: "Unsupported tabularModel" };
        }
        update.tabular_model = resolved;
    }

    if ("titleModel" in raw) {
        if (typeof raw.titleModel !== "string") {
            return { ok: false, detail: "titleModel must be a string" };
        }
        const resolved = resolveModel(raw.titleModel, "");
        if (!resolved) {
            return { ok: false, detail: "Unsupported titleModel" };
        }
        update.title_model = resolved;
    }

    if ("legalResearchUs" in raw) {
        if (typeof raw.legalResearchUs !== "boolean") {
            return {
                ok: false,
                detail: "legalResearchUs must be a boolean",
            };
        }
        update.legal_research_us = raw.legalResearchUs;
    }

    if ("emailIntegrationEnabled" in raw) {
        if (typeof raw.emailIntegrationEnabled !== "boolean") {
            return {
                ok: false,
                detail: "emailIntegrationEnabled must be a boolean",
            };
        }
        update.email_integration_enabled = raw.emailIntegrationEnabled;
    }

    if ("darkMode" in raw) {
        if (typeof raw.darkMode !== "boolean") {
            return {
                ok: false,
                detail: "darkMode must be a boolean",
            };
        }
        update.dark_mode = raw.darkMode;
    }

    if ("featureFlags" in raw) {
        if (
            !raw.featureFlags ||
            typeof raw.featureFlags !== "object" ||
            Array.isArray(raw.featureFlags)
        ) {
            return {
                ok: false,
                detail: "featureFlags must be an object",
            };
        }
        const flags = raw.featureFlags as Record<string, unknown>;
        const invalidFeature = Object.keys(flags).find(
            (key) =>
                !USER_FEATURE_KEYS.includes(
                    key as (typeof USER_FEATURE_KEYS)[number],
                ),
        );
        if (invalidFeature) {
            return {
                ok: false,
                detail: `Unsupported feature flag: ${invalidFeature}`,
            };
        }
        const nonBooleanFeature = Object.entries(flags).find(
            ([, value]) => typeof value !== "boolean",
        );
        if (nonBooleanFeature) {
            return {
                ok: false,
                detail: `featureFlags.${nonBooleanFeature[0]} must be a boolean`,
            };
        }
        update.feature_flags = normalizeUserFeatures(flags);
    }

    return { ok: true, update };
}

function readBooleanBodyField(
    body: unknown,
    field: string,
): { ok: true; value: boolean } | { ok: false; detail: string } {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return { ok: false, detail: "Expected a JSON object" };
    }

    const raw = body as Record<string, unknown>;
    const invalidField = Object.keys(raw).find((key) => key !== field);
    if (invalidField) {
        return { ok: false, detail: `Unsupported field: ${invalidField}` };
    }
    if (typeof raw[field] !== "boolean") {
        return { ok: false, detail: `${field} must be a boolean` };
    }

    return { ok: true, value: raw[field] };
}

async function userHasVerifiedTotpFactor(
    db: ServerDatabase,
    userId: string,
) {
    void db;
    return {
        ok: true as const,
        hasVerifiedTotp: hasVerifiedTotpFactor(userId),
    };
}

async function ensureProfileRow(
    db: ServerDatabase,
    userId: string,
) {
    const { error } = await db
        .from("user_profiles")
        .upsert(
            { user_id: userId, email_integration_enabled: false },
            { onConflict: "user_id", ignoreDuplicates: true },
        );
    return error;
}

async function loadProfile(
    db: ServerDatabase,
    userId: string,
    options: { repairMissing?: boolean; apiKeyStatus?: ApiKeyStatus } = {},
) {
    let { data, error } = await selectProfile(db, userId, "maybe");

    if (error) return { data: null, error };
    if (!data) {
        if (!options.repairMissing) {
            return { data: null, error: new Error("Profile not found") };
        }

        const ensureError = await ensureProfileRow(db, userId);
        if (ensureError) return { data: null, error: ensureError };

        const created = await selectProfile(db, userId, "single");
        if (created.error) return { data: null, error: created.error };
        data = created.data;
    }

    let row = data as UserProfileRow;
    if (
        row.credits_reset_date &&
        new Date() > new Date(row.credits_reset_date)
    ) {
        const creditsResetDate = new Date();
        creditsResetDate.setDate(creditsResetDate.getDate() + 30);
        const { error: resetError } = await db
            .from("user_profiles")
            .update({
                message_credits_used: 0,
                credits_reset_date: creditsResetDate.toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId)
            .lt("credits_reset_date", new Date().toISOString());

        if (resetError) return { data: null, error: resetError };
        const { data: resetData, error: resetLoadError } = await selectProfile(
            db,
            userId,
            "single",
        );
        if (resetLoadError) return { data: null, error: resetLoadError };
        row = resetData as UserProfileRow;
    }

    return { data: serializeProfile(row, options.apiKeyStatus), error: null };
}

// POST /user/profile
userRouter.post("/profile", requireAuth, async (_req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerDatabase();
    const error = await ensureProfileRow(db, userId);
    if (error) return void sendServerError(res, error);
    res.json({ ok: true });
});

// GET /user/lookup?email=person@example.com
userRouter.get("/lookup", requireAuth, async (req, res) => {
    const email = typeof req.query.email === "string" ? req.query.email : "";
    if (!email.trim()) {
        return void res.status(400).json({ detail: "email is required" });
    }

    const db = createServerDatabase();
    const user = await findProfileUserByEmail(db, email);
    res.json({
        exists: !!user,
        email: user?.email ?? email.trim().toLowerCase(),
        display_name: user?.display_name ?? null,
    });
});

// GET /user/profile
userRouter.get("/profile", requireAuth, async (_req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerDatabase();
    const apiKeyStatus = await getUserApiKeyStatus(userId, db);
    const { data, error } = await loadProfile(db, userId, {
        repairMissing: true,
        apiKeyStatus,
    });
    if (error) return void sendServerError(res, error);
    res.json({ ...data, apiKeyStatus });
});

// GET /user/models
userRouter.get("/models", requireAuth, async (_req, res) => {
    const db = createServerDatabase();
    const features = await getUserFeatures(res.locals.userId as string, db);
    res.json({
        configured: configuredModelSummaries().filter(
            (model) =>
                (model.location !== "local" || features.localModels) &&
                (model.location !== "committee" || features.committeeModels),
        ),
    });
});

// PATCH /user/profile
userRouter.patch("/profile", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const parsed = validateProfilePayload(req.body);
    if (!parsed.ok) return void res.status(400).json({ detail: parsed.detail });

    const db = createServerDatabase();
    const ensureError = await ensureProfileRow(db, userId);
    if (ensureError)
        return void sendServerError(res, ensureError);

    const { error: updateError } = await db
        .from("user_profiles")
        .update(parsed.update)
        .eq("user_id", userId);
    if (updateError)
        return void sendServerError(res, updateError);

    const apiKeyStatus = await getUserApiKeyStatus(userId, db);
    const { data, error } = await loadProfile(db, userId, { apiKeyStatus });
    if (error) return void sendServerError(res, error);
    res.json({ ...data, apiKeyStatus });
});

// PATCH /user/security/mfa-login
userRouter.patch(
    "/security/mfa-login",
    requireAuth,
    requireMfaIfEnrolled,
    async (req, res) => {
        const userId = res.locals.userId as string;
        const parsed = readBooleanBodyField(req.body, "enabled");
        if (!parsed.ok)
            return void res.status(400).json({ detail: parsed.detail });

        const db = createServerDatabase();
        if (parsed.value) {
            const factorCheck = await userHasVerifiedTotpFactor(db, userId);
            if (!factorCheck.ok) {
                return void sendServerError(res, factorCheck.error);
            }
            if (!factorCheck.hasVerifiedTotp) {
                return void res.status(400).json({
                    detail: "Set up an authenticator app before requiring verification on login.",
                });
            }
        }

        const ensureError = await ensureProfileRow(db, userId);
        if (ensureError)
            return void sendServerError(res, ensureError);

        const { error: updateError } = await db
            .from("user_profiles")
            .update({
                mfa_on_login: parsed.value,
                updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
        if (updateError)
            return void sendServerError(res, updateError);

        const apiKeyStatus = await getUserApiKeyStatus(userId, db);
        const { data, error } = await loadProfile(db, userId, { apiKeyStatus });
        if (error) return void sendServerError(res, error);
        res.json({ ...data, apiKeyStatus });
    },
);

// GET /user/api-keys
userRouter.get("/api-keys", requireAuth, async (_req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerDatabase();
    const status = await getUserApiKeyStatus(userId, db);
    res.json(status);
});

// PUT /user/api-keys/:provider
userRouter.put(
    "/api-keys/:provider",
    requireAuth,
    requireMfaIfEnrolled,
    async (req, res) => {
        const userId = res.locals.userId as string;
        const provider = normalizeApiKeyProvider(req.params.provider);
        if (!provider)
            return void res
                .status(400)
                .json({ detail: "Unsupported provider" });

        const apiKey =
            typeof req.body?.api_key === "string" ? req.body.api_key : null;
        const db = createServerDatabase();
        try {
            if (hasEnvApiKey(provider)) {
                return void res.status(409).json({
                    detail: "This provider is configured by the server environment and cannot be changed from the browser.",
                });
            }
            await saveUserApiKey(userId, provider, apiKey, db);
            const status = await getUserApiKeyStatus(userId, db);
            res.json(status);
        } catch (err) {
            const detail = errorMessage(err);
            console.error("[user/api-keys] save failed", {
                provider,
                error: detail,
            });
            res.status(500).json({ detail: "Failed to save API key" });
        }
    },
);

// GET /user/mcp-connectors
userRouter.get("/mcp-connectors", requireAuth, async (_req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerDatabase();
    try {
        res.json(
            await listUserMcpConnectors(userId, db, { includeTools: false }),
        );
    } catch (err) {
        const detail = errorMessage(err);
        console.error("[user/mcp-connectors] list failed", {
            userId,
            error: detail,
        });
        res.status(500).json({ detail: "Failed to list connectors" });
    }
});

// GET /user/mcp-connectors/:connectorId
userRouter.get(
    "/mcp-connectors/:connectorId",
    requireAuth,
    async (req, res) => {
        const userId = res.locals.userId as string;
        const db = createServerDatabase();
        try {
            res.json(
                await getUserMcpConnector(userId, req.params.connectorId, db),
            );
        } catch (err) {
            const detail = errorMessage(err);
            console.error("[user/mcp-connectors] get failed", {
                userId,
                connectorId: req.params.connectorId,
                error: detail,
            });
            res.status(404).json({ detail });
        }
    },
);

// POST /user/mcp-connectors
userRouter.post(
    "/mcp-connectors",
    requireAuth,
    requireMfaIfEnrolled,
    async (req, res) => {
        const userId = res.locals.userId as string;
        const name = typeof req.body?.name === "string" ? req.body.name : "";
        const serverUrl =
            typeof req.body?.serverUrl === "string" ? req.body.serverUrl : "";
        const bearerToken =
            typeof req.body?.bearerToken === "string"
                ? req.body.bearerToken
                : null;
        const headers =
            req.body?.headers &&
            typeof req.body.headers === "object" &&
            !Array.isArray(req.body.headers)
                ? (req.body.headers as Record<string, unknown>)
                : undefined;
        const db = createServerDatabase();
        try {
            const connector = await createUserMcpConnector(
                userId,
                { name, serverUrl, bearerToken, headers },
                db,
            );
            res.status(201).json(connector);
        } catch (err) {
            const detail = errorMessage(err);
            console.error("[user/mcp-connectors] create failed", {
                userId,
                error: detail,
            });
            res.status(400).json({ detail });
        }
    },
);

// POST /user/mcp-connectors/presets/patent
userRouter.post(
    "/mcp-connectors/presets/patent",
    requireAuth,
    requireUserFeature("patentConnector"),
    requireMfaIfEnrolled,
    async (_req, res) => {
        const userId = res.locals.userId as string;
        const db = createServerDatabase();
        try {
            const connector = await provisionPatentMcpConnector(userId, db);
            res.status(201).json(
                await refreshUserMcpConnectorTools(userId, connector.id, db),
            );
        } catch (err) {
            const detail = errorMessage(err);
            console.error("[user/mcp-connectors] patent preset failed", {
                userId,
                error: detail,
            });
            res.status(400).json({ detail });
        }
    },
);

// PATCH /user/mcp-connectors/:connectorId
userRouter.patch(
    "/mcp-connectors/:connectorId",
    requireAuth,
    requireMfaIfEnrolled,
    async (req, res) => {
        const userId = res.locals.userId as string;
        const db = createServerDatabase();
        const body = req.body ?? {};
        try {
            const connector = await updateUserMcpConnector(
                userId,
                req.params.connectorId,
                {
                    ...(typeof body.name === "string"
                        ? { name: body.name }
                        : {}),
                    ...(typeof body.serverUrl === "string"
                        ? { serverUrl: body.serverUrl }
                        : {}),
                    ...(typeof body.enabled === "boolean"
                        ? { enabled: body.enabled }
                        : {}),
                    ...("bearerToken" in body
                        ? {
                              bearerToken:
                                  typeof body.bearerToken === "string"
                                      ? body.bearerToken
                                      : null,
                          }
                        : {}),
                    ...("headers" in body
                        ? {
                              headers:
                                  body.headers &&
                                  typeof body.headers === "object" &&
                                  !Array.isArray(body.headers)
                                      ? (body.headers as Record<
                                            string,
                                            unknown
                                        >)
                                      : {},
                          }
                        : {}),
                },
                db,
            );
            res.json(connector);
        } catch (err) {
            const detail = errorMessage(err);
            console.error("[user/mcp-connectors] update failed", {
                userId,
                connectorId: req.params.connectorId,
                error: detail,
            });
            res.status(400).json({ detail });
        }
    },
);

// DELETE /user/mcp-connectors/:connectorId
userRouter.delete(
    "/mcp-connectors/:connectorId",
    requireAuth,
    requireMfaIfEnrolled,
    async (req, res) => {
        const userId = res.locals.userId as string;
        const db = createServerDatabase();
        try {
            await deleteUserMcpConnector(userId, req.params.connectorId, db);
            res.status(204).send();
        } catch (err) {
            const detail = errorMessage(err);
            console.error("[user/mcp-connectors] delete failed", {
                userId,
                connectorId: req.params.connectorId,
                error: detail,
            });
            res.status(500).json({ detail: "Failed to delete connector" });
        }
    },
);

// POST /user/mcp-connectors/:connectorId/oauth/start
userRouter.post(
    "/mcp-connectors/:connectorId/oauth/start",
    requireAuth,
    requireMfaIfEnrolled,
    async (req, res) => {
        const userId = res.locals.userId as string;
        const db = createServerDatabase();
        try {
            const redirectUri = `${backendPublicUrl(req)}/user/mcp-connectors/oauth/callback`;
            const result = await startUserMcpConnectorOAuth(
                userId,
                req.params.connectorId,
                redirectUri,
                db,
            );
            res.json(result);
        } catch (err) {
            const detail = errorMessage(err);
            console.error("[user/mcp-connectors] oauth start failed", {
                userId,
                connectorId: req.params.connectorId,
                error: detail,
            });
            res.status(400).json({ detail });
        }
    },
);

// GET /user/mcp-connectors/oauth/callback
userRouter.get("/mcp-connectors/oauth/callback", async (req, res) => {
    const nonce = crypto.randomBytes(16).toString("base64");
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const error =
        typeof req.query.error === "string" ? req.query.error : undefined;
    const db = createServerDatabase();
    try {
        if (error) throw new Error(error);
        if (!state || !code)
            throw new Error("OAuth callback is missing state or code.");
        const result = await completeUserMcpConnectorOAuth(state, code, db);
        res.set("Content-Security-Policy", mcpOAuthPopupCsp(nonce))
            .type("html")
            .send(
                mcpOAuthPopupHtml(
                    {
                        success: true,
                        connectorId: result.connectorId,
                    },
                    nonce,
                ),
            );
    } catch (err) {
        const detail = errorMessage(err);
        console.error("[user/mcp-connectors] oauth callback failed", {
            error: detail,
            stateHash: shortHash(state),
            hasCode: !!code,
            hasError: !!error,
            issuer:
                typeof req.query.iss === "string" ? req.query.iss : undefined,
            scope:
                typeof req.query.scope === "string"
                    ? req.query.scope
                    : undefined,
        });
        res.status(400)
            .set("Content-Security-Policy", mcpOAuthPopupCsp(nonce))
            .type("html")
            .send(mcpOAuthPopupHtml({ success: false, detail }, nonce));
    }
});

// POST /user/mcp-connectors/:connectorId/refresh-tools
userRouter.post(
    "/mcp-connectors/:connectorId/refresh-tools",
    requireAuth,
    requireMfaIfEnrolled,
    async (req, res) => {
        const userId = res.locals.userId as string;
        const db = createServerDatabase();
        try {
            const connector = await refreshUserMcpConnectorTools(
                userId,
                req.params.connectorId,
                db,
            );
            res.json(connector);
        } catch (err) {
            const detail = errorMessage(err);
            console.error("[user/mcp-connectors] refresh failed", {
                userId,
                connectorId: req.params.connectorId,
                error: detail,
            });
            if (err instanceof McpOAuthRequiredError) {
                return void res.status(401).json({
                    code: err.code,
                    detail,
                });
            }
            res.status(400).json({ detail });
        }
    },
);

// PATCH /user/mcp-connectors/:connectorId/tools/:toolId
userRouter.patch(
    "/mcp-connectors/:connectorId/tools/:toolId",
    requireAuth,
    requireMfaIfEnrolled,
    async (req, res) => {
        const userId = res.locals.userId as string;
        const parsed = readBooleanBodyField(req.body, "enabled");
        if (!parsed.ok)
            return void res.status(400).json({ detail: parsed.detail });

        const db = createServerDatabase();
        try {
            const connector = await setUserMcpToolEnabled(
                userId,
                req.params.connectorId,
                req.params.toolId,
                parsed.value,
                db,
            );
            res.json(connector);
        } catch (err) {
            const detail = errorMessage(err);
            console.error("[user/mcp-connectors] tool toggle failed", {
                userId,
                connectorId: req.params.connectorId,
                toolId: req.params.toolId,
                error: detail,
            });
            res.status(400).json({ detail });
        }
    },
);

// DELETE /user/account
userRouter.delete(
    "/account",
    requireAuth,
    requireMfaIfEnrolled,
    async (_req, res) => {
        const userId = res.locals.userId as string;
        const userEmail = res.locals.userEmail as string | undefined;
        const db = createServerDatabase();
        try {
            await deleteUserAccountData(db, userId, userEmail);
            const { error } = await db.auth.admin.deleteUser(userId);
            if (error)
                return void sendServerError(res, error, "Failed to delete account");
            res.status(204).send();
        } catch (err) {
            const detail = errorMessage(err);
            console.error("[user/account] delete failed", {
                userId,
                error: detail,
            });
            res.status(500).json({ detail: "Failed to delete account" });
        }
    },
);

// DELETE /user/chats
userRouter.delete(
    "/chats",
    requireAuth,
    requireMfaIfEnrolled,
    async (_req, res) => {
        const userId = res.locals.userId as string;
        const db = createServerDatabase();
        try {
            await deleteAllUserChats(db, userId);
            res.status(204).send();
        } catch (err) {
            const detail = errorMessage(err);
            console.error("[user/chats] delete failed", {
                userId,
                error: detail,
            });
            res.status(500).json({ detail: "Failed to delete chats" });
        }
    },
);

// DELETE /user/projects
userRouter.delete(
    "/projects",
    requireAuth,
    requireMfaIfEnrolled,
    async (_req, res) => {
        const userId = res.locals.userId as string;
        const db = createServerDatabase();
        try {
            await deleteUserProjects(db, userId);
            res.status(204).send();
        } catch (err) {
            const detail = errorMessage(err);
            console.error("[user/projects] delete failed", {
                userId,
                error: detail,
            });
            res.status(500).json({ detail: "Failed to delete projects" });
        }
    },
);

// DELETE /user/tabular-reviews
userRouter.delete(
    "/tabular-reviews",
    requireAuth,
    requireMfaIfEnrolled,
    async (_req, res) => {
        const userId = res.locals.userId as string;
        const db = createServerDatabase();
        try {
            await deleteAllUserTabularReviews(db, userId);
            res.status(204).send();
        } catch (err) {
            const detail = errorMessage(err);
            console.error("[user/tabular-reviews] delete failed", {
                userId,
                error: detail,
            });
            res.status(500).json({ detail: "Failed to delete tabular reviews" });
        }
    },
);

// GET /user/export
userRouter.get(
    "/export",
    requireAuth,
    requireMfaIfEnrolled,
    async (_req, res) => {
        const userId = res.locals.userId as string;
        const userEmail = res.locals.userEmail as string | undefined;
        const db = createServerDatabase();
        try {
            const data = await buildUserAccountExport(db, userId, userEmail);
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${userExportFilename("account", userId)}"`,
            );
            res.json(data);
        } catch (err) {
            const detail = errorMessage(err);
            console.error("[user/export] failed", { userId, error: detail });
            res.status(500).json({ detail: "Failed to export account data" });
        }
    },
);

// GET /user/chats/export
userRouter.get(
    "/chats/export",
    requireAuth,
    requireMfaIfEnrolled,
    async (_req, res) => {
        const userId = res.locals.userId as string;
        const userEmail = res.locals.userEmail as string | undefined;
        const db = createServerDatabase();
        try {
            const data = await buildUserChatsExport(db, userId, userEmail);
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${userExportFilename("chats", userId)}"`,
            );
            res.json(data);
        } catch (err) {
            const detail = errorMessage(err);
            console.error("[user/chats/export] failed", {
                userId,
                error: detail,
            });
            res.status(500).json({ detail: "Failed to export chats" });
        }
    },
);

// GET /user/tabular-reviews/export
userRouter.get(
    "/tabular-reviews/export",
    requireAuth,
    requireMfaIfEnrolled,
    async (_req, res) => {
        const userId = res.locals.userId as string;
        const userEmail = res.locals.userEmail as string | undefined;
        const db = createServerDatabase();
        try {
            const data = await buildUserTabularReviewsExport(
                db,
                userId,
                userEmail,
            );
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${userExportFilename("tabular-reviews", userId)}"`,
            );
            res.json(data);
        } catch (err) {
            const detail = errorMessage(err);
            console.error("[user/tabular-reviews/export] failed", {
                userId,
                error: detail,
            });
            res.status(500).json({ detail: "Failed to export tabular reviews" });
        }
    },
);

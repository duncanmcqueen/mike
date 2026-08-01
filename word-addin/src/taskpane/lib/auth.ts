const TOKEN_KEY = "mike_auth_token";

declare const process: { env: { API_BASE_URL?: string } };

export const API_BASE =
  process.env.API_BASE_URL?.trim().replace(/\/$/, "") || "/api";

export type AuthUser = {
  id: string;
  email: string;
};

export interface AuthStatus {
  authenticated: boolean;
  mfaRequired: boolean;
  user: AuthUser | null;
}

type LoginResult = {
  token: string;
  user: AuthUser;
  mfaRequired?: boolean;
};

export function getMikeToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setMikeToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Office hosts can disable task-pane storage by policy.
  }
}

export function clearMikeToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Best effort.
  }
}

export function authHeader(): Record<string, string> {
  const token = getMikeToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function errorDetail(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(text) as { detail?: unknown };
    if (typeof parsed.detail === "string") return parsed.detail;
  } catch {
    // Return the raw response below.
  }
  return text || `Request failed (${response.status})`;
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  if (!getMikeToken()) {
    return { authenticated: false, mfaRequired: false, user: null };
  }
  const response = await fetch(`${API_BASE}/user/auth/session`, {
    cache: "no-store",
    headers: { Accept: "application/json", ...authHeader() },
  });
  if (!response.ok) {
    if (response.status === 401) clearMikeToken();
    return { authenticated: false, mfaRequired: false, user: null };
  }
  const { user } = (await response.json()) as { user: AuthUser | null };
  if (!user) {
    clearMikeToken();
    return { authenticated: false, mfaRequired: false, user: null };
  }

  const mfaResponse = await fetch(`${API_BASE}/user/mfa/status`, {
    cache: "no-store",
    headers: { Accept: "application/json", ...authHeader() },
  });
  if (mfaResponse.ok) {
    const mfa = (await mfaResponse.json()) as { currentLevel?: string };
    if (mfa.currentLevel === "aal1") {
      return { authenticated: false, mfaRequired: true, user };
    }
  }
  return { authenticated: true, mfaRequired: false, user };
}

export async function loginWithPassword(
  email: string,
  password: string,
): Promise<LoginResult> {
  const response = await fetch(`${API_BASE}/user/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(await errorDetail(response));
  const result = (await response.json()) as LoginResult;
  setMikeToken(result.token);
  return result;
}

export async function verifyMfa(code: string): Promise<void> {
  const statusResponse = await fetch(`${API_BASE}/user/mfa/status`, {
    cache: "no-store",
    headers: { Accept: "application/json", ...authHeader() },
  });
  if (!statusResponse.ok) throw new Error(await errorDetail(statusResponse));
  const status = (await statusResponse.json()) as {
    factors?: Array<{ id: string; status?: string }>;
  };
  const factor = status.factors?.find((item) => item.status === "verified");
  if (!factor) throw new Error("No verified authenticator is available.");

  const response = await fetch(`${API_BASE}/user/mfa/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeader(),
    },
    body: JSON.stringify({ factorId: factor.id, code }),
  });
  if (!response.ok) throw new Error(await errorDetail(response));
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/user/auth/logout`, {
      method: "POST",
      headers: authHeader(),
    });
  } finally {
    clearMikeToken();
  }
}

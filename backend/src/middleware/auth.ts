import { Request, Response, NextFunction } from "express";
import {
  ensureLocalProfile,
  findLocalUserById,
  findSession,
} from "../lib/sqlite";

/**
 * Paths reachable with an aal1 (password-only, MFA not yet verified)
 * session. Everything else is rejected with 403 +
 * `mfa_verification_required` until the session is elevated via
 * POST /user/mfa/verify. Paths are router-relative; `/mfa/` only exists
 * in the user router, which is what needs it.
 */
const AAL1_ALLOWED_PREFIXES = ["/mfa/"];
const AAL1_ALLOWED_PATHS = new Set(["/profile", "/security/mfa-status"]);

function isAal1Allowed(req: Request): boolean {
  const path = req.path;
  if (AAL1_ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return true;
  }
  return req.method === "GET" && AAL1_ALLOWED_PATHS.has(path);
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = req.headers.authorization ?? "";
  if (!auth.startsWith("Bearer ")) {
    res.status(401).json({ detail: "Missing or invalid Authorization header" });
    return;
  }

  const token = auth.slice(7).trim();
  const session = findSession(token);
  if (!session) {
    res.status(401).json({ detail: "Invalid or expired token" });
    return;
  }

  const user = findLocalUserById(session.userId) as
    | { id: string; email?: string }
    | null;
  if (!user) {
    res.status(401).json({ detail: "Invalid or expired token" });
    return;
  }

  if (!session.mfaVerified && !isAal1Allowed(req)) {
    res.status(403).json({
      detail: "MFA verification required",
      code: "mfa_verification_required",
    });
    return;
  }

  res.locals.userId = user.id;
  res.locals.userEmail = user.email?.toLowerCase() ?? "";
  res.locals.token = token;
  res.locals.mfaVerified = session.mfaVerified;
  ensureLocalProfile(user.id, user.email ?? null);
  next();
}

export async function requireMfaIfEnrolled(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (res.locals.mfaVerified === false) {
    res.status(403).json({
      detail: "MFA verification required",
      code: "mfa_verification_required",
    });
    return;
  }
  next();
}

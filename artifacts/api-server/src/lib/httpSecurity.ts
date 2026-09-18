import type { IncomingMessage } from "http";
import type { NextFunction, Request, Response } from "express";

export const LOCAL_SESSION_COOKIE = "linkealls_session";

const productionOrigins = new Set([
  "https://app.linkealls.com",
  "https://linkealls.com",
]);

for (const key of ["PUBLIC_BASE_URL", "PRODUCTION_URL"] as const) {
  const value = process.env[key]?.trim();
  if (!value) continue;
  try {
    productionOrigins.add(new URL(value).origin);
  } catch {
    // Invalid optional configuration is ignored; the fixed canonical origins remain.
  }
}

export function isAllowedBrowserOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (process.env["NODE_ENV"] !== "production") return true;
  try {
    return productionOrigins.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

export function isSafeInternalPath(value: unknown): value is string {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !/[\u0000-\u001f]/.test(value);
}

export function getLocalSessionToken(req: { cookies?: Record<string, unknown> }): string | null {
  const token = req.cookies?.[LOCAL_SESSION_COOKIE];
  return typeof token === "string" && token.length > 0 ? token : null;
}

function cookieIsSecure(req: Request): boolean {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  return process.env.NODE_ENV !== "development" || proto === "https";
}

export function setLocalSessionCookie(
  req: Request,
  res: Response,
  token: string,
  expiresAt: Date,
): void {
  res.cookie(LOCAL_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieIsSecure(req),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearLocalSessionCookie(req: Request, res: Response): void {
  res.clearCookie(LOCAL_SESSION_COOKIE, {
    httpOnly: true,
    secure: cookieIsSecure(req),
    sameSite: "lax",
    path: "/",
  });
}

/**
 * Cookie-authenticated state-changing requests must come from a permitted
 * browser origin. SameSite=Lax is retained as a second independent defence.
 * Tokenless public and provider/webhook routes remain usable without Origin.
 */
export function enforceCookieCsrf(req: Request, res: Response, next: NextFunction): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }
  const hasBrowserSession = Boolean(getLocalSessionToken(req) || req.cookies?.["sid"]);
  if (!hasBrowserSession) {
    next();
    return;
  }
  const origin = req.headers.origin;
  if (!origin || !isAllowedBrowserOrigin(origin)) {
    res.status(403).json({ error: "Origem da requisição não autorizada" });
    return;
  }
  next();
}

export function clientIp(req: Request | IncomingMessage): string {
  if ("ip" in req && typeof req.ip === "string" && req.ip.length > 0) {
    return req.ip;
  }
  const forwarded = req.headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[forwarded.length - 1] : forwarded;
  const nearestForwardedAddress = value?.split(",").at(-1)?.trim();
  return nearestForwardedAddress || req.socket.remoteAddress || "unknown";
}
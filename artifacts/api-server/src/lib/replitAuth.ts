import crypto from "crypto";
import { eq } from "drizzle-orm";
import * as oidc from "openid-client";
import type { Request, Response } from "express";
import { db, sessionsTable } from "@workspace/db";
import { isSafeInternalPath } from "./httpSecurity.js";

export const ISSUER_URL = process.env.ISSUER_URL ?? "https://replit.com/oidc";
export const SESSION_COOKIE = "sid";
export const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

export interface ReplitAuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

export interface ReplitSessionData {
  user: ReplitAuthUser;
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
}

let oidcConfig: oidc.Configuration | null = null;

export async function getOidcConfig(): Promise<oidc.Configuration> {
  if (!oidcConfig) {
    oidcConfig = await oidc.discovery(new URL(ISSUER_URL), process.env.REPL_ID!);
  }
  return oidcConfig;
}

export async function createReplitSession(data: ReplitSessionData): Promise<string> {
  const sid = crypto.randomBytes(32).toString("hex");
  await db.insert(sessionsTable).values({
    sid,
    sess: data as unknown as Record<string, unknown>,
    expire: new Date(Date.now() + SESSION_TTL),
  });
  return sid;
}

export async function getReplitSession(sid: string): Promise<ReplitSessionData | null> {
  const [row] = await db.select().from(sessionsTable).where(eq(sessionsTable.sid, sid));
  if (!row || row.expire < new Date()) {
    if (row) await deleteReplitSession(sid);
    return null;
  }
  return row.sess as unknown as ReplitSessionData;
}

export async function updateReplitSession(
  sid: string,
  data: ReplitSessionData,
): Promise<void> {
  await db.update(sessionsTable).set({
    sess: data as unknown as Record<string, unknown>,
    expire: new Date(Date.now() + SESSION_TTL),
  }).where(eq(sessionsTable.sid, sid));
}

export async function deleteReplitSession(sid: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
}

export async function clearReplitSession(res: Response, sid?: string): Promise<void> {
  if (sid) await deleteReplitSession(sid);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function getReplitSessionId(req: Request): string | undefined {
  return req.cookies?.[SESSION_COOKIE];
}

export function getSafeReturnTo(value: unknown): string {
  return isSafeInternalPath(value) ? value : "/";
}

export function getRequestOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  return `${proto}://${host}`;
}

export function toReplitAuthUser(claims: Record<string, unknown>): ReplitAuthUser {
  return {
    id: String(claims.sub ?? ""),
    email: typeof claims.email === "string" ? claims.email : null,
    firstName: typeof claims.first_name === "string" ? claims.first_name : null,
    lastName: typeof claims.last_name === "string" ? claims.last_name : null,
    profileImageUrl: typeof (claims.profile_image_url ?? claims.picture) === "string"
      ? String(claims.profile_image_url ?? claims.picture)
      : null,
  };
}

export async function refreshReplitSession(
  sid: string,
  session: ReplitSessionData,
): Promise<ReplitSessionData | null> {
  const now = Math.floor(Date.now() / 1000);
  if (!session.expires_at || now <= session.expires_at) return session;
  if (!session.refresh_token) return null;

  try {
    const config = await getOidcConfig();
    const tokens = await oidc.refreshTokenGrant(config, session.refresh_token);
    session.access_token = tokens.access_token;
    session.refresh_token = tokens.refresh_token ?? session.refresh_token;
    session.expires_at = tokens.expiresIn()
      ? now + tokens.expiresIn()!
      : session.expires_at;
    await updateReplitSession(sid, session);
    return session;
  } catch {
    return null;
  }
}
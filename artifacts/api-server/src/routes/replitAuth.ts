import { Router, type Request, type Response } from "express";
import * as oidc from "openid-client";
import {
  clearReplitSession,
  createReplitSession,
  getOidcConfig,
  getReplitSessionId,
  getRequestOrigin,
  getSafeReturnTo,
  ISSUER_URL,
  SESSION_COOKIE,
  SESSION_TTL,
  toReplitAuthUser,
  type ReplitSessionData,
} from "../lib/replitAuth.js";

const router = Router();
const OIDC_COOKIE_TTL = 10 * 60 * 1000;

function setSessionCookie(req: Request, res: Response, sid: string): void {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const secure = process.env.NODE_ENV !== "development" || forwardedProto === "https";
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function setOidcCookie(req: Request, res: Response, name: string, value: string): void {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const secure = process.env.NODE_ENV !== "development" || forwardedProto === "https";
  res.cookie(name, value, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: OIDC_COOKIE_TTL,
  });
}

router.get("/auth/user", (req: Request, res: Response): void => {
  res.json({ user: req.isReplitAuthenticated() ? req.replitUser : null });
});

router.get("/login", async (req: Request, res: Response): Promise<void> => {
  const config = await getOidcConfig();
  const callbackUrl = `${getRequestOrigin(req)}/api/callback`;
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  const redirectTo = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: "openid email profile offline_access",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "login consent",
    state,
    nonce,
  });

  setOidcCookie(req, res, "code_verifier", codeVerifier);
  setOidcCookie(req, res, "nonce", nonce);
  setOidcCookie(req, res, "state", state);
  setOidcCookie(req, res, "return_to", getSafeReturnTo(req.query.returnTo));
  res.redirect(redirectTo.href);
});

router.get("/callback", async (req: Request, res: Response): Promise<void> => {
  const config = await getOidcConfig();
  const callbackUrl = `${getRequestOrigin(req)}/api/callback`;
  const codeVerifier = req.cookies?.code_verifier;
  const nonce = req.cookies?.nonce;
  const expectedState = req.cookies?.state;

  if (!codeVerifier || !expectedState) {
    res.redirect("/api/login");
    return;
  }

  const currentUrl = new URL(
    `${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`,
  );

  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState,
      idTokenExpected: true,
    });
  } catch (error) {
    req.log.warn({ error: error instanceof Error ? error.message : "oidc_error" }, "Replit OIDC callback failed");
    res.redirect("/api/login");
    return;
  }

  const returnTo = getSafeReturnTo(req.cookies?.return_to);
  res.clearCookie("code_verifier", { path: "/" });
  res.clearCookie("nonce", { path: "/" });
  res.clearCookie("state", { path: "/" });
  res.clearCookie("return_to", { path: "/" });

  const claims = tokens.claims();
  if (!claims || typeof claims.sub !== "string") {
    res.redirect("/api/login");
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const sessionData: ReplitSessionData = {
    user: toReplitAuthUser(claims as unknown as Record<string, unknown>),
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
  };
  const sid = await createReplitSession(sessionData);
  setSessionCookie(req, res, sid);
  res.redirect(returnTo);
});

router.get("/logout", async (req: Request, res: Response): Promise<void> => {
  const config = await getOidcConfig();
  const origin = getRequestOrigin(req);
  const returnTo = getSafeReturnTo(req.query.returnTo);
  const postLogoutRedirectUrl = new URL(returnTo, `${origin}/`).href;
  await clearReplitSession(res, getReplitSessionId(req));

  const endSessionUrl = oidc.buildEndSessionUrl(config, {
    client_id: process.env.REPL_ID!,
    post_logout_redirect_uri: postLogoutRedirectUrl,
  });
  res.redirect(endSessionUrl.href);
});

export default router;
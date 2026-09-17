import type { IncomingMessage } from "http";
import type { Request } from "express";

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

export function clientIp(req: Request | IncomingMessage): string {
  if ("ip" in req && typeof req.ip === "string" && req.ip.length > 0) {
    return req.ip;
  }
  const forwarded = req.headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[forwarded.length - 1] : forwarded;
  const nearestForwardedAddress = value?.split(",").at(-1)?.trim();
  return nearestForwardedAddress || req.socket.remoteAddress || "unknown";
}
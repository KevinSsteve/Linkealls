import type { NextFunction, Request, Response } from "express";
import {
  clearReplitSession,
  getReplitSession,
  getReplitSessionId,
  refreshReplitSession,
  type ReplitAuthUser,
} from "../lib/replitAuth.js";

declare global {
  namespace Express {
    interface Request {
      replitUser?: ReplitAuthUser;
      isReplitAuthenticated(): this is Request & { replitUser: ReplitAuthUser };
    }
  }
}

export async function replitAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  req.isReplitAuthenticated = function (
    this: Request,
  ): this is Request & { replitUser: ReplitAuthUser } {
    return this.replitUser != null;
  };

  const sid = getReplitSessionId(req);
  if (!sid) {
    next();
    return;
  }

  const session = await getReplitSession(sid);
  if (!session?.user?.id) {
    await clearReplitSession(res, sid);
    next();
    return;
  }

  const refreshed = await refreshReplitSession(sid, session);
  if (!refreshed) {
    await clearReplitSession(res, sid);
    next();
    return;
  }

  req.replitUser = refreshed.user;
  next();
}
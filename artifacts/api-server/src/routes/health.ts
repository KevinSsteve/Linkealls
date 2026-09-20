import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();
export const READINESS_TIMEOUT_MS = 1_500;

type ReadinessProbe = (timeoutMs: number) => Promise<unknown>;

type ReadinessRow = {
  [column: string]: unknown;
  db_ok?: unknown;
  required_tables_ok?: unknown;
};

export function hasRequiredDatabaseState(rows: ReadinessRow[]): boolean {
  return rows[0]?.db_ok === 1 && rows[0]?.required_tables_ok === true;
}

async function databaseProbe(timeoutMs: number): Promise<void> {
  // node-postgres supports query_timeout at runtime; QueryConfig omits it.
  const query = {
    text: `
      SELECT
        1 AS db_ok,
        to_regclass('public.auth_rate_limits') IS NOT NULL
          AND to_regclass('public.scheduled_job_runs') IS NOT NULL
          AND to_regclass('public.profile_change_proposals') IS NOT NULL
          AND to_regclass('public.resource_library') IS NOT NULL
          AND to_regclass('public.resource_uploads') IS NOT NULL
          AND to_regclass('public.sales_strategy_versions') IS NOT NULL
          AND to_regclass('public.sales_strategy_overrides') IS NOT NULL
          AND to_regclass('public.sales_outcome_events') IS NOT NULL
          AND to_regclass('public.lead_chat_requests') IS NOT NULL
          AS required_tables_ok
    `,
    query_timeout: timeoutMs,
  };
  const result = await pool.query<ReadinessRow>(query);
  if (!hasRequiredDatabaseState(result.rows)) {
    throw new Error("database is not ready");
  }
}

export function createReadinessHandler(
  probe: ReadinessProbe = databaseProbe,
  timeoutMs = READINESS_TIMEOUT_MS,
) {
  return async (_req: unknown, res: {
    status(code: number): { json(body: unknown): unknown };
    json(body: unknown): unknown;
  }): Promise<void> => {
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });
    const probeResult = Promise.resolve()
      .then(() => probe(timeoutMs))
      .then(() => true, () => false);

    const ready = await Promise.race([probeResult, timedOut]);
    if (timer) clearTimeout(timer);

    if (!ready) {
      res.status(503).json({ status: "unavailable" });
      return;
    }
    res.json({ status: "ready" });
  };
}

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/readyz", createReadinessHandler());

export default router;

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scheduled = await import(process.env.SCHEDULED_RUNTIME_TEST_MODULE);
const protocol = await import(process.env.CALL_FUNNEL_PROTOCOL_TEST_MODULE);
const apiServerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("a durable period claim prevents sequential and concurrent scheduled repeats", async () => {
  const claims = new Set();
  const claimer = {
    async claim(jobName, runKey) {
      const key = `${jobName}:${runKey}`;
      if (claims.has(key)) return false;
      claims.add(key);
      return true;
    },
  };
  let executions = 0;
  const results = await Promise.all([
    scheduled.runClaimedScheduledJob(claimer, "daily-summary", "2026-08-11", async () => {
      executions += 1;
    }),
    scheduled.runClaimedScheduledJob(claimer, "daily-summary", "2026-08-11", async () => {
      executions += 1;
    }),
  ]);

  assert.deepEqual(results.sort(), [false, true]);
  assert.equal(executions, 1);
  assert.equal(
    await scheduled.runClaimedScheduledJob(claimer, "daily-summary", "2026-08-11", async () => {
      executions += 1;
    }),
    false,
  );
  assert.equal(executions, 1);
});

test("a failed at-most-once scheduled attempt remains claimed and interval keys are stable", async () => {
  const claims = new Set();
  const claimer = {
    async claim(jobName, runKey) {
      const key = `${jobName}:${runKey}`;
      if (claims.has(key)) return false;
      claims.add(key);
      return true;
    },
  };

  await assert.rejects(
    scheduled.runClaimedScheduledJob(claimer, "daily-summary", "2026-08-12", async () => {
      throw new Error("provider unavailable");
    }),
    /provider unavailable/,
  );
  assert.equal(
    await scheduled.runClaimedScheduledJob(claimer, "daily-summary", "2026-08-12", async () => {}),
    false,
  );
  assert.equal(
    scheduled.utcIntervalRunKey(new Date("2026-08-12T10:14:59.999Z"), 15 * 60_000),
    scheduled.utcIntervalRunKey(new Date("2026-08-12T10:00:00.000Z"), 15 * 60_000),
  );
  assert.notEqual(
    scheduled.utcIntervalRunKey(new Date("2026-08-12T10:15:00.000Z"), 15 * 60_000),
    scheduled.utcIntervalRunKey(new Date("2026-08-12T10:00:00.000Z"), 15 * 60_000),
  );
});

test("voice protocol rejects malformed or costly input and resets its budget by window", () => {
  const audio = protocol.parseCallClientMessage(JSON.stringify({ type: "audio", data: "AA==" }));
  assert.equal(audio.ok, true);
  assert.equal(protocol.parseCallClientMessage('{"type":"audio","data":"not base64!"}').ok, false);
  assert.equal(protocol.parseCallClientMessage(JSON.stringify({ type: "user_text", text: "x".repeat(2_001) })).ok, false);
  assert.equal(protocol.parseCallClientMessage(JSON.stringify({
    type: "payment_result",
    orderId: "not-a-uuid",
    status: "paga",
  })).ok, false);

  const budget = new protocol.CallInputBudget({ maxMessages: 2, maxAudioBytes: 2, windowMs: 100 });
  const text = { type: "user_text", text: "olá" };
  assert.equal(budget.consume(text, 1_000), true);
  assert.equal(budget.consume(text, 1_001), true);
  assert.equal(budget.consume(text, 1_002), false);
  assert.equal(budget.consume(text, 1_101), true);
  assert.equal(budget.consume({ type: "audio", data: "AAAA" }, 1_102), false);
});

test("voice WebSocket uses the validated protocol, rate budget, and cleanup path", async () => {
  const source = await readFile(path.join(apiServerDir, "src/routes/callFunnelWs.ts"), "utf8");
  assert.match(source, /parseCallClientMessage/);
  assert.match(source, /CallInputBudget/);
  assert.match(source, /MAX_ACTIVE_CONNECTIONS/);
  assert.match(source, /function cleanup\(\)/);
  assert.match(source, /closed \|\| ws\.readyState !== WebSocket\.OPEN/);
});
import assert from "node:assert/strict";
import test from "node:test";

const {
  generateProfileJson,
  StartAnalysisError,
} = await import(process.env.BUSINESS_ANALYSIS_AI_TEST_MODULE);

const schema = {
  type: "object",
  properties: { name: { type: "string" } },
  required: ["name"],
};
const contents = [{ role: "user", parts: [{ text: "extract this business" }] }];
const response = (text, extra = {}) => ({ text, ...extra });

test("primary attempt uses minimal thinking and disables SDK retries", async () => {
  const calls = [];
  const result = await generateProfileJson(contents, schema, async (input) => {
    calls.push(input);
    return response('{"name":"Primary"}');
  });

  assert.deepEqual(result, { name: "Primary" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, "gemini-3-flash-preview");
  assert.deepEqual(calls[0].config.thinkingConfig, { thinkingLevel: "MINIMAL" });
  assert.equal(calls[0].config.responseMimeType, "application/json");
  assert.equal(calls[0].config.responseSchema, schema);
  assert.equal(calls[0].config.httpOptions.timeout, 25_000);
  assert.deepEqual(calls[0].config.httpOptions.retryOptions, { attempts: 1 });
  assert.ok(calls[0].config.abortSignal instanceof AbortSignal);
});

test("AbortError falls back once to gemini 2.5 with thinking disabled", async () => {
  const calls = [];
  const result = await generateProfileJson(contents, schema, async (input) => {
    calls.push(input);
    if (calls.length === 1) {
      const error = new Error("request aborted");
      error.name = "AbortError";
      throw error;
    }
    return response('{"name":"Fallback"}');
  });

  assert.deepEqual(result, { name: "Fallback" });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].model, "gemini-2.5-flash");
  assert.deepEqual(calls[1].config.thinkingConfig, { thinkingBudget: 0 });
  assert.equal(calls[1].config.httpOptions.timeout, 23_000);
  assert.deepEqual(calls[1].config.httpOptions.retryOptions, { attempts: 1 });
});

test("two deadline expirations abort both requests and become ANALYSIS_TIMEOUT", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const calls = [];
  const pending = generateProfileJson(contents, schema, (input) => {
    calls.push(input);
    return new Promise((_, reject) => {
      input.config.abortSignal.addEventListener("abort", () => {
        reject(input.config.abortSignal.reason);
      }, { once: true });
    });
  });

  t.mock.timers.tick(25_000);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].config.abortSignal.aborted, true);

  t.mock.timers.tick(300);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls.length, 2);

  t.mock.timers.tick(23_000);
  await assert.rejects(pending, (error) => {
    assert.ok(error instanceof StartAnalysisError);
    assert.equal(error.statusCode, 504);
    assert.equal(error.code, "ANALYSIS_TIMEOUT");
    assert.deepEqual(error.diagnostic, {
      kind: "timeout",
      model: "gemini-2.5-flash",
      providerStatus: undefined,
    });
    return true;
  });
  assert.equal(calls[1].config.abortSignal.aborted, true);
  assert.equal(25_000 + 300 + 23_000 < 50_000, true);
  for (const call of calls) {
    assert.deepEqual(call.config.httpOptions.retryOptions, { attempts: 1 });
  }
});

test("503 retries exactly once", async () => {
  const calls = [];
  const result = await generateProfileJson(contents, schema, async (input) => {
    calls.push(input);
    if (calls.length === 1) {
      throw Object.assign(new Error("unavailable"), { status: 503 });
    }
    return response('{"name":"Recovered"}');
  });

  assert.deepEqual(result, { name: "Recovered" });
  assert.equal(calls.length, 2);
});

test("malformed JSON retries exactly once", async () => {
  let calls = 0;
  const result = await generateProfileJson(contents, schema, async () => {
    calls += 1;
    return response(calls === 1 ? "{not-json" : '{"name":"Valid"}');
  });

  assert.deepEqual(result, { name: "Valid" });
  assert.equal(calls, 2);
});

test("400, 401, 403, and 429 provider failures never retry", async () => {
  for (const status of [400, 401, 403, 429]) {
    let calls = 0;
    await assert.rejects(
      generateProfileJson(contents, schema, async () => {
        calls += 1;
        throw Object.assign(new Error(`provider body at ${status}`), { status });
      }),
      (error) => {
        assert.ok(error instanceof StartAnalysisError);
        assert.equal(error.statusCode, 503);
        assert.equal(error.diagnostic.providerStatus, status);
        assert.equal(error.diagnostic.kind, status === 429 ? "quota" : "configuration");
        return true;
      },
    );
    assert.equal(calls, 1, `status ${status} should not retry`);
  }
});

test("blocked content never retries", async () => {
  let calls = 0;
  await assert.rejects(
    generateProfileJson(contents, schema, async () => {
      calls += 1;
      return response("", {
        promptFeedback: { blockReason: "SAFETY" },
        candidates: [{ finishReason: "SAFETY" }],
      });
    }),
    (error) => {
      assert.ok(error instanceof StartAnalysisError);
      assert.equal(error.statusCode, 422);
      assert.equal(error.code, "UNREADABLE_CONTENT");
      assert.equal(error.diagnostic.kind, "blocked");
      return true;
    },
  );
  assert.equal(calls, 1);
});

test("provider secrets and prompt bodies never enter diagnostics, logs, or public errors", async () => {
  const secret = "super-secret-api-key";
  const promptBody = "private prompt and customer data";
  globalThis.__businessAnalysisWarnings = [];
  let calls = 0;

  await assert.rejects(
    generateProfileJson(
      [{ role: "user", parts: [{ text: promptBody }] }],
      schema,
      async () => {
        calls += 1;
        throw Object.assign(new Error(`provider leaked ${secret}: ${promptBody}`), { status: 503 });
      },
    ),
    (error) => {
      const exposed = JSON.stringify({
        message: error.message,
        code: error.code,
        diagnostic: error.diagnostic,
      });
      assert.doesNotMatch(exposed, new RegExp(secret));
      assert.doesNotMatch(exposed, new RegExp(promptBody));
      return true;
    },
  );

  assert.equal(calls, 2);
  assert.equal(globalThis.__businessAnalysisWarnings.length, 2);
  const logs = JSON.stringify(globalThis.__businessAnalysisWarnings);
  assert.doesNotMatch(logs, new RegExp(secret));
  assert.doesNotMatch(logs, new RegExp(promptBody));
});
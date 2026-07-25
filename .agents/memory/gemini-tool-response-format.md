---
name: Gemini Live Tool Response Format
description: Exact SDK requirements for sendToolResponse in @google/genai Live API — missing fields cause silent failure or SDK throws.
---

# Gemini Live Tool Response Format

## The Rule

`session.sendToolResponse()` requires ALL THREE fields on every `functionResponse` item:

```typescript
session.sendToolResponse({
  functionResponses: [{
    id: string,      // call ID from the incoming function call
    name: string,    // REQUIRED — the function name (e.g. "show_product_catalog")
    response: Record<string, unknown>,  // plain object, NOT nested under 'result'
  }]
});
```

**Why:** The SDK validates `'name' in functionResponse` and `'response' in functionResponse`. Missing `name` throws: `"Could not parse function response, type 'object'."` Missing `id` (non-Vertex) throws `FUNCTION_RESPONSE_REQUIRES_ID`.

**How to apply:** Always capture `fc.name` at the call site and pass it to `dispatchToolResponse`. Never use `{ response: { result: ... } }` — the value must be flat at `response`.

## Tool Callback Closure Bug

`onToolCall` callbacks defined during `createGeminiLiveSession()` must NOT call `geminiSession?.sendToolResponse()` from the outer scope — `geminiSession` is `null` when the callback fires (assigned in the next `.then()`). 

**Fix:** Use an internal `_session` ref inside `geminiLive.ts`, or pass a pre-bound `sendResponse(result)` function as a second argument to `onToolCall`. The bound function captures `id`, `name`, and the internal session ref.

## send_text_message Tool Pattern

For tools that should auto-respond and not block the model, handle them inline in `geminiLive.ts` and call `dispatchToolResponse` immediately after emitting the callback. Do NOT await anything between the tool call and the response.

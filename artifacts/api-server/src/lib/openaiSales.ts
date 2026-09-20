import { z } from "zod";
import { openai } from "@workspace/integrations-openai-ai-server";

export const OPENAI_SALES_MODEL = "gpt-6-astra";

const decisionSchema = z.object({
  reply: z.string().trim().min(1).max(1600),
  intent: z.enum(["explore", "product", "price", "objection", "purchase", "quote", "appointment", "visit", "human", "post_sale"]),
  recommendedOfferings: z.array(z.string().trim().min(1).max(200)).max(3).default([]),
  nextQuestion: z.string().trim().max(300).nullable().default(null),
  handoffReason: z.string().trim().max(500).nullable().default(null),
  proposedAction: z.enum(["none", "catalog", "checkout", "quote_request", "appointment_request", "visit_request", "contact", "whatsapp", "owner_handoff"]).default("none"),
}).strict();

export type SalesDecision = z.infer<typeof decisionSchema>;
export interface SalesGenerationResult {
  decision: SalesDecision;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
}

const responseFormat = {
  type: "json_schema" as const,
  json_schema: {
    name: "sales_decision",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        reply: { type: "string" },
        intent: { type: "string", enum: ["explore", "product", "price", "objection", "purchase", "quote", "appointment", "visit", "human", "post_sale"] },
        recommendedOfferings: { type: "array", items: { type: "string" }, maxItems: 3 },
        nextQuestion: { type: ["string", "null"] },
        handoffReason: { type: ["string", "null"] },
        proposedAction: { type: "string", enum: ["none", "catalog", "checkout", "quote_request", "appointment_request", "visit_request", "contact", "whatsapp", "owner_handoff"] },
      },
      required: ["reply", "intent", "recommendedOfferings", "nextQuestion", "handoffReason", "proposedAction"],
    },
  },
};

function retryable(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  return !status || status === 408 || status === 409 || status === 429 || status >= 500;
}

export async function generateSalesDecision(system: string, prompt: string): Promise<SalesGenerationResult | null> {
  const deadline = Date.now() + 20_000;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return null;
      const response = await openai.chat.completions.create({
        model: OPENAI_SALES_MODEL,
        max_completion_tokens: 2400,
        reasoning_effort: "low",
        response_format: responseFormat,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }, { timeout: remaining });
      const parsed = decisionSchema.safeParse(JSON.parse(response.choices[0]?.message?.content ?? ""));
      if (parsed.success) {
        const usage = response.usage;
        return {
          decision: parsed.data,
          usage: {
            inputTokens: usage?.prompt_tokens ?? 0,
            outputTokens: usage?.completion_tokens ?? 0,
            totalTokens: usage?.total_tokens ?? 0,
          },
        };
      }
      return null;
    } catch (error) {
      if (attempt === 0 && retryable(error)) {
        const delay = Math.min(250, Math.max(0, deadline - Date.now()));
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      }
      else return null;
    }
  }
  return null;
}
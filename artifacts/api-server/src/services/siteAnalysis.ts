import { lookup } from "node:dns/promises";
import { GoogleGenAI, Type } from "@google/genai";
import { updateBusinessProfileSchema, type UpdateBusinessProfile } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { updateProfile, setAnalysisStatus, tryAcquireAnalysis } from "./businessProfile.js";

const EXTRACTION_MODEL = "gemini-3-flash-preview";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;
const MAX_PAGE_BYTES = 512 * 1024;
const MAX_EXTRA_PAGES = 4;
const MAX_CHARS_PER_PAGE = 8_000;

/** Error with an HTTP status the route can surface directly to the client. */
export class StartAnalysisError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "StartAnalysisError";
  }
}

/** Keywords that identify the most informative pages of a business site. */
const INTERESTING_PATHS =
  /sobre|about|quem-somos|servi|produt|product|service|pre[cç]o|price|plano|plan|contact|faq|ajuda|help/i;

const PROFILE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "Nome do negócio" },
    sector: { type: Type.STRING, description: "Setor/ramo de atividade" },
    description: {
      type: Type.STRING,
      description: "Descrição clara do negócio em 2-4 frases (o que faz, para quem, onde)",
    },
    targetAudience: { type: Type.STRING, description: "Público-alvo do negócio" },
    toneOfVoice: {
      type: Type.STRING,
      description: "Tom de voz da marca percebido no site (ex.: formal, jovem, premium, acolhedor)",
    },
    differentials: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Diferenciais competitivos do negócio",
    },
    offerings: {
      type: Type.ARRAY,
      description: "Produtos e serviços com preços quando visíveis",
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          price: { type: Type.STRING, description: "Preço como aparece no site, ou vazio se não visível" },
        },
        required: ["name", "description", "price"],
      },
    },
    faq: {
      type: Type.ARRAY,
      description: "Perguntas frequentes prováveis com respostas baseadas no site",
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          answer: { type: Type.STRING },
        },
        required: ["question", "answer"],
      },
    },
    qualificationGoals: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "4-6 informações que um agente de vendas deste negócio deve descobrir de cada lead (adaptadas ao setor)",
    },
  },
  required: [
    "name",
    "sector",
    "description",
    "targetAudience",
    "toneOfVoice",
    "differentials",
    "offerings",
    "faq",
    "qualificationGoals",
  ],
} as const;

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

// ─── SSRF protection ────────────────────────────────────────────────────────

function ipv4IsPrivate(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true; // fail closed
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 0 || // "this network"
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    a >= 224 // multicast + reserved
  );
}

function ipIsPrivate(addr: string): boolean {
  const ip = addr.toLowerCase();
  if (ip.includes(":")) {
    if (ip === "::" || ip === "::1") return true; // unspecified / loopback
    if (ip.startsWith("::ffff:")) return ipv4IsPrivate(ip.slice(7)); // IPv4-mapped
    // ULA (fc00::/7), link-local (fe80::/10), multicast (ff00::/8)
    return /^(fc|fd)/.test(ip) || /^fe[89ab]/.test(ip) || ip.startsWith("ff");
  }
  return ipv4IsPrivate(ip);
}

/**
 * Only public http(s) hosts on default ports are fetchable. Resolves DNS and
 * rejects when ANY address is private/loopback/link-local, so the analyzer
 * cannot be pointed at internal services or cloud metadata endpoints.
 */
async function assertPublicHttpUrl(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new StartAnalysisError("Só endereços http(s) são suportados", 400);
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new StartAnalysisError("Porta não permitida no endereço do site", 400);
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  let addresses;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new StartAnalysisError(
      "Não foi possível resolver o endereço do site. Confirma o URL.",
      400,
    );
  }
  if (addresses.length === 0 || addresses.some((a) => ipIsPrivate(a.address))) {
    throw new StartAnalysisError("Endereço não permitido", 400);
  }
}

/** fetch with manual redirects so every hop is re-validated against SSRF. */
async function safeFetch(startUrl: URL): Promise<Response | null> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHttpUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; BusinessProfileBot/1.0; +https://replit.com)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return res;
      current = new URL(location, current);
      continue;
    }
    return res;
  }
  return null; // too many redirects
}

/** Reads at most MAX_PAGE_BYTES of the body, protecting against huge pages. */
async function readBodyCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (total < MAX_PAGE_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
    total += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  return Buffer.concat(chunks).subarray(0, MAX_PAGE_BYTES).toString("utf8");
}

async function fetchPage(url: URL): Promise<string | null> {
  try {
    const res = await safeFetch(url);
    if (!res || !res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("text/html") && !type.includes("text/plain")) return null;
    return await readBodyCapped(res);
  } catch {
    return null;
  }
}

// ─── Content extraction ─────────────────────────────────────────────────────

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function extractInternalLinks(html: string, baseUrl: URL): URL[] {
  const links = new Map<string, URL>();
  const hrefRegex = /href\s*=\s*["']([^"'#]+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1]!;
    if (/^(mailto:|tel:|javascript:|data:)/i.test(href)) continue;
    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.origin !== baseUrl.origin) continue;
      if (!INTERESTING_PATHS.test(resolved.pathname)) continue;
      resolved.hash = "";
      resolved.search = "";
      if (resolved.pathname === baseUrl.pathname) continue;
      links.set(resolved.toString(), resolved);
    } catch {
      // ignore malformed URLs
    }
  }
  return [...links.values()].slice(0, MAX_EXTRA_PAGES);
}

/** Fetches the site's most informative pages and returns them as plain text. */
async function collectSiteContent(url: URL): Promise<string> {
  const homeHtml = await fetchPage(url);
  if (!homeHtml) {
    throw new Error(
      "Não foi possível aceder ao site. Confirma o endereço e tenta de novo.",
    );
  }

  const extraLinks = extractInternalLinks(homeHtml, url);
  const extraPages = await Promise.all(extraLinks.map((l) => fetchPage(l)));

  const sections: string[] = [
    `=== PÁGINA PRINCIPAL (${url}) ===\n${htmlToText(homeHtml).slice(0, MAX_CHARS_PER_PAGE)}`,
  ];
  extraLinks.forEach((link, i) => {
    const html = extraPages[i];
    if (html) {
      sections.push(`=== ${link} ===\n${htmlToText(html).slice(0, MAX_CHARS_PER_PAGE)}`);
    }
  });

  return sections.join("\n\n");
}

// ─── Gemini extraction ──────────────────────────────────────────────────────

function clampString(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/**
 * Clamps and validates raw AI output before it reaches the database, so the
 * profile (and the prompts derived from it) can never blow up in size.
 */
function sanitizeExtractedProfile(raw: unknown): UpdateBusinessProfile {
  const r = (raw ?? {}) as Record<string, unknown>;
  const asArray = (v: unknown) => (Array.isArray(v) ? v : []);
  const clamped = {
    name: clampString(r["name"], 200),
    sector: clampString(r["sector"], 200),
    description: clampString(r["description"], 4000),
    targetAudience: clampString(r["targetAudience"], 2000),
    toneOfVoice: clampString(r["toneOfVoice"], 1000),
    differentials: asArray(r["differentials"])
      .slice(0, 30)
      .map((d) => clampString(d, 500))
      .filter(Boolean),
    offerings: asArray(r["offerings"])
      .slice(0, 50)
      .map((o) => {
        const item = (o ?? {}) as Record<string, unknown>;
        return {
          name: clampString(item["name"], 200),
          description: clampString(item["description"], 1000),
          price: clampString(item["price"], 100),
        };
      })
      .filter((o) => o.name.length > 0),
    faq: asArray(r["faq"])
      .slice(0, 50)
      .map((f) => {
        const item = (f ?? {}) as Record<string, unknown>;
        return {
          question: clampString(item["question"], 300),
          answer: clampString(item["answer"], 1500),
        };
      })
      .filter((f) => f.question.length > 0),
    qualificationGoals: asArray(r["qualificationGoals"])
      .slice(0, 20)
      .map((g) => clampString(g, 500))
      .filter(Boolean),
  };
  return updateBusinessProfileSchema.parse(clamped);
}

async function extractProfileWithGemini(
  content: string,
  sourceLabel: string,
): Promise<UpdateBusinessProfile> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) throw new Error("GEMINI_API_KEY environment variable is required");

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: EXTRACTION_MODEL,
    contents: `Analisa ${sourceLabel} e extrai o perfil estruturado do negócio.
Escreve TODOS os campos em português. Sê fiel ao conteúdo: não inventes preços nem serviços que não existam.
Se uma informação não estiver presente, devolve string vazia ou lista vazia nesse campo.

CONTEÚDO:
${content}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: PROFILE_RESPONSE_SCHEMA,
    },
  });

  const text = response.text;
  if (!text) throw new Error("A análise não devolveu conteúdo");
  return sanitizeExtractedProfile(JSON.parse(text));
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Validates the URL (including SSRF checks) synchronously, atomically acquires
 * the analysis slot, then runs the crawl+extraction in the background while
 * the profile row tracks progress (running → done/error) for polling clients.
 */
export async function startSiteAnalysis(rawUrl: string, businessId?: number): Promise<void> {
  const normalized = normalizeUrl(rawUrl);
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new StartAnalysisError("Endereço inválido. Confirma o URL.", 400);
  }
  await assertPublicHttpUrl(url);

  const acquired = await tryAcquireAnalysis(url.toString(), businessId);
  if (!acquired) {
    throw new StartAnalysisError("Já existe uma análise em curso", 409);
  }

  void (async () => {
    try {
      const content = await collectSiteContent(url);
      const extracted = await extractProfileWithGemini(content, `o conteúdo do site ${url}`);
      await updateProfile(extracted, businessId);
      await setAnalysisStatus("done", undefined, businessId);
      logger.info({ url: url.toString() }, "Site analysis completed");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido na análise";
      logger.error({ err, url: url.toString() }, "Site analysis failed");
      await setAnalysisStatus("error", message, businessId).catch(() => {});
    }
  })();
}

/** Builds a profile from a free-form description (owner has no website). */
export async function assistFromDescription(
  description: string,
): Promise<UpdateBusinessProfile> {
  return extractProfileWithGemini(
    description,
    "a seguinte descrição do negócio feita pelo dono",
  );
}

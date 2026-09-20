import { createHash } from "node:crypto";
import type { TrafficCreativeMediaType, TrafficCreativePreparation } from "@workspace/db";

const MONEY = /\b(?:kz|kwanzas?)\s*[\d][\d\s.,]*|\b[\d][\d\s.,]*\s*(?:kz|kwanzas?)\b/gi;
const PHONE = /(?:\+?244|00244)?[\s().-]*9[1-5](?:[\s().-]*\d){7}\b/g;

export function trafficCreativeSourceHash(description: string, mediaType: TrafficCreativeMediaType): string {
  return createHash("sha256").update(`${mediaType}\n${description.normalize("NFC").trim()}`).digest("hex");
}

function cleanFact(line: string): string {
  return line.replace(/^[\s•*#💰📞☎️-]+/u, "").replace(PHONE, "[contacto protegido]").replace(/\s+/g, " ").trim();
}

/** Owner-authored creative copy is approved tenant data, but never authorizes phone disclosure or operational promises. */
export function prepareTrafficCreativeDescription(
  description: string,
  mediaType: TrafficCreativeMediaType,
  version: number,
): TrafficCreativePreparation {
  const normalized = description.normalize("NFC").trim();
  const hash = trafficCreativeSourceHash(normalized, mediaType);
  const rawLines = normalized.split(/\n+/).map(cleanFact).filter(Boolean);
  const approvedFacts = rawLines
    .filter((line) => !/\b(?:liga|telefone|telemóvel|telemovel|whatsapp|chama)\b/i.test(line))
    .slice(0, 30);
  const approvedPrices = Array.from(normalized.matchAll(MONEY), (match) => match[0].trim()).slice(0, 10);
  const lower = normalized.toLocaleLowerCase("pt-AO");
  const highValue = /\b(im[oó]vel|casa|terreno|apartamento|t[1-9]|viatura|carro)\b/i.test(lower);
  const service = /\b(servi[cç]o|or[cç]amento|consult|projecto|projeto|obra)\b/i.test(lower);
  const missingResources: TrafficCreativePreparation["missingResources"] = [];
  if (/\b(foto|fotos|imagem|imagens)\b/i.test(lower) && /\b(mando|envio|partilho|disponibilizo|chama)\b/i.test(lower)) {
    missingResources.push({
      kind: "image",
      purpose: "traffic_creative_gallery",
      request: "Adiciona as fotos prometidas neste anúncio para a equipa virtual poder mostrá-las sem prometer um envio futuro.",
    });
  }
  if (/\b(v[ií]deo|videos|vídeos)\b/i.test(lower) && /\b(mando|envio|partilho|disponibilizo|chama)\b/i.test(lower)) {
    missingResources.push({
      kind: "video",
      purpose: "traffic_creative_video",
      request: "Adiciona o vídeo prometido neste anúncio para a equipa virtual poder partilhá-lo apenas depois de aprovado.",
    });
  }
  const likelyQuestions = [
    ...(approvedPrices.length ? ["Qual é o preço e o que está incluído?"] : ["Qual é o preço ou condição comercial?"]),
    ...(highValue ? ["Qual é a localização exacta e como pedir uma visita?", "Quais são as características principais?"] : []),
    ...(!highValue && !service ? ["Que opções estão disponíveis e qual é a mais indicada?"] : []),
    ...((/\bnegoci[aá]vel\b/i.test(lower)) ? ["Que condições de negociação estão autorizadas?"] : []),
  ].slice(0, 6);
  return {
    version,
    sourceHash: hash,
    summary: approvedFacts.slice(0, 4).join(" ").slice(0, 1200) || "Anúncio do negócio sem factos textuais adicionais.",
    objective: highValue ? "visit_request" : service ? "quote" : "purchase",
    approvedFacts,
    approvedPrices,
    likelyQuestions,
    responseGuidance: [
      "Responder primeiro com os factos aprovados deste anúncio.",
      "Não revelar o número escrito no anúncio; usar apenas o encaminhamento seguro da aplicação.",
      "Não prometer fotos, vídeos, visita ou negociação que ainda não estejam confirmados como recurso ou capacidade.",
    ],
    missingResources,
  };
}
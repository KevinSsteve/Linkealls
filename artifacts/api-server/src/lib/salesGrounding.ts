export interface GroundingFacts {
  approvedPrices?: string[];
  approvedPhones?: string[];
  approvedAvailability?: string[];
  approvedPromises?: string[];
}

const PHONE = /(?:\+?244[\s.-]?)?9[1-5](?:[\s.-]?\d){7}\b/g;
const MONEY = /\b(?:kz|kwanzas?)\s*[\d][\d\s.,]*|\b[\d][\d\s.,]*\s*(?:kz|kwanzas?)\b/gi;
const UNSUPPORTED = /\b(?:vou|iremos|vamos|o proprietário|o dono|a equipa)\s+(?:enviar|mandar|partilhar|disponibilizar|confirmar|garantir|reservar|marcar|entregar|dar)\b[^.!?;]{0,180}[.!?]?|(?:já pedi|ja pedi|vou encaminhar|posso encaminhar|a equipa vai enviar|a equipa enviará)[^.!?;]{0,180}[.!?]?/gi;
const CLAIMS = /\b(?:disponível|disponibilidade|garantido|garantia|desconto|promoção|marcação confirmada|visita confirmada|entrega confirmada|reserva confirmada)\b[^.!?;]{0,100}[.!?]?/gi;

function normalize(value: string): string {
  return value.toLocaleLowerCase("pt-AO").replace(/\s+/g, " ").trim();
}

function numericPrice(value: string): string {
  return value.replace(/[^\d]/g, "");
}

/** Last-mile defense: model output is never trusted as a business fact. */
export function sanitizeGroundedText(value: string, facts: GroundingFacts = {}): string {
  let text = value.normalize("NFC").replace(PHONE, "[contacto protegido]");
  const prices = new Set((facts.approvedPrices ?? []).map(numericPrice).filter(Boolean));
  text = text.replace(MONEY, (candidate) =>
    prices.has(numericPrice(candidate)) ? candidate : "[valor a confirmar]",
  );
  const approved = (facts.approvedPromises ?? []).map(normalize);
  text = text.replace(UNSUPPORTED, (candidate) =>
    approved.some((item) => normalize(candidate).includes(item)) ? candidate : "Não tenho essa confirmação no contexto."
  );
  const avail = (facts.approvedAvailability ?? []).map(normalize);
  text = text.replace(CLAIMS, (candidate) =>
    avail.some((item) => normalize(candidate).includes(item)) ? candidate : "essa informação precisa de confirmação da equipa"
  );
  return text.replace(/\s{2,}/g, " ").trim().slice(0, 1600);
}
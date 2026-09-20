const PHONE_CANDIDATE = /(?:\+?244|00244)?[\s().-]*9[1-5](?:[\s().-]*\d){7}\b/g;

export function normalizeAngolanMobilePhone(value: string): string | null {
  const digits = value.trim().replace(/\D/g, "").replace(/^00/, "");
  const local = digits.startsWith("244") ? digits.slice(3) : digits;
  return /^9[1-5]\d{7}$/.test(local) ? `+244${local}` : null;
}

export function extractAngolanMobilePhone(value: string): string | null {
  const candidate = value.match(PHONE_CANDIDATE)?.[0];
  return candidate ? normalizeAngolanMobilePhone(candidate) : null;
}

export function isContactRefusal(value: string): boolean {
  return /\b(?:agora não|agora nao|não quero partilhar|nao quero partilhar|não vou partilhar|nao vou partilhar|prefiro não|prefiro nao|sem whatsapp|continuar sem partilhar)\b/i.test(value);
}

export function redactAngolanPhoneCandidates(value: string): string {
  return value.replace(PHONE_CANDIDATE, "[telefone omitido — requer autorização]");
}
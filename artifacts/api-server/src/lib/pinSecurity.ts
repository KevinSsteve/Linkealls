import { createHash, randomBytes, scrypt, timingSafeEqual } from "crypto";

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
const LEGACY_SHA256_RE = /^[a-f0-9]{64}$/i;

function derivePin(pin: string, salt: Buffer, n = SCRYPT_N, r = SCRYPT_R, p = SCRYPT_P): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(pin, salt, KEY_LENGTH, { N: n, r, p, maxmem: 32 * 1024 * 1024 }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derivePin(pin, salt);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPin(
  pin: string,
  storedHash: string | null | undefined,
): Promise<{ valid: boolean; needsUpgrade: boolean }> {
  if (!storedHash) return { valid: false, needsUpgrade: false };

  if (LEGACY_SHA256_RE.test(storedHash)) {
    const legacy = createHash("sha256").update(pin).digest("hex");
    const valid = timingSafeEqual(Buffer.from(legacy, "hex"), Buffer.from(storedHash, "hex"));
    return { valid, needsUpgrade: valid };
  }

  const [scheme, nRaw, rRaw, pRaw, saltHex, keyHex] = storedHash.split("$");
  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (
    scheme !== "scrypt" ||
    !Number.isInteger(n) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    !saltHex ||
    !keyHex
  ) {
    return { valid: false, needsUpgrade: false };
  }

  try {
    const expected = Buffer.from(keyHex, "hex");
    const actual = await derivePin(pin, Buffer.from(saltHex, "hex"), n, r, p);
    const valid = expected.length === actual.length && timingSafeEqual(expected, actual);
    const needsUpgrade = valid && (n !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P);
    return { valid, needsUpgrade };
  } catch {
    return { valid: false, needsUpgrade: false };
  }
}
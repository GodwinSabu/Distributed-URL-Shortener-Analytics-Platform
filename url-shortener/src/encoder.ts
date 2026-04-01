// Characters: 0-9, a-z, A-Z  →  62 total
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const BASE = BigInt(ALPHABET.length); // 62n

/**
 * Encode a numeric ID (from Postgres auto-increment) into a short Base62 string.
 * ID 1 → "1", ID 3844 → "100", ID 1_000_000 → "4c92"
 */
export function encode(id: number | bigint): string {
  let num = BigInt(id);
  if (num === 0n) return ALPHABET[0];

  let result = "";
  while (num > 0n) {
    result = ALPHABET[Number(num % BASE)] + result;
    num = num / BASE;
  }
  return result;
}

/**
 * Decode a Base62 short code back to the numeric ID.
 */
export function decode(code: string): number {
  let result = 0n;
  for (const char of code) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`Invalid character in short code: ${char}`);
    result = result * BASE + BigInt(index);
  }
  return Number(result);
}

/**
 * Generate a random short code (for custom aliases or fallback).
 * Default length: 7 characters → 62^7 = 3.5 trillion possibilities
 */
export function randomCode(length = 7): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}
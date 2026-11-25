import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { RECOVERY_CODE_ALPHABET, RECOVERY_CODE_LENGTH } from "@guago/shared";
import { type Algorithm, hash, verify } from "@node-rs/argon2";

/** `Algorithm.Argon2id`; the package's enum is `const` and cannot be read at runtime here. */
const ARGON2ID: Algorithm.Argon2id = 2;

/** PLAN §19: Argon2id, m = 19 MiB, t = 2, p = 1. */
const ARGON2 = {
  algorithm: ARGON2ID,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

export function hashSecret(secret: string): Promise<string> {
  return hash(secret, ARGON2);
}

/** Constant-time inside Argon2. A malformed stored hash counts as a mismatch. */
export async function verifySecret(stored: string, secret: string): Promise<boolean> {
  try {
    return await verify(stored, secret);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;
/** A real hash to verify against when the account does not exist, so both paths cost the same. */
export function dummyHash(): Promise<string> {
  dummy ??= hashSecret(randomBytes(16).toString("hex"));
  return dummy;
}

/** A 256-bit session token for the cookie, and the hash stored in its place. */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sessionTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** 16 characters from a 32-letter alphabet (80 bits), shown as XXXX-XXXX-XXXX-XXXX. */
export function newRecoveryCode(): { code: string; display: string } {
  let code = "";
  for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) {
    code += RECOVERY_CODE_ALPHABET[randomInt(RECOVERY_CODE_ALPHABET.length)];
  }
  return { code, display: code.match(/.{4}/g)?.join("-") ?? code };
}

/** Keyed hash of a client IP: lets limits count per IP without storing the address. */
export function ipHash(ip: string, key: string): string {
  return createHmac("sha256", key).update(ip).digest("hex");
}

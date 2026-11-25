import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
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

// Hashing slots -------------------------------------------------------------------------------

/**
 * Argon2 runs on libuv's pool (4 threads by default), which file and DNS work share. At most
 * this many hashes run at once and this many wait; anything past that is refused at once.
 */
export const MAX_HASHING = 2;
export const MAX_HASH_WAITING = 32;

export class HashBusy extends Error {
  constructor() {
    super("hashing is saturated");
  }
}

let running = 0;
const waiting: (() => void)[] = [];

/** Hashes started since boot; lets tests prove a refused request did no Argon2 work. */
export const hashingStats = { started: 0 };

async function withSlot<T>(work: () => Promise<T>): Promise<T> {
  if (running >= MAX_HASHING) {
    if (waiting.length >= MAX_HASH_WAITING) throw new HashBusy();
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else {
    running++;
  }
  hashingStats.started++;
  try {
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else running--;
  }
}

export function hashSecret(secret: string): Promise<string> {
  return withSlot(() => hash(secret, ARGON2));
}

/** Constant-time inside Argon2. A malformed stored hash counts as a mismatch. */
export function verifySecret(stored: string, secret: string): Promise<boolean> {
  return withSlot(async () => {
    try {
      return await verify(stored, secret);
    } catch {
      return false;
    }
  });
}

let dummy: Promise<string> | undefined;
/** A real hash to verify against when the account does not exist, so both paths cost the same. */
export function dummyHash(): Promise<string> {
  dummy ??= hash(randomBytes(16).toString("hex"), ARGON2);
  return dummy;
}

// Tokens --------------------------------------------------------------------------------------

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

const hmac = (secret: string, purpose: string, value: string) =>
  createHmac("sha256", secret).update(`${purpose}\0${value}`).digest();

/** Keyed hash of a client IP: lets limits count per IP without storing the address. */
export function ipHash(ip: string, secret: string): string {
  return hmac(secret, "ip", ipKey(ip)).toString("hex");
}

/**
 * What one address counts as: an IPv4 address itself (also when written IPv4-mapped), an IPv6
 * address by its /64, the network one home or phone holds while its privacy addresses rotate.
 */
export function ipKey(ip: string): string {
  const raw = ip
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/%.*$/, "");
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(raw);
  if (mapped?.[1]) return mapped[1];
  if (!raw.includes(":")) return raw;
  const [head = "", tail] = raw.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups =
    tail === undefined
      ? left
      : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  if (groups.length !== 8) return raw;
  return `${groups
    .slice(0, 4)
    .map((g) => (Number.parseInt(g || "0", 16) || 0).toString(16))
    .join(":")}::/64`;
}

/**
 * A device cookie, set after a successful login and bound to that login id. It gives the device
 * its own failure counter, so a lockout on a shared IP does not lock the owner out.
 */
export function newDeviceToken(loginId: string, secret: string): string {
  const id = randomBytes(16).toString("base64url");
  return `${id}.${hmac(secret, "device", `${loginId}\0${id}`).toString("base64url")}`;
}

/** The device's counter key when the token is genuine and bound to `loginId`, else null. */
export function deviceSource(token: string | undefined, loginId: string, secret: string) {
  const [id, mac] = token?.split(".") ?? [];
  if (!id || !mac || id.length > 32) return null;
  const expected = hmac(secret, "device", `${loginId}\0${id}`);
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return `device:${hmac(secret, "device-key", id).toString("hex")}`;
}

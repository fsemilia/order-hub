import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for secrets stored in the database (per-store webhook signing secrets).
 *
 * Format: "v1.<iv>.<authTag>.<ciphertext>" (base64url parts). The version prefix allows key or
 * algorithm rotation later. GCM authenticates the ciphertext: tampering makes decryption throw.
 * The key (STORE_SECRETS_KEY) is 32 random bytes, base64-encoded: `openssl rand -base64 32`.
 */
const VERSION = "v1";

function parseKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) throw new Error("STORE_SECRETS_KEY must be 32 bytes, base64-encoded");
  return key;
}

export function encryptSecret(plaintext: string, keyBase64: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", parseKey(keyBase64), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function decryptSecret(payload: string, keyBase64: string): string {
  const [version, iv, tag, ciphertext] = payload.split(".");
  if (version !== VERSION || !iv || !tag || !ciphertext)
    throw new Error("Malformed secret payload");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    parseKey(keyBase64),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

const KEY = randomBytes(32).toString("base64");

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a secret", () => {
    const secret = "1e22651995aaa90295651003ecd0fc35";
    expect(decryptSecret(encryptSecret(secret, KEY), KEY)).toBe(secret);
  });

  it("never stores the plaintext and uses a fresh IV every time", () => {
    const a = encryptSecret("same", KEY);
    const b = encryptSecret("same", KEY);
    expect(a).not.toContain("same");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
  });

  it("fails with the wrong key", () => {
    const other = randomBytes(32).toString("base64");
    expect(() => decryptSecret(encryptSecret("x", KEY), other)).toThrow();
  });

  it("detects tampering (GCM auth tag)", () => {
    const [v, iv, tag, ct] = encryptSecret("secret", KEY).split(".");
    const flipped = Buffer.from(ct!, "base64url");
    flipped[0] = flipped[0]! ^ 1;
    expect(() =>
      decryptSecret([v, iv, tag, flipped.toString("base64url")].join("."), KEY),
    ).toThrow();
  });

  it("rejects keys that are not 32 bytes", () => {
    expect(() => encryptSecret("x", Buffer.from("short").toString("base64"))).toThrow(/32 bytes/);
  });
});

import { describe, expect, it } from "vitest";
import { isAuthLoadFailure } from "../../scripts/shopify/admin";

describe("isAuthLoadFailure", () => {
  it("recognizes the CLI failing while loading the stored token (safe to retry)", () => {
    const out =
      '{"type":"progress","status":"started","operation":"x","message":"Loading stored store auth"}\n' +
      '{"type":"progress","timestamp":"2026-11-10T20:44:53Z","status":"failed","operation":"x","message":"Loading stored store auth"}';
    expect(isAuthLoadFailure(out)).toBe(true);
  });

  it("does not retry other failures (the operation may have run)", () => {
    expect(isAuthLoadFailure('{"status":"failed","message":"Executing GraphQL operation"}')).toBe(
      false,
    );
  });
});

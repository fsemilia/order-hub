import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  isAuthLoadFailure,
  isGraphQLError,
  ShopifyGraphQLError,
} from "../../scripts/shopify/admin";

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

describe("ShopifyGraphQLError", () => {
  // Real CLI output: orderCreate called with the online token from `shopify store auth`
  const output = readFileSync("tests/fixtures/shopify-cli-offline-token-error.json", "utf8");

  it("is a deterministic error (not retried) and exposes Shopify's message", () => {
    expect(isGraphQLError(output)).toBe(true);
    const e = new ShopifyGraphQLError(output);
    expect(e.message).toMatch(/^Access denied for orderCreate field/);
    expect(e.needsOfflineToken).toBe(true);
  });

  it("a CLI timeout is not a GraphQL error", () => {
    const timeout =
      '{"type":"progress","status":"failed","operation":"x","message":"Executing GraphQL operation"}';
    expect(isGraphQLError(timeout)).toBe(false);
  });
});

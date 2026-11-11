import { describe, expect, it } from "vitest";
import { apiKeySchema, credentialId, pickAgentKey } from "@/lib/agent/credentials";

const OWNER = { ownerKey: "sk-ant-owner", ownerEmails: ["owner@example.com"] };

describe("pickAgentKey", () => {
  it("uses the user's own key first, even for the owner", () => {
    expect(pickAgentKey("owner@example.com", "sk-ant-mine", OWNER)).toEqual({
      source: "user",
      apiKey: "sk-ant-mine",
    });
  });

  it("gives the operator key only to owner emails (case-insensitive)", () => {
    expect(pickAgentKey(" Owner@Example.com ", null, OWNER)).toEqual({
      source: "owner",
      apiKey: "sk-ant-owner",
    });
  });

  it("never gives the operator key to anyone else, including the demo user", () => {
    expect(pickAgentKey("demo@orderhub.dev", null, OWNER)).toBeNull();
  });

  it("never gives the operator key to the shared demo account, even if listed as owner", () => {
    const misconfigured = {
      ...OWNER,
      ownerEmails: ["demo@orderhub.dev"],
      demoEmail: "demo@orderhub.dev",
    };
    expect(pickAgentKey("Demo@OrderHub.dev", null, misconfigured)).toBeNull();
    // Their own key still works
    expect(pickAgentKey("demo@orderhub.dev", "sk-ant-mine", misconfigured)?.source).toBe("user");
  });

  it("returns null for owners when no operator key is configured", () => {
    expect(pickAgentKey("owner@example.com", null, { ownerEmails: OWNER.ownerEmails })).toBeNull();
  });
});

describe("credentialId", () => {
  const user = { id: "u1", email: "demo@orderhub.dev", sessionId: "s1" };

  it("is per session on shared accounts and per user otherwise", () => {
    expect(credentialId(user, true)).toBe("session:s1");
    expect(credentialId(user, false)).toBe("user:u1");
  });
});

describe("apiKeySchema", () => {
  it("accepts an Anthropic key and trims it", () => {
    const key = `sk-ant-api03-${"a".repeat(40)}`;
    expect(apiKeySchema.parse(`  ${key}\n`)).toBe(key);
  });

  it.each(["", "sk-ant-short", "sk-proj-" + "a".repeat(40), "sk-ant-" + "a".repeat(30) + " x"])(
    "rejects %j",
    (value) => {
      expect(apiKeySchema.safeParse(value).success).toBe(false);
    },
  );
});

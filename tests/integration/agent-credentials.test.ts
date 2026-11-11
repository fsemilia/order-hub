import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteUserAgentKey,
  getAgentKeyStatus,
  resolveAgentKey,
  saveUserAgentKey,
  type KeyOwner,
} from "@/lib/agent/credentials";
import { runAgent } from "@/lib/agent/run";
import { getDictionary } from "@/lib/i18n";
import { createTestStore, prisma, resetDb } from "../support/db";

// Same values as the integration env in vitest.config.mts
const OWNER_KEY = "sk-ant-test-operator-key-0000000000";
const OWNER_EMAIL = "owner@example.com";
const DEMO_EMAIL = "demo@example.com";
const USER_KEY = `sk-ant-api03-${"x".repeat(40)}WXYZ`;
const errors = getDictionary("en").agent.errors;

async function createUser(email: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, name: email, email } });
  return id;
}

/** A sign-in: one session row for the user, like Better Auth creates. */
async function signIn(userId: string, email: string): Promise<KeyOwner> {
  const sessionId = randomUUID();
  await prisma.session.create({
    data: {
      id: sessionId,
      userId,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  return { id: userId, email, sessionId };
}

let owner: KeyOwner;
let other: KeyOwner;
let demoUserId: string;

beforeEach(async () => {
  await resetDb();
  await prisma.user.deleteMany({
    where: { email: { in: [OWNER_EMAIL, "other@example.com", DEMO_EMAIL] } },
  });
  owner = await signIn(await createUser(OWNER_EMAIL), OWNER_EMAIL);
  other = await signIn(await createUser("other@example.com"), "other@example.com");
  demoUserId = await createUser(DEMO_EMAIL);
});

afterEach(() => vi.restoreAllMocks());

describe("agent credentials (bring your own key)", () => {
  it("a non-owner without a key gets nothing: the operator key is never shared", async () => {
    expect(await resolveAgentKey(other)).toEqual({ ok: false, reason: "none" });
    expect(await getAgentKeyStatus(other)).toEqual({ source: "none", perSession: false });
  });

  it("the owner falls back to the operator key", async () => {
    expect(await resolveAgentKey(owner)).toEqual({ ok: true, source: "owner", apiKey: OWNER_KEY });
    expect(await getAgentKeyStatus(owner)).toEqual({ source: "owner" });
  });

  it("stores the user's key encrypted, exposes only the last 4 chars, and uses it", async () => {
    await saveUserAgentKey(other, USER_KEY);

    const row = await prisma.agentCredential.findUniqueOrThrow({
      where: { id: `user:${other.id}` },
    });
    expect(row.apiKeyEnc).not.toContain(USER_KEY);
    expect(row.apiKeyEnc.startsWith("v1.")).toBe(true);
    expect(row.keyHint).toBe("WXYZ");
    expect(row.sessionId).toBeNull();

    expect(await getAgentKeyStatus(other)).toEqual({
      source: "user",
      hint: "WXYZ",
      perSession: false,
    });
    expect(await resolveAgentKey(other)).toEqual({ ok: true, source: "user", apiKey: USER_KEY });
    // Keys are per user: someone else's key never leaks to another account
    expect(await resolveAgentKey(owner)).toEqual({ ok: true, source: "owner", apiKey: OWNER_KEY });
    // A regular user's key survives a new sign-in
    const again = await signIn(other.id, other.email);
    expect(await resolveAgentKey(again)).toEqual({ ok: true, source: "user", apiKey: USER_KEY });
  });

  it("replacing and removing the key", async () => {
    await saveUserAgentKey(owner, USER_KEY);
    const replacement = `sk-ant-api03-${"y".repeat(40)}ABCD`;
    await saveUserAgentKey(owner, replacement);
    expect(await resolveAgentKey(owner)).toEqual({
      ok: true,
      source: "user",
      apiKey: replacement,
    });

    await deleteUserAgentKey(owner);
    expect(await prisma.agentCredential.count()).toBe(0);
    expect(await resolveAgentKey(owner)).toEqual({ ok: true, source: "owner", apiKey: OWNER_KEY });
  });

  it("deleting the user deletes the key", async () => {
    await saveUserAgentKey(other, USER_KEY);
    await prisma.user.delete({ where: { id: other.id } });
    expect(await prisma.agentCredential.count()).toBe(0);
  });

  it("an unreadable stored key is reported, never silently replaced by another key", async () => {
    await saveUserAgentKey(owner, USER_KEY);
    await prisma.agentCredential.update({
      where: { id: `user:${owner.id}` },
      data: { apiKeyEnc: "v1.AAAA.BBBB.CCCC" },
    });
    expect(await resolveAgentKey(owner)).toEqual({ ok: false, reason: "unreadable" });
  });
});

describe("shared demo account", () => {
  it("binds the key to the session: the next visitor never sees or uses it", async () => {
    const visitorA = await signIn(demoUserId, DEMO_EMAIL);
    const visitorB = await signIn(demoUserId, DEMO_EMAIL);

    await saveUserAgentKey(visitorA, USER_KEY);
    expect(await getAgentKeyStatus(visitorA)).toEqual({
      source: "user",
      hint: "WXYZ",
      perSession: true,
    });
    expect(await resolveAgentKey(visitorA)).toEqual({
      ok: true,
      source: "user",
      apiKey: USER_KEY,
    });

    expect(await getAgentKeyStatus(visitorB)).toEqual({ source: "none", perSession: true });
    expect(await resolveAgentKey(visitorB)).toEqual({ ok: false, reason: "none" });
    // B removing "their" key cannot touch A's
    await deleteUserAgentKey(visitorB);
    expect(await prisma.agentCredential.count()).toBe(1);
  });

  it("signing out (session deleted) deletes the key", async () => {
    const visitor = await signIn(demoUserId, DEMO_EMAIL);
    await saveUserAgentKey(visitor, USER_KEY);
    await prisma.session.delete({ where: { id: visitor.sessionId } });
    expect(await prisma.agentCredential.count()).toBe(0);
  });
});

describe("runAgent with the real environment", () => {
  it("refuses a non-owner without a key before any API call or run is recorded", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const store = await createTestStore();
    const result = await runAgent("Which customers are at risk?", {
      user: other,
      store: { ...store },
      locale: "en",
    });
    expect(result).toEqual({ ok: false, error: errors.noKey });
    expect(await prisma.agentRun.count()).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a demo visitor without a key (the operator key is never theirs)", async () => {
    const store = await createTestStore();
    const visitor = await signIn(demoUserId, DEMO_EMAIL);
    const result = await runAgent("Which customers are at risk?", {
      user: visitor,
      store,
      locale: "en",
    });
    expect(result).toEqual({ ok: false, error: errors.noKey });
    expect(await prisma.agentRun.count()).toBe(0);
  });

  it("asks to re-enter an unreadable key", async () => {
    const store = await createTestStore();
    await saveUserAgentKey(other, USER_KEY);
    await prisma.agentCredential.update({
      where: { id: `user:${other.id}` },
      data: { apiKeyEnc: "v1.AAAA.BBBB.CCCC" },
    });
    const result = await runAgent("Which customers are at risk?", {
      user: other,
      store,
      locale: "en",
    });
    expect(result).toEqual({ ok: false, error: errors.keyUnreadable });
  });
});

describe("daily quota", () => {
  it("counts only runs paid with the operator key", async () => {
    const { remainingQuota } = await import("@/lib/agent/run");
    const limit = await remainingQuota(owner.id);
    await prisma.agentRun.createMany({
      data: [
        { userId: owner.id, question: "q1", keySource: "user" },
        { userId: owner.id, question: "q2", keySource: "user" },
        { userId: owner.id, question: "q3", keySource: "owner" },
      ],
    });
    expect(await remainingQuota(owner.id)).toBe(limit - 1);
  });
});

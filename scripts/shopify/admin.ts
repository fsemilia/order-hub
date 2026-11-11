/**
 * Thin wrapper around `shopify store execute` (Shopify CLI): runs Admin GraphQL against a store
 * with the token stored by `shopify store auth`. No token ever passes through this repo.
 *
 * Uses a globally installed `shopify` if present, otherwise a pinned `npx @shopify/cli`.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Pinned so the script behaves the same on every machine; override with SHOPIFY_CLI_VERSION.
const CLI_VERSION = "5.0.1";
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-10";

function cli(): [string, string[]] {
  try {
    execFileSync("shopify", ["version"], { stdio: "ignore" });
    return ["shopify", []];
  } catch {
    return ["npx", ["-y", `@shopify/cli@${process.env.SHOPIFY_CLI_VERSION || CLI_VERSION}`]];
  }
}

export type GraphQLResult<T> = { data: T; extensions?: unknown };

export function createAdmin(store: string) {
  const [bin, prefix] = cli();
  const dir = mkdtempSync(join(tmpdir(), "order-hub-shopify-"));
  let n = 0;

  /**
   * Runs one Admin GraphQL operation through the CLI, with retries. The CLI sometimes hangs and
   * gives up after 30 s (seen in practice), and then we cannot know whether a mutation ran:
   * - auth-loading failures happen before the operation: always safe to retry;
   * - queries and `idempotent` mutations are retried;
   * - other mutations must pass `recover`, which checks on Shopify whether the write happened
   *   and returns its result (no retry, no duplicate) or null (not applied: retry).
   */
  function execute<T>(
    query: string,
    variables: unknown = {},
    opts: { mutation?: boolean; idempotent?: boolean; recover?: () => T | null } = {},
  ): T {
    const q = join(dir, `q${++n}.graphql`);
    const v = join(dir, `v${n}.json`);
    writeFileSync(q, query);
    writeFileSync(v, JSON.stringify(variables));
    const args = [
      ...prefix,
      "store",
      "execute",
      "--store",
      store,
      "--query-file",
      q,
      "--variable-file",
      v,
      "--version",
      API_VERSION,
      "--json",
      "--no-input",
      "--no-color",
      ...(opts.mutation ? ["--allow-mutations"] : []),
    ];
    const ATTEMPTS = 4;
    for (let attempt = 1; ; attempt++) {
      let detail: string;
      try {
        const out = execFileSync(bin, args, {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
        // The CLI may print notices before the JSON document: parse from the first "{".
        return (JSON.parse(out.slice(out.indexOf("{"))) as GraphQLResult<T>).data;
      } catch (e) {
        const err = e as { stderr?: string; stdout?: string };
        // stdout carries the GraphQL error document, stderr the progress events: keep both.
        detail = [err.stdout, err.stderr].filter(Boolean).join("\n") || String(e);
      }
      // A GraphQL error (access denied, invalid input…) is deterministic: never retry it.
      if (isGraphQLError(detail)) throw new ShopifyGraphQLError(detail);
      if (attempt >= ATTEMPTS) {
        throw new Error(
          `shopify store execute failed ${ATTEMPTS} times:\n${detail}\n` +
            `If it is an auth error, run: shopify store auth --store ${store} --scopes <scopes>`,
        );
      }
      const authOnly = isAuthLoadFailure(detail);
      if (!authOnly && opts.mutation && !opts.idempotent) {
        if (!opts.recover) throw new Error(`shopify store execute failed:\n${detail}`);
        sleepSync(3_000); // give Shopify a moment to make a just-applied write visible
        const recovered = opts.recover();
        if (recovered !== null) {
          console.warn("  … Shopify CLI timed out, but the write was applied: continuing");
          return recovered;
        }
      }
      console.warn(
        `  … Shopify CLI ${authOnly ? "could not load the stored auth" : "did not answer"}, retrying (${attempt}/${ATTEMPTS - 1})`,
      );
      sleepSync(5_000 * attempt);
    }
  }

  return { execute, dispose: () => rmSync(dir, { recursive: true, force: true }) };
}

export type Admin = ReturnType<typeof createAdmin>;

export function assertNoUserErrors(
  label: string,
  errors: { field?: string[] | null; message: string }[] | undefined,
) {
  if (errors && errors.length > 0) {
    throw new Error(
      `${label}: ${errors.map((e) => `${e.field?.join(".") ?? ""} ${e.message}`).join("; ")}`,
    );
  }
}

/** Shopify answered with a GraphQL error (as opposed to the CLI timing out). */
export function isGraphQLError(output: string) {
  return /GraphQL operation failed|"errors":\s*\[|ACCESS_DENIED/.test(output);
}

export class ShopifyGraphQLError extends Error {
  constructor(public readonly detail: string) {
    // The first GraphQL error message (the one followed by "locations"), compact or pretty JSON
    const m = /"message"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"locations"/.exec(detail);
    super(m ? JSON.parse(`"${m[1]}"`) : detail.slice(0, 500));
  }
  /** orderCreate is only available to apps with offline tokens (not `shopify store auth`). */
  get needsOfflineToken() {
    return /offline tokens/i.test(this.detail);
  }
}

/** True when the CLI failed while loading the stored token, i.e. before running the operation. */
export function isAuthLoadFailure(output: string) {
  return /"status":"failed"[^\n]*"message":"Loading stored store auth"/.test(output);
}

export function sleepSync(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

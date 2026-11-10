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

  function execute<T>(
    query: string,
    variables: unknown = {},
    opts: { mutation?: boolean } = {},
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
    let out: string;
    try {
      out = execFileSync(bin, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      const err = e as { stderr?: string; stdout?: string };
      throw new Error(
        `shopify store execute failed:\n${err.stderr || err.stdout || String(e)}\n` +
          `Did you run: shopify store auth --store ${store} --scopes <scopes> ?`,
      );
    }
    // The CLI may print notices before the JSON document: parse from the first "{".
    const json = JSON.parse(out.slice(out.indexOf("{"))) as GraphQLResult<T>;
    return json.data;
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

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

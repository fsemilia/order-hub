import { describe, expect, it } from "vitest";
import { pgConfig, SUPABASE_ROOT_CA } from "@/lib/db-adapter";

describe("pgConfig", () => {
  it("leaves non-Supabase URLs untouched", () => {
    const url = "postgres://u:p@localhost:51214/db?sslmode=disable";
    expect(pgConfig(url, 1)).toEqual({ connectionString: url, max: 1 });
  });

  it("pins the Supabase CA with full verification and drops sslmode from the URL", () => {
    const cfg = pgConfig(
      "postgresql://postgres.ref:secret@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require",
    );
    expect(cfg.connectionString).not.toContain("sslmode");
    expect(cfg.ssl).toEqual({ ca: SUPABASE_ROOT_CA, rejectUnauthorized: true });
    expect(cfg.max).toBe(5);
  });

  it("embeds a PEM certificate", () => {
    expect(SUPABASE_ROOT_CA).toMatch(
      /^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----$/,
    );
  });
});

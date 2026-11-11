import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * Data Access Layer for authentication.
 *
 * proxy.ts only does an optimistic cookie check (cheap, no DB). The real authorization
 * happens here, close to the data: every Server Component, Server Action and Route Handler
 * that touches customer data calls `requireUser()`.
 */
export const getCurrentUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, email, image } = session.user;
  // sessionId scopes per-session data on shared logins (the demo user's agent key).
  return { id, name, email, image, sessionId: session.session.id };
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

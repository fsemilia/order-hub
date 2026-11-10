import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_COOKIE,
  safePath,
  splitLocalePrefix,
} from "@/lib/i18n/config";

const ONE_YEAR = 60 * 60 * 24 * 365;


/**
 * 1. Locale. URLs have no locale prefix (/customers). The UI language comes from the oh_locale
 *    cookie (default English) and the request is REWRITTEN to /<locale>/customers, the [locale]
 *    root segment. Visiting /it/customers once sets the cookie and redirects to /customers,
 *    so a link can still pick the language.
 * 2. Optimistic auth check: no session cookie -> /login. It does NOT validate the session (no DB
 *    here): requireUser() in lib/session.ts does, next to the data. A forged cookie gets past
 *    this, never past the DAL.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const prefixed = splitLocalePrefix(pathname);
  if (prefixed) {
    // Same origin by construction: only the pathname changes (no "//evil.com" open redirect).
    const url = request.nextUrl.clone();
    url.pathname = safePath(prefixed.rest);
    url.search = search;
    const res = NextResponse.redirect(url);
    res.cookies.set(LOCALE_COOKIE, prefixed.locale, { path: "/", maxAge: ONE_YEAR, sameSite: "lax" });
    return res;
  }

  // Only page navigations are redirected. A Server Action is a POST to the current URL: redirecting
  // it (e.g. the post-login action on /login, sent right after the session cookie is set) would
  // land it on a route that does not own the action. Actions authorize themselves (requireUser).
  const isNavigation = request.method === "GET" || request.method === "HEAD";
  const hasSession = Boolean(getSessionCookie(request));
  if (isNavigation && !hasSession && pathname !== "/login") {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (isNavigation && hasSession && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookie) ? cookie : DEFAULT_LOCALE;
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Everything except API routes (webhooks/auth/health have their own auth), static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};

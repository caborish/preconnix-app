// Links that open the app (Expo Router native intent). On Android the email sign-in returns to the app with
// `preconnix:///auth?code=…`; the sign-in code in core/auth.ts handles it, so the router must not treat it as a page
// (that showed "Unmatched Route", 5 Nov 2026). The same goes for the bare `preconnix:///` address.
// Returning null keeps the app where it is; when the app was closed and opened by such a link, it starts at '/'.

/** Paths that are not pages: the sign-in return and the bare app address. */
export function isAppOnlyPath(path: string): boolean {
  const p = path.replace(/^preconnix:\/*/i, '/').replace(/^\/+/, '/');
  return p === '/' || p === '' || /^\/auth(\/|\?|$)/i.test(p);
}

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  try {
    // A sign-in return that carries a code goes to the /auth page, which finishes the sign-in (safe to run twice).
    if (/[?&]code=/.test(path) && isAppOnlyPath(path)) return '/auth' + path.slice(path.indexOf('?'));
    if (isAppOnlyPath(path)) return initial ? '/' : null;
    return path;
  } catch {
    return initial ? '/' : null;
  }
}

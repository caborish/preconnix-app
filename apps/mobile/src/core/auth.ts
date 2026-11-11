// Member sign-in with an email code (Entra External ID, staging directory; ADR-016, doc 13).
// Standard OAuth with PKCE in the system browser. The refresh token is kept in secure storage; the access
// token stays in memory only. Tokens never go into logs or URLs we build.
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const TENANT = 'eaea71b1-9489-4dda-b874-0ebd9372b43e';
const BASE = `https://preconnixstaging.ciamlogin.com/${TENANT}/oauth2/v2.0`;
const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: `${BASE}/authorize`,
  tokenEndpoint: `${BASE}/token`,
  endSessionEndpoint: `${BASE}/logout`
};
const CLIENT_ID = 'be8203bf-744c-4b2d-bd83-43dffab829ff';
const SCOPES = ['openid', 'offline_access', 'api://3a06cc82-1d56-4307-b5ae-51d2c35eaf1d/access_as_user'];
const REFRESH_KEY = 'pcx.refreshToken';

let access: { token: string; expiresAt: number } | null = null;
const listeners = new Set<(signedIn: boolean) => void>();
const notify = (v: boolean) => listeners.forEach(l => l(v));

export const redirectUri = () => AuthSession.makeRedirectUri({ scheme: 'preconnix', path: 'auth' });

function remember(r: AuthSession.TokenResponse) {
  access = { token: r.accessToken, expiresAt: Date.now() + ((r.expiresIn ?? 3600) - 60) * 1000 };
  return r.refreshToken ? SecureStore.setItemAsync(REFRESH_KEY, r.refreshToken) : Promise.resolve();
}

const PENDING_KEY = 'pcx.pendingSignIn';
let exchanging: { code: string; done: Promise<boolean> } | null = null;

/**
 * Turns the code from the sign-in page into a session, once. Both the sign-in screen (when the browser hands the
 * result back) and the /auth page (when Android reopens the app with the link instead, 5 Nov 2026) call this; the
 * second caller waits for the first. The PKCE verifier and state were saved before the page opened.
 */
export function finishSignIn(code: string, state: string | undefined): Promise<boolean> {
  if (exchanging?.code === code) return exchanging.done;
  const done = (async () => {
    const raw = await SecureStore.getItemAsync(PENDING_KEY);
    const pending = raw ? (JSON.parse(raw) as { state: string; verifier: string }) : null;
    if (!pending || (state && state !== pending.state)) return isSignedIn();
    const tokens = await AuthSession.exchangeCodeAsync(
      { clientId: CLIENT_ID, code, redirectUri: redirectUri(), extraParams: { code_verifier: pending.verifier } },
      discovery
    );
    await remember(tokens);
    await SecureStore.deleteItemAsync(PENDING_KEY);
    notify(true);
    return true;
  })();
  exchanging = { code, done };
  done.catch(() => { if (exchanging?.done === done) exchanging = null; });
  return done;
}

/**
 * Opens the sign-in page. Resolves true when signed in, false if the person closed it.
 * Every sign-in asks for the email: the browser keeps no sign-in of its own (private session on iPhone) and
 * `prompt=login` makes the sign-in page ask again (Android), so after signing out anyone can sign in as themselves.
 */
export async function signInWithEmail(): Promise<boolean> {
  const request = new AuthSession.AuthRequest({
    clientId: CLIENT_ID, scopes: SCOPES, redirectUri: redirectUri(), usePKCE: true, prompt: AuthSession.Prompt.Login
  });
  const url = await request.makeAuthUrlAsync(discovery);
  await SecureStore.setItemAsync(PENDING_KEY, JSON.stringify({ state: request.state, verifier: request.codeVerifier ?? '' }));
  const result = await request.promptAsync(discovery, { url, preferEphemeralSession: true });
  if (result.type !== 'success') return isSignedIn();
  return finishSignIn(result.params.code, result.params.state);
}

export async function isSignedIn(): Promise<boolean> {
  return !!access || !!(await SecureStore.getItemAsync(REFRESH_KEY));
}

/** A valid access token, refreshed when needed; null when not signed in or the session has ended. */
export async function getAccessToken(): Promise<string | null> {
  if (access && access.expiresAt > Date.now()) return access.token;
  const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!refreshToken) return null;
  try {
    await remember(await AuthSession.refreshAsync({ clientId: CLIENT_ID, refreshToken, scopes: SCOPES }, discovery));
    return access!.token;
  } catch {
    await signOut();
    return null;
  }
}

/** Ends the session on this phone. */
export async function signOut() {
  access = null;
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  notify(false);
}

export function onSignInChange(fn: (signedIn: boolean) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

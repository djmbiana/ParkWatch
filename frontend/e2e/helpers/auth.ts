import { Page, APIRequestContext, request } from '@playwright/test';
import { API_URL, LOGIN_PATH, STORAGE, TEST_USERS } from './testData';

type Role = keyof typeof TEST_USERS;

// Per-worker token cache. The backend throttles /auth/login to 20 attempts per
// 15 min per IP (authLimiter, enforced in ALL envs), so the suite must log in
// at most once per role. JWTs are valid for days, so reuse is safe within a run.
const tokenCache = new Map<Role, { token: string; user: any }>();

/**
 * Logs in via the API (once per role, cached) and returns { token, user }.
 * Throws if the credentials are missing/wrong so a failed login surfaces loudly
 * rather than as a confusing downstream assertion.
 */
export async function apiLogin(role: Role, ctx?: APIRequestContext) {
  const cached = tokenCache.get(role);
  if (cached) return cached;

  const own = !ctx;
  const c = ctx ?? (await request.newContext());
  const user = TEST_USERS[role];
  const res = await c.post(`${API_URL}${LOGIN_PATH}`, {
    data: { email: user.email, password: user.password },
  });
  const body = await res.json();
  if (own) await c.dispose();
  if (!res.ok() || !body?.data?.token) {
    throw new Error(
      `Login failed for ${role} (${res.status()}): ${body?.message ?? 'no token returned'}. ` +
        `Is the backend running with seeded test accounts? ` +
        `(A 429 means the /auth/login rate limit was hit — re-run after the 15-min window.)`,
    );
  }
  const result = { token: body.data.token as string, user: body.data.user };
  tokenCache.set(role, result);
  return result;
}

/**
 * Seeds a portal session into a Page: logs in via API, writes the token + user
 * to localStorage exactly as the real Login screen does, then leaves the caller
 * to navigate. We must be on a real origin before touching localStorage, so the
 * caller should goto() a portal route AFTER this resolves (or pass `gotoPath`).
 */
export async function loginAs(role: Role, page: Page, gotoPath?: string) {
  const { token, user } = await apiLogin(role, page.request);
  // localStorage is per-origin; land on the app first.
  await page.goto('/login');
  await page.evaluate(
    ({ token, user, keys }) => {
      localStorage.setItem(keys.token, token);
      localStorage.setItem(keys.user, JSON.stringify(user));
    },
    { token, user, keys: STORAGE },
  );
  if (gotoPath) await page.goto(gotoPath);
  return { token, user };
}

/** Convenience: just the bearer token for a role (own request context). */
export async function getToken(role: Role): Promise<string> {
  const { token } = await apiLogin(role);
  return token;
}

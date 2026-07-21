import crypto from 'node:crypto';
import type { AstroCookies } from 'astro';
import { getPool } from '../booking/db';
import { verifyPassword } from './password';

export const ADMIN_COOKIE = 'olrig_admin_session';
const SESSION_DAYS = 7;

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: 'administrator';
}

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function setSessionCookie(cookies: AstroCookies, token: string, expires: Date): void {
  cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    path: '/',
    expires,
  });
}

export function clearSessionCookie(cookies: AstroCookies): void {
  cookies.delete(ADMIN_COOKIE, { path: '/' });
}

export async function authenticate(email: string, password: string): Promise<AdminUser | null> {
  const result = await getPool().query(
    `SELECT id, email, display_name, role, password_hash
       FROM admin_users
      WHERE lower(email) = lower($1) AND active = TRUE`,
    [email.trim()],
  );
  if (!result.rowCount) return null;
  const row = result.rows[0];
  if (!(await verifyPassword(password, row.password_hash))) return null;
  return { id: String(row.id), email: row.email, displayName: row.display_name, role: row.role };
}

export async function createSession(userId: string): Promise<{ token: string; expires: Date }> {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await getPool().query(
    `INSERT INTO admin_sessions (admin_user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash(token), expires],
  );
  await getPool().query('UPDATE admin_users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [userId]);
  return { token, expires };
}

export async function getSessionUser(cookies: AstroCookies): Promise<AdminUser | null> {
  const token = cookies.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const result = await getPool().query(
    `SELECT u.id, u.email, u.display_name, u.role
       FROM admin_sessions s
       JOIN admin_users u ON u.id = s.admin_user_id
      WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.active = TRUE`,
    [tokenHash(token)],
  );
  if (!result.rowCount) {
    clearSessionCookie(cookies);
    return null;
  }
  await getPool().query('UPDATE admin_sessions SET last_used_at = NOW() WHERE token_hash = $1', [tokenHash(token)]);
  const row = result.rows[0];
  return { id: String(row.id), email: row.email, displayName: row.display_name, role: row.role };
}

export async function destroySession(cookies: AstroCookies): Promise<void> {
  const token = cookies.get(ADMIN_COOKIE)?.value;
  if (token) await getPool().query('DELETE FROM admin_sessions WHERE token_hash = $1', [tokenHash(token)]);
  clearSessionCookie(cookies);
}

export async function audit(userId: string | null, action: string, details: Record<string, unknown> = {}): Promise<void> {
  await getPool().query(
    `INSERT INTO admin_audit_log (admin_user_id, action, details) VALUES ($1, $2, $3::jsonb)`,
    [userId, action, JSON.stringify(details)],
  );
}

function firstHeaderValue(value: string | null): string {
  return String(value || '').split(',')[0].trim();
}

function normaliseOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function originFromHost(protocol: string, host: string, port = ''): string | null {
  const cleanProtocol = protocol.replace(/:$/, '').toLowerCase();
  const cleanHost = host.trim();
  if (!['http', 'https'].includes(cleanProtocol)) return null;
  if (!cleanHost || /[\s/\\]/.test(cleanHost)) return null;

  const hostHasPort = cleanHost.startsWith('[')
    ? cleanHost.includes(']:')
    : cleanHost.includes(':');
  const authority = port && !hostHasPort ? `${cleanHost}:${port}` : cleanHost;
  return normaliseOrigin(`${cleanProtocol}://${authority}`);
}

/**
 * Verify browser form/API mutations against the origin visible to the user.
 *
 * Direct local Docker requests normally match request.url. Reverse proxies such
 * as Render can expose a different public protocol/host through forwarded
 * headers, so those values are also considered. A cross-site browser request
 * still fails because its Origin will not match the request Host or forwarded
 * public Host. Requests without Origin are retained for authenticated
 * server-to-server tools such as the calendar synchronisation endpoint.
 */
export function isSameOrigin(request: Request): boolean {
  const suppliedOrigin = request.headers.get('origin');
  if (!suppliedOrigin) return true;

  const origin = normaliseOrigin(suppliedOrigin);
  if (!origin) return false;

  // Sec-Fetch-Site is a browser-controlled forbidden request header. For a
  // form submitted by the page that served it, modern browsers send
  // `same-origin`. This is a reliable fallback when a reverse proxy causes the
  // server-side request URL to be reconstructed with an internal host or
  // protocol. Cross-site forms send `cross-site` and do not pass this check.
  const fetchSite = firstHeaderValue(request.headers.get('sec-fetch-site')).toLowerCase();
  if (fetchSite === 'same-origin') return true;

  const requestUrl = new URL(request.url);
  const acceptedOrigins = new Set<string>([requestUrl.origin]);

  const forwardedProtocol = firstHeaderValue(request.headers.get('x-forwarded-proto'));
  const forwardedHost = firstHeaderValue(request.headers.get('x-forwarded-host'));
  const forwardedPort = firstHeaderValue(request.headers.get('x-forwarded-port'));
  const host = firstHeaderValue(request.headers.get('host'));

  if (host) {
    const directOrigin = originFromHost(requestUrl.protocol, host);
    if (directOrigin) acceptedOrigins.add(directOrigin);

    if (forwardedProtocol) {
      const proxyProtocolOrigin = originFromHost(forwardedProtocol, host, forwardedPort);
      if (proxyProtocolOrigin) acceptedOrigins.add(proxyProtocolOrigin);
    }
  }

  if (forwardedHost) {
    const proxyOrigin = originFromHost(
      forwardedProtocol || requestUrl.protocol,
      forwardedHost,
      forwardedPort,
    );
    if (proxyOrigin) acceptedOrigins.add(proxyOrigin);
  }

  for (const configuredUrl of [
    process.env.BOOKING_PUBLIC_URL,
    process.env.RENDER_EXTERNAL_URL,
    process.env.RENDER_EXTERNAL_HOSTNAME
      ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
      : '',
  ]) {
    const configuredOrigin = normaliseOrigin(String(configuredUrl || ''));
    if (configuredOrigin) acceptedOrigins.add(configuredOrigin);
  }

  return acceptedOrigins.has(origin);
}

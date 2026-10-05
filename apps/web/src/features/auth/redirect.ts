/**
 * Where a user may be sent after signing in (`?returnTo=`). Only relative paths inside the app:
 * one leading `/` (not `//` or `/\`), no scheme, no control characters or backslashes, and the
 * path must start with a known app area. Anything else falls back to `/`, so a crafted link like
 * `/login?returnTo=https://evil.example` can never bounce users off-site.
 */
const ALLOWED_PREFIXES = [
  '/flights',
  '/buses',
  '/hotels',
  '/bookings',
  '/tickets',
  '/profile',
  '/wallet',
  '/offers',
  '/trains',
  '/cabs',
  '/bikes',
  '/holidays',
  '/parcel',
  '/corporate',
  '/notifications',
  '/support',
  '/admin',
] as const;

function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function safeReturnTo(value: string | null | undefined, fallback = '/'): string {
  if (!value || value.length > 2048) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  // Backslashes, control characters and encoded slashes/backslashes are never part of our URLs.
  if (value.includes('\\') || hasControlCharacter(value) || /%(2f|5c|00)/i.test(value))
    return fallback;
  let url: URL;
  try {
    url = new URL(value, 'https://zproo.invalid');
  } catch {
    return fallback;
  }
  if (url.origin !== 'https://zproo.invalid') return fallback;
  const path = url.pathname;
  if (path === '/') return `/${url.search}${url.hash}`;
  const allowed = ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  return allowed ? `${path}${url.search}${url.hash}` : fallback;
}

/** `/login?returnTo=…` preserving where the user wanted to go. */
export function loginPath(returnTo: string): string {
  const safe = safeReturnTo(returnTo);
  return safe === '/' ? '/login' : `/login?returnTo=${encodeURIComponent(safe)}`;
}

/** Same as `loginPath` for another auth page (signup, verify-otp), keeping the destination. */
export function withReturnTo(page: string, returnTo: string): string {
  return returnTo === '/' ? page : `${page}?returnTo=${encodeURIComponent(returnTo)}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/^\+91/, '');
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

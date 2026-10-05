import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  baseEnv,
  createTestContext,
  prisma,
  refreshCookie,
  resetUsers,
  signUp,
  withCsrf,
} from './helpers';

beforeEach(resetUsers);

describe('refresh token rotation', () => {
  it('issues a new refresh token and access token on every refresh', async () => {
    const ctx = createTestContext();
    const { cookie, accessToken } = await signUp(ctx);
    const res = await request(ctx.app).post('/api/auth/refresh').set(withCsrf(cookie)).expect(200);
    const next = refreshCookie(res);
    expect(next).toBeDefined();
    expect(next).not.toBe(cookie);
    expect(res.body.data.accessToken).not.toBe(accessToken);
    expect(res.body.data.user.roles).toEqual(['USER']);
    await request(ctx.app)
      .post('/api/auth/refresh')
      .set(withCsrf(next as string))
      .expect(200);
  });

  it('treats reuse of a rotated token as theft and ends the whole session', async () => {
    const ctx = createTestContext();
    const { cookie } = await signUp(ctx);
    const rotated = refreshCookie(
      await request(ctx.app).post('/api/auth/refresh').set(withCsrf(cookie)).expect(200),
    );

    // The old token is replayed (e.g. stolen) …
    const replay = await request(ctx.app)
      .post('/api/auth/refresh')
      .set(withCsrf(cookie))
      .expect(401);
    expect(replay.body.error.message).toBe('Your session has ended. Please sign in again.');
    // … so the legitimate newer token is revoked too.
    await request(ctx.app)
      .post('/api/auth/refresh')
      .set(withCsrf(rotated as string))
      .expect(401);
    expect(await prisma.auditLog.count({ where: { action: 'AUTH_REFRESH_REUSE' } })).toBe(1);
  });

  it('keeps other devices signed in when one session is revoked', async () => {
    const ctx = createTestContext();
    const { cookie, phone } = await signUp(ctx, { password: 'travel2026' });
    const second = refreshCookie(
      await request(ctx.app)
        .post('/api/auth/login')
        .send({ identifier: phone, password: 'travel2026' })
        .expect(200),
    );
    await request(ctx.app).post('/api/auth/logout').set(withCsrf(cookie)).expect(200);
    await request(ctx.app).post('/api/auth/refresh').set(withCsrf(cookie)).expect(401);
    await request(ctx.app)
      .post('/api/auth/refresh')
      .set(withCsrf(second as string))
      .expect(200);
  });

  it('stores only a keyed hash of refresh tokens', async () => {
    const ctx = createTestContext();
    const { cookie } = await signUp(ctx);
    const raw = cookie.replace('zp_rt=', '');
    const rows = await prisma.refreshToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]?.tokenHash).not.toBe(raw);
  });

  it('rejects refresh without a cookie, and clears bad cookies', async () => {
    const ctx = createTestContext();
    await request(ctx.app).post('/api/auth/refresh').expect(401);
    const res = await request(ctx.app)
      .post('/api/auth/refresh')
      .set(withCsrf('zp_rt=garbage'))
      .expect(401);
    expect((res.headers['set-cookie'] as unknown as string[])[0]).toMatch(
      /^zp_rt=;.*Expires=Thu, 01 Jan 1970/,
    );
  });

  it('rejects expired refresh tokens', async () => {
    const ctx = createTestContext();
    const { cookie } = await signUp(ctx);
    await prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await request(ctx.app).post('/api/auth/refresh').set(withCsrf(cookie)).expect(401);
  });

  it('ends sessions of suspended users on refresh', async () => {
    const ctx = createTestContext();
    const { cookie, body } = await signUp(ctx);
    await prisma.user.update({ where: { id: body.data.user.id }, data: { status: 'SUSPENDED' } });
    const res = await request(ctx.app).post('/api/auth/refresh').set(withCsrf(cookie)).expect(403);
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
  });
});

describe('logout', () => {
  it('clears the cookie and is safe to repeat', async () => {
    const ctx = createTestContext();
    const { cookie } = await signUp(ctx);
    const res = await request(ctx.app).post('/api/auth/logout').set(withCsrf(cookie)).expect(200);
    expect((res.headers['set-cookie'] as unknown as string[])[0]).toMatch(/^zp_rt=;/);
    await request(ctx.app).post('/api/auth/logout').set(withCsrf(cookie)).expect(200);
    await request(ctx.app).post('/api/auth/logout').expect(200);
  });

  it('logout-all requires sign-in and ends every session', async () => {
    const ctx = createTestContext();
    const { cookie, phone, accessToken } = await signUp(ctx, { password: 'travel2026' });
    const second = refreshCookie(
      await request(ctx.app)
        .post('/api/auth/login')
        .send({ identifier: phone, password: 'travel2026' }),
    ) as string;
    await request(ctx.app).post('/api/auth/logout-all').expect(401);
    await request(ctx.app)
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(ctx.app).post('/api/auth/refresh').set(withCsrf(cookie)).expect(401);
    await request(ctx.app).post('/api/auth/refresh').set(withCsrf(second)).expect(401);
  });
});

describe('access tokens', () => {
  const key = new TextEncoder().encode(baseEnv.JWT_SECRET);
  const token = (
    claims: Record<string, unknown>,
    opts: { exp?: string; aud?: string; key?: Uint8Array } = {},
  ) =>
    new SignJWT({ roles: ['SUPER_ADMIN'], sid: 's1', ...claims })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setIssuer('zproo-go')
      .setAudience(opts.aud ?? 'zproo-go-api')
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '5m')
      .sign(opts.key ?? key);

  it('rejects expired, wrong-audience and wrongly-signed tokens', async () => {
    const ctx = createTestContext();
    for (const bad of [
      await token({}, { exp: '-1m' }),
      await token({}, { aud: 'zproo-go-signup' }),
      await token({}, { key: new TextEncoder().encode('x'.repeat(40)) }),
      'not-a-jwt',
    ]) {
      const res = await request(ctx.app)
        .get('/api/me')
        .set('Authorization', `Bearer ${bad}`)
        .expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('does not accept a signup token as an access token', async () => {
    const ctx = createTestContext();
    const signupToken = await ctx.services.tokens.signSignupToken('+919876543210');
    await request(ctx.app).get('/api/me').set('Authorization', `Bearer ${signupToken}`).expect(401);
  });
});

describe('CSRF on cookie-authenticated endpoints', () => {
  it.each(['/api/auth/refresh', '/api/auth/logout'])(
    '%s refuses a missing or mismatched CSRF token',
    async (path) => {
      const ctx = createTestContext();
      const { cookie } = await signUp(ctx);
      const missing = await request(ctx.app).post(path).set('Cookie', cookie).expect(403);
      expect(missing.body.error).toMatchObject({
        code: 'FORBIDDEN',
        message: 'Missing or invalid CSRF token',
      });
      await request(ctx.app)
        .post(path)
        .set('Cookie', `${cookie}; zp_csrf=aaaaaaaaaaaaaaaaaaaaaaaa`)
        .set('X-CSRF-Token', 'bbbbbbbbbbbbbbbbbbbbbbbb')
        .expect(403);
      // The session survived both attempts.
      await request(ctx.app).post('/api/auth/refresh').set(withCsrf(cookie)).expect(200);
    },
  );

  it('refuses a foreign Origin even with a valid token', async () => {
    const ctx = createTestContext();
    const { cookie } = await signUp(ctx);
    const res = await request(ctx.app)
      .post('/api/auth/refresh')
      .set(withCsrf(cookie))
      .set('Origin', 'https://evil.example')
      .expect(403);
    expect(res.body.error.message).toBe('Request origin not allowed');
    await request(ctx.app)
      .post('/api/auth/refresh')
      .set(withCsrf(cookie))
      .set('Origin', 'http://localhost:5173')
      .expect(200);
  });
});

describe('access token claims', () => {
  it('carries only sub, sid, roles, jti, iss, aud, iat and exp', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx, { email: 'claims@example.com' });
    const [header, payload] = accessToken
      .split('.')
      .slice(0, 2)
      .map((part) => JSON.parse(Buffer.from(part, 'base64url').toString()) as object);
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(Object.keys(payload ?? {}).sort()).toEqual(
      ['aud', 'exp', 'iat', 'iss', 'jti', 'roles', 'sid', 'sub'].sort(),
    );
    expect(JSON.stringify(payload)).not.toMatch(/claims@example\.com|\+91/);
  });
});

import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { assertTestEnvironment } from '../src/routes/test.routes';
import { bookedFlight } from './flightFixtures';
import { baseEnv, createTestContext, prisma, resetUsers, uniquePhone } from './helpers';

beforeEach(resetUsers);

describe('/api/test routes', () => {
  it('creates signed-in users and resets customer data', async () => {
    const ctx = createTestContext();
    const res = await request(ctx.app)
      .post('/api/test/users')
      .send({ fullName: 'Selenium Tester', email: 'qa@example.com' })
      .expect(201);
    expect(res.body.data).toMatchObject({
      user: { fullName: 'Selenium Tester', email: 'qa@example.com' },
      password: 'travel2026',
    });
    await request(ctx.app)
      .get('/api/me')
      .set('Authorization', `Bearer ${res.body.data.accessToken}`)
      .expect(200);
    // The password works for a normal login too.
    await request(ctx.app)
      .post('/api/auth/login')
      .send({ identifier: 'qa@example.com', password: 'travel2026' })
      .expect(200);
    await request(ctx.app).post('/api/test/reset').expect(200);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.role.count()).toBeGreaterThan(0);
  });

  it('are not mounted outside NODE_ENV=test, where test headers are ignored', async () => {
    const ctx = createTestContext({ env: { NODE_ENV: 'development' } });
    await request(ctx.app).post('/api/test/users').send({}).expect(404);
    await request(ctx.app).post('/api/test/reset').expect(404);
    expect(() => assertTestEnvironment({ isTest: false, isProduction: true })).toThrow(
      /Refusing to start/,
    );
  });

  it('expires holds with the X-Test-Now clock', async () => {
    const ctx = createTestContext();
    const { reference } = await bookedFlight(ctx);
    const later = new Date(Date.now() + 16 * 60_000).toISOString();
    const job = await request(ctx.app)
      .post('/api/test/jobs/release-holds')
      .set('X-Test-Now', later)
      .expect(200);
    expect(job.body.data).toMatchObject({ ran: true, expired: 1 });
    expect((await prisma.booking.findUniqueOrThrow({ where: { reference } })).status).toBe(
      'EXPIRED',
    );
  });

  it('ignores X-Test-Now outside the test environment', async () => {
    const ctx = createTestContext({ env: { NODE_ENV: 'development' } });
    const { user, reference } = await bookedFlight(ctx);
    const res = await request(ctx.app)
      .get(`/api/bookings/${reference}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .set('X-Test-Now', '2030-01-01T00:00:00Z')
      .expect(200);
    expect(Date.parse(res.body.data.serverNow)).toBeLessThan(Date.parse('2029-01-01'));
  });
});

describe('fixed test OTP', () => {
  it('is 123456 with ALLOW_TEST_OTP=true in NODE_ENV=test', async () => {
    const ctx = createTestContext({ env: { ALLOW_TEST_OTP: 'true' } });
    const phone = uniquePhone();
    await request(ctx.app).post('/api/auth/send-otp').send({ phone }).expect(200);
    expect(ctx.sms.lastCodeFor(phone)).toBe('123456');
    await request(ctx.app).post('/api/auth/verify-otp').send({ phone, otp: '123456' }).expect(200);
  });
});

describe('access token forgery', () => {
  it('rejects alg:none and tampered payloads', async () => {
    const ctx = createTestContext();
    const created = await request(ctx.app).post('/api/test/users').send({}).expect(201);
    const valid = created.body.data.accessToken as string;
    const [header, payload, signature] = valid.split('.');
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const claims = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString()) as object;

    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${payload}.`;
    const tampered = `${header}.${b64({ ...claims, roles: ['SUPER_ADMIN'] })}.${signature}`;
    const otherAlg = await new SignJWT({ ...claims })
      .setProtectedHeader({ alg: 'HS512' })
      .sign(new TextEncoder().encode(baseEnv.JWT_SECRET));
    for (const bad of [none, tampered, otherAlg]) {
      const res = await request(ctx.app)
        .get('/api/me')
        .set('Authorization', `Bearer ${bad}`)
        .expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
    await request(ctx.app).get('/api/me').set('Authorization', `Bearer ${valid}`).expect(200);
  });
});

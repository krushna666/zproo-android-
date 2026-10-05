import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createTestContext,
  prisma,
  refreshCookie,
  resetUsers,
  signUp,
  uniquePhone,
  withCsrf,
} from './helpers';

beforeEach(resetUsers);

describe('password login', () => {
  it('signs in with mobile number or email', async () => {
    const ctx = createTestContext();
    const { phone } = await signUp(ctx, { email: 'riya@example.com', password: 'travel2026' });

    const byPhone = await request(ctx.app)
      .post('/api/auth/login')
      .send({ identifier: phone.slice(3), password: 'travel2026' })
      .expect(200);
    expect(byPhone.body.data.user.phone).toBe(phone);
    expect(refreshCookie(byPhone)).toBeDefined();

    await request(ctx.app)
      .post('/api/auth/login')
      .send({ identifier: 'RIYA@example.com', password: 'travel2026' })
      .expect(200);
  });

  it('gives the same answer for a wrong password and an unknown account', async () => {
    const ctx = createTestContext();
    const { phone } = await signUp(ctx, { password: 'travel2026' });
    const wrong = await request(ctx.app)
      .post('/api/auth/login')
      .send({ identifier: phone, password: 'nope1234' })
      .expect(401);
    const unknown = await request(ctx.app)
      .post('/api/auth/login')
      .send({ identifier: uniquePhone(), password: 'travel2026' })
      .expect(401);
    expect(wrong.body.error).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'Incorrect mobile number, email or password',
    });
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
    expect(unknown.body.error.code).toBe(wrong.body.error.code);
  });

  it('cannot log in with a password on an OTP-only account', async () => {
    const ctx = createTestContext();
    const { phone } = await signUp(ctx);
    await request(ctx.app)
      .post('/api/auth/login')
      .send({ identifier: phone, password: 'anything1' })
      .expect(401);
  });

  it('blocks suspended accounts', async () => {
    const ctx = createTestContext();
    const { phone, body } = await signUp(ctx, { password: 'travel2026' });
    await prisma.user.update({ where: { id: body.data.user.id }, data: { status: 'SUSPENDED' } });
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .send({ identifier: phone, password: 'travel2026' })
      .expect(403);
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
  });

  it('limits repeated attempts against one account', async () => {
    const ctx = createTestContext();
    const { phone } = await signUp(ctx, { password: 'travel2026' });
    for (let i = 0; i < 10; i++) {
      await request(ctx.app)
        .post('/api/auth/login')
        .send({ identifier: phone, password: `wrong${i}pass` })
        .expect(401);
    }
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .send({ identifier: phone, password: 'travel2026' })
      .expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('password reset', () => {
  it('resets by SMS code, signs out every session, and accepts the new password', async () => {
    const ctx = createTestContext();
    const { phone, cookie } = await signUp(ctx, { password: 'travel2026' });

    const forgot = await request(ctx.app)
      .post('/api/auth/forgot-password')
      .send({ identifier: phone })
      .expect(200);
    expect(forgot.body.message).toMatch(
      /^If an account exists for \+91 \d{2}X{6}\d{2}, we've sent a 6-digit code\.$/,
    );
    const otp = ctx.sms.lastCodeFor(phone);
    expect(ctx.sms.sent.at(-1)?.body).toMatch(/password reset code/);

    await request(ctx.app)
      .post('/api/auth/reset-password')
      .send({ identifier: phone, otp, newPassword: 'newjourney9' })
      .expect(200);

    await request(ctx.app).post('/api/auth/refresh').set(withCsrf(cookie)).expect(401);
    await request(ctx.app)
      .post('/api/auth/login')
      .send({ identifier: phone, password: 'travel2026' })
      .expect(401);
    await request(ctx.app)
      .post('/api/auth/login')
      .send({ identifier: phone, password: 'newjourney9' })
      .expect(200);
    expect(await prisma.auditLog.count({ where: { action: 'AUTH_PASSWORD_RESET' } })).toBe(1);
  });

  it('resets by email code and marks the email verified', async () => {
    const ctx = createTestContext();
    const { body } = await signUp(ctx, { email: 'meera@example.com' });
    await request(ctx.app)
      .post('/api/auth/forgot-password')
      .send({ identifier: 'meera@example.com' })
      .expect(200);
    const otp = ctx.email.lastCodeFor('meera@example.com');
    await request(ctx.app)
      .post('/api/auth/reset-password')
      .send({ identifier: 'meera@example.com', otp, newPassword: 'newjourney9' })
      .expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: body.data.user.id } });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('does not reveal whether an account exists and sends nothing for unknown accounts', async () => {
    const ctx = createTestContext();
    await signUp(ctx, { email: 'gopi@example.com' });
    const known = await request(ctx.app)
      .post('/api/auth/forgot-password')
      .send({ identifier: 'gopi@example.com' })
      .expect(200);
    const unknown = await request(ctx.app)
      .post('/api/auth/forgot-password')
      .send({ identifier: 'ghost@example.com' })
      .expect(200);
    expect(unknown.body).toEqual({
      success: true,
      message: "If an account exists for g***@example.com, we've sent a 6-digit code.",
      data: { expiresIn: 600, resendIn: 30 },
    });
    // Same status, shape and data as for a real account (only the echoed address differs).
    expect(known.body.data).toEqual(unknown.body.data);
    // Only the real account got an email.
    expect(ctx.email.sent.map((m) => m.to)).toEqual(['gopi@example.com']);
    const res = await request(ctx.app)
      .post('/api/auth/reset-password')
      .send({ identifier: 'ghost@example.com', otp: '123456', newPassword: 'newjourney9' })
      .expect(400);
    expect(res.body.error.code).toBe('OTP_EXPIRED');
  });

  it('does not accept a sign-in code as a reset code', async () => {
    const ctx = createTestContext();
    const { phone } = await signUp(ctx);
    const other = createTestContext();
    await request(other.app).post('/api/auth/send-otp').send({ phone }).expect(200);
    await request(other.app)
      .post('/api/auth/reset-password')
      .send({ identifier: phone, otp: other.sms.lastCodeFor(phone), newPassword: 'newjourney9' })
      .expect(400);
  });

  it('enforces the password policy', async () => {
    const ctx = createTestContext();
    const res = await request(ctx.app)
      .post('/api/auth/reset-password')
      .send({ identifier: '9876543210', otp: '123456', newPassword: 'password' })
      .expect(400);
    expect(res.body.error.details.issues[0]).toEqual({
      path: 'body.newPassword',
      message: 'Password must contain letters and numbers',
    });
  });
});

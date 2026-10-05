import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, prisma, refreshCookie, resetUsers, signUp, withCsrf } from './helpers';

beforeEach(resetUsers);

describe('/api/me', () => {
  it('requires sign-in', async () => {
    const res = await request(createTestContext().app).get('/api/me').expect(401);
    expect(res.body.error).toMatchObject({
      code: 'UNAUTHENTICATED',
      message: 'Please sign in to continue',
    });
  });

  it('returns the signed-in user with permissions', async () => {
    const ctx = createTestContext();
    const { accessToken, phone } = await signUp(ctx, { fullName: 'Ananya Iyer' });
    const res = await request(ctx.app)
      .get('/api/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.data).toMatchObject({ fullName: 'Ananya Iyer', phone, roles: ['USER'] });
    expect(res.body.data.permissions).toEqual(
      expect.arrayContaining(['profile:read:own', 'wallet:read:own']),
    );
  });

  it('updates the name and records it in the audit log', async () => {
    const ctx = createTestContext();
    const { accessToken, body } = await signUp(ctx);
    const res = await request(ctx.app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: '  Amit K. Sharma ' })
      .expect(200);
    expect(res.body.data.fullName).toBe('Amit K. Sharma');
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'USER_PROFILE_UPDATED' },
    });
    expect(audit).toMatchObject({
      actorId: body.data.user.id,
      before: { fullName: 'Amit Sharma' },
      after: { fullName: 'Amit K. Sharma' },
    });
  });

  it('ignores fields users may not change', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const res = await request(ctx.app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Amit Sharma', roles: ['SUPER_ADMIN'], status: 'ACTIVE' })
      .expect(200);
    expect(res.body.data.roles).toEqual(['USER']);
  });
});

describe('POST /api/me/password', () => {
  it('changes the password, keeps this session and signs out other devices', async () => {
    const ctx = createTestContext();
    const first = await signUp(ctx, { email: 'pw@example.com', password: 'travel2026' });
    const other = await request(ctx.app)
      .post('/api/auth/login')
      .send({ identifier: 'pw@example.com', password: 'travel2026' })
      .expect(200);
    const otherCookie = refreshCookie(other);
    await request(ctx.app)
      .post('/api/me/password')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .send({
        currentPassword: 'travel2026',
        newPassword: 'journey2027',
        confirmPassword: 'journey2027',
      })
      .expect(200);
    await request(ctx.app).post('/api/auth/refresh').set(withCsrf(first.cookie)).expect(200);
    await request(ctx.app).post('/api/auth/refresh').set(withCsrf(otherCookie)).expect(401);
    await request(ctx.app)
      .post('/api/auth/login')
      .send({ identifier: 'pw@example.com', password: 'journey2027' })
      .expect(200);
  });

  it('uses the SOP messages', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx, { password: 'travel2026' });
    const change = (body: object) =>
      request(ctx.app)
        .post('/api/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(body)
        .expect(400);
    expect(
      (
        await change({
          currentPassword: 'travel2026',
          newPassword: 'travel2026',
          confirmPassword: 'travel2026',
        })
      ).body.error.details.fields,
    ).toEqual({ newPassword: 'New password must be different from your current password' });
    expect(
      (
        await change({
          currentPassword: 'wrong123',
          newPassword: 'journey2027',
          confirmPassword: 'journey2027',
        })
      ).body.error.details.fields,
    ).toEqual({ currentPassword: 'Your current password is incorrect' });
  });
});

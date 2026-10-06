import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, resetUsers, signUp } from './helpers';

beforeEach(resetUsers);

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('/api/me/travellers (saved travellers, SOP §6.3)', () => {
  it('requires sign-in', async () => {
    await request(createTestContext().app).get('/api/me/travellers').expect(401);
  });

  it('saves, updates by name, lists newest first and removes', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const put = (body: object) =>
      request(ctx.app).put('/api/me/travellers').set(auth(accessToken)).send(body);

    const first = await put({
      title: 'MR',
      firstName: 'Amit',
      lastName: 'Sharma',
      gender: 'MALE',
    }).expect(200);
    expect(first.body.data).toMatchObject({
      title: 'MR',
      firstName: 'Amit',
      lastName: 'Sharma',
      gender: 'MALE',
      dob: null,
    });
    await put({ firstName: 'Kabir', lastName: 'Sharma', dob: '2016-04-02', gender: 'MALE' }).expect(
      200,
    );
    // The same name again updates the saved traveller (title and gender are kept).
    const again = await put({ firstName: 'Amit', lastName: 'Sharma', dob: '1990-05-01' }).expect(
      200,
    );
    expect(again.body.data).toMatchObject({
      id: first.body.data.id,
      title: 'MR',
      dob: '1990-05-01',
    });

    const list = await request(ctx.app)
      .get('/api/me/travellers')
      .set(auth(accessToken))
      .expect(200);
    expect(list.body.data.map((t: { firstName: string }) => t.firstName)).toEqual([
      'Amit',
      'Kabir',
    ]);

    await request(ctx.app)
      .delete(`/api/me/travellers/${first.body.data.id}`)
      .set(auth(accessToken))
      .expect(200);
    const after = await request(ctx.app).get('/api/me/travellers').set(auth(accessToken));
    expect(after.body.data).toHaveLength(1);
  });

  it('keeps each account to its own travellers', async () => {
    const ctx = createTestContext();
    const a = await signUp(ctx);
    const b = await signUp(ctx);
    const saved = await request(ctx.app)
      .put('/api/me/travellers')
      .set(auth(a.accessToken))
      .send({ firstName: 'Priya', lastName: 'Rao' })
      .expect(200);
    const theirs = await request(ctx.app).get('/api/me/travellers').set(auth(b.accessToken));
    expect(theirs.body.data).toEqual([]);
    const res = await request(ctx.app)
      .delete(`/api/me/travellers/${saved.body.data.id}`)
      .set(auth(b.accessToken))
      .expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('validates strictly and caps the list at 20', async () => {
    const ctx = createTestContext();
    const { accessToken } = await signUp(ctx);
    const put = (body: object) =>
      request(ctx.app).put('/api/me/travellers').set(auth(accessToken)).send(body);
    await put({ firstName: 'Amit<script>', lastName: 'Sharma' }).expect(400);
    await put({ firstName: 'Amit', lastName: 'Sharma', userId: 'someone-else' }).expect(400);
    await put({ firstName: 'Amit', lastName: 'Sharma', dob: '1990-13-40' }).expect(400);
    const names = 'abcdefghijklmnopqrst'.split('');
    for (const n of names) await put({ firstName: `Guest ${n}`, lastName: 'Kumar' }).expect(200);
    const over = await put({ firstName: 'One', lastName: 'More' }).expect(409);
    expect(over.body.error.message).toBe('You can save up to 20 travellers');
    // Updating someone already saved still works at the cap.
    await put({ firstName: 'Guest a', lastName: 'Kumar', gender: 'FEMALE' }).expect(200);
  });
});

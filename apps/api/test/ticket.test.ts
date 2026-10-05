import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { pdfText } from '../src/services/ticket.service';
import { bookedFlight } from './flightFixtures';
import { createTestContext, resetUsers } from './helpers';
import { payWithMock } from './payments';

beforeEach(resetUsers);

describe('e-ticket PDF', () => {
  it('strips control characters from customer text', () => {
    expect(pdfText('Amit\u0000 Sha\u001brma\u0085')).toBe('Amit Sharma');
    expect(pdfText('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');
  });

  it('is served privately as an attachment with a QR code of the reference', async () => {
    const ctx = createTestContext();
    const { user, reference } = await bookedFlight(ctx);
    await payWithMock(ctx, user.accessToken, reference);
    const res = await request(ctx.app)
      .get(`/api/bookings/${reference}/ticket.pdf`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .buffer(true)
      .parse((r, done) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="ZPROO-GO-${reference}.pdf"`,
    );
    expect(res.headers['cache-control']).toBe('private, no-store');
    const pdf = (res.body as Buffer).toString('latin1');
    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pdf).toMatch(/\/Subtype \/Image/);
  });

  it('is only available for confirmed bookings', async () => {
    const ctx = createTestContext();
    const { user, reference } = await bookedFlight(ctx);
    const res = await request(ctx.app)
      .get(`/api/bookings/${reference}/ticket.pdf`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(409);
    expect(res.body.error.code).toBe('INVALID_STATE');
  });
});

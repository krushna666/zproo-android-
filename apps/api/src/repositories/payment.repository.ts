import type { PaymentStatus, Prisma } from '@prisma/client';
import type { Db } from './db';

export class PaymentRepository {
  constructor(private readonly db: Db) {}

  findById(id: string) {
    return this.db.payment.findUnique({ where: { id }, include: { booking: true } });
  }

  findByOrderId(providerOrderId: string) {
    return this.db.payment.findUnique({ where: { providerOrderId }, include: { booking: true } });
  }

  /** The captured payment of a booking (refunds and refund-due marking). */
  findCapturedForBooking(bookingId: string) {
    return this.db.payment.findFirst({
      where: { bookingId, status: 'CAPTURED' },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** An open (not yet paid or failed) payment for the booking, if any. */
  findOpenForBooking(bookingId: string) {
    return this.db.payment.findFirst({
      where: { bookingId, status: { in: ['CREATED', 'PENDING'] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(data: Prisma.PaymentUncheckedCreateInput) {
    return this.db.payment.create({ data });
  }

  async transition(id: string, from: PaymentStatus[], data: Prisma.PaymentUpdateManyMutationInput) {
    const { count } = await this.db.payment.updateMany({
      where: { id, status: { in: from } },
      data,
    });
    return count === 1;
  }

  cancelOpenForBooking(bookingId: string) {
    return this.db.payment.updateMany({
      where: { bookingId, status: { in: ['CREATED', 'PENDING'] } },
      data: { status: 'CANCELLED' },
    });
  }
}

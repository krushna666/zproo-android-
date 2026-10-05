import type { Prisma, PrismaClient } from '@prisma/client';
import type { BookingDetails, CouponRejection, ServiceType } from '@zproo/types';
import { OPEN_HOLD_STATUSES, couponDiscount, subtotalOf, totalOf } from '@zproo/utils';
import { toBookingDetails } from '../models/booking.dto';
import { BookingRepository } from '../repositories/booking.repository';
import { CouponInvalidError, HoldExpiredError, InvalidStateError } from '../utils/errors';
import type { AuditService, RequestContext } from './audit.service';
import type { BookingService } from './booking.service';
import { clock } from '../lib/testContext';

/** Bookings that use up a coupon: held (until expiry) or bought. */
const COUNTING: Prisma.BookingWhereInput = {
  status: { in: [...OPEN_HOLD_STATUSES, 'CONFIRMED', 'COMPLETED'] },
};

export interface PublicCoupon {
  code: string;
  description: string;
  serviceType: ServiceType | null;
  minAmountPaise: number;
  endsAt: string;
}

/**
 * Coupons are validated and priced on the server only: the browser sends a booking reference and
 * a code, never an amount. The discount is recomputed from the stored booking on every apply.
 */
export class CouponService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      prisma: PrismaClient;
      bookings: BookingService;
      audit: AuditService;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? clock.now;
  }

  /** Active coupons customers can see (optionally for one service). */
  async listActive(serviceType?: ServiceType): Promise<PublicCoupon[]> {
    const now = this.now();
    const coupons = await this.deps.prisma.coupon.findMany({
      where: {
        active: true,
        startsAt: { lte: now },
        endsAt: { gt: now },
        ...(serviceType && { OR: [{ serviceType }, { serviceType: null }] }),
      },
      orderBy: { code: 'asc' },
    });
    return coupons.map((c) => ({
      code: c.code,
      description: c.description,
      serviceType: c.serviceType,
      minAmountPaise: c.minAmountPaise,
      endsAt: c.endsAt.toISOString(),
    }));
  }

  async apply(
    userId: string,
    bookingRef: string,
    code: string,
    ctx: RequestContext,
  ): Promise<BookingDetails> {
    const booking = await this.payable(userId, bookingRef);
    const now = this.now();
    await this.deps.prisma.$transaction(async (tx) => {
      const coupon = await tx.coupon.findUnique({ where: { code } });
      if (!coupon || !coupon.active) throw new CouponInvalidError('not_applicable');
      // Serialise applications of this coupon so its usage limits cannot be raced.
      await tx.$queryRaw`SELECT id FROM coupons WHERE id = ${coupon.id} FOR UPDATE`;

      const reject = (reason: CouponRejection) => new CouponInvalidError(reason);
      if (now < coupon.startsAt || now >= coupon.endsAt) throw reject('expired');
      if (coupon.serviceType && coupon.serviceType !== booking.serviceType)
        throw reject('not_applicable');
      const amounts = {
        basePaise: booking.baseAmountPaise,
        taxPaise: booking.taxAmountPaise,
        feePaise: booking.feeAmountPaise,
      };
      if (subtotalOf(amounts) < coupon.minAmountPaise) throw reject('min_amount');
      const others = { bookingId: { not: booking.id }, booking: COUNTING };
      const [mine, everyone] = await Promise.all([
        tx.couponRedemption.count({ where: { couponId: coupon.id, userId, ...others } }),
        tx.couponRedemption.count({ where: { couponId: coupon.id, ...others } }),
      ]);
      if (mine >= coupon.perUserLimit) throw reject('usage_limit');
      if (coupon.totalLimit !== null && everyone >= coupon.totalLimit) throw reject('usage_limit');

      const discountPaise = couponDiscount(coupon, booking.baseAmountPaise);
      if (discountPaise <= 0) throw reject('not_applicable');
      await tx.couponRedemption.upsert({
        where: { bookingId: booking.id },
        create: { couponId: coupon.id, userId, bookingId: booking.id, discountPaise },
        update: { couponId: coupon.id, discountPaise },
      });
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          couponId: coupon.id,
          discountAmountPaise: discountPaise,
          totalAmountPaise: totalOf({ ...amounts, discountPaise }),
        },
      });
    });
    await this.deps.audit.record({
      action: 'COUPON_APPLIED',
      actorId: userId,
      entityType: 'Booking',
      entityId: booking.id,
      after: { code },
      context: ctx,
    });
    return this.details(bookingRef);
  }

  async remove(userId: string, bookingRef: string): Promise<BookingDetails> {
    const booking = await this.payable(userId, bookingRef);
    await this.deps.prisma.$transaction(async (tx) => {
      await tx.couponRedemption.deleteMany({ where: { bookingId: booking.id } });
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          couponId: null,
          discountAmountPaise: 0,
          totalAmountPaise: totalOf({
            basePaise: booking.baseAmountPaise,
            taxPaise: booking.taxAmountPaise,
            feePaise: booking.feeAmountPaise,
            discountPaise: 0,
          }),
        },
      });
    });
    return this.details(bookingRef);
  }

  /** Coupons can change only while the booking is still payable. */
  private async payable(userId: string, bookingRef: string) {
    const booking = await this.deps.bookings.get(bookingRef, { userId, canReadAny: false });
    if (booking.status === 'EXPIRED') throw new HoldExpiredError();
    if (!OPEN_HOLD_STATUSES.includes(booking.status) || booking.paymentStatus === 'CAPTURED')
      throw new InvalidStateError('Coupons can only be changed before payment');
    if (booking.holdExpiresAt && booking.holdExpiresAt <= this.now()) throw new HoldExpiredError();
    return booking;
  }

  private async details(bookingRef: string): Promise<BookingDetails> {
    const booking = await new BookingRepository(this.deps.prisma).findByReference(bookingRef);
    if (!booking) throw new InvalidStateError('Booking not found');
    return toBookingDetails(booking, this.now());
  }
}

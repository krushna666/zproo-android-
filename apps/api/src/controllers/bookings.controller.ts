import type { RequestHandler } from 'express';
import { requireAuth } from '../middleware/auth';
import { validated } from '../middleware/validate';
import type { BookingService } from '../services/booking.service';
import type { CancellationService } from '../services/cancellation.service';
import type { PaymentService } from '../services/payment.service';
import type { RbacService } from '../services/rbac.service';
import type { TicketService } from '../services/ticket.service';
import { InvalidStateError } from '../utils/errors';
import { sendSuccess } from '../utils/response';

export function createBookingsController(
  bookings: BookingService,
  tickets: TicketService,
  rbac: RbacService,
  cancellations: CancellationService,
  payments: PaymentService,
) {
  const viewer = async (req: Parameters<RequestHandler>[0]) => {
    const auth = requireAuth(req);
    return { userId: auth.userId, canReadAny: await rbac.hasAll(auth.roles, ['booking:read:any']) };
  };

  const list: RequestHandler = async (req, res) => {
    sendSuccess(res, await bookings.list(requireAuth(req).userId));
  };

  /**
   * Booking details. A paid booking the airline is still ticketing ("Confirming with the
   * airline...") is checked with the supplier on each poll, so the answer is current.
   */
  const get: RequestHandler = async (req, res) => {
    const { reference } = validated<{ reference: string }>(req, 'params');
    const who = await viewer(req);
    const record = await bookings.get(reference, who);
    if (record.status === 'PAYMENT_PENDING' && record.paymentStatus === 'CAPTURED')
      await payments.retryIssue(record.id);
    res.setHeader('Cache-Control', 'no-store');
    sendSuccess(res, await bookings.getDetails(reference, who));
  };

  const ticket: RequestHandler = async (req, res) => {
    const { reference } = validated<{ reference: string }>(req, 'params');
    const record = await bookings.get(reference, await viewer(req));
    if (record.status !== 'CONFIRMED' && record.status !== 'COMPLETED') {
      throw new InvalidStateError('The e-ticket is available once the booking is confirmed');
    }
    const details = await bookings.getDetails(reference, await viewer(req));
    const demo = Boolean((record.metadata as { demo?: boolean } | null)?.demo);
    const pdf = await tickets.ticket(details, { demo });
    res
      .status(200)
      .type('application/pdf')
      .setHeader('Content-Disposition', `attachment; filename="ZPROO-GO-${reference}.pdf"`)
      .setHeader('Cache-Control', 'private, no-store')
      .send(pdf);
  };

  /** What cancelling now would refund, for the confirmation dialog. */
  const cancellation: RequestHandler = async (req, res) => {
    const { reference } = validated<{ reference: string }>(req, 'params');
    sendSuccess(res, await cancellations.quote(requireAuth(req).userId, reference));
  };

  /** Give up an unpaid hold now (seats/travellers changed) instead of waiting for it to lapse. */
  const release: RequestHandler = async (req, res) => {
    const { reference } = validated<{ reference: string }>(req, 'params');
    sendSuccess(res, await bookings.release(requireAuth(req).userId, reference), 'Hold released');
  };

  return { list, get, ticket, cancellation, release };
}

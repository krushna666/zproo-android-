import type { RequestHandler } from 'express';
import { requireAuth } from '../middleware/auth';
import { validated } from '../middleware/validate';
import type { PaymentService } from '../services/payment.service';
import { sendSuccess } from '../utils/response';
import { requestContext } from './auth.controller';

export interface VerifyPaymentBody {
  bookingRef: string;
  orderId: string;
  paymentId: string;
  signature: string;
}

/** Raw request body, kept by the JSON parser for the webhook route only. */
export const rawBody = (req: Parameters<RequestHandler>[0]): Buffer | undefined =>
  (req as typeof req & { rawBody?: Buffer }).rawBody;

export function createPaymentsController(payments: PaymentService) {
  const create: RequestHandler = async (req, res) => {
    const { bookingRef } = validated<{ bookingRef: string }>(req, 'body');
    sendSuccess(
      res,
      await payments.createOrder(requireAuth(req).userId, bookingRef, requestContext(req)),
      'Payment order created',
      201,
    );
  };

  const verify: RequestHandler = async (req, res) => {
    const body = validated<VerifyPaymentBody>(req, 'body');
    const result = await payments.verify(requireAuth(req).userId, body, requestContext(req));
    sendSuccess(
      res,
      result,
      result.status === 'CONFIRMED'
        ? 'Payment successful. Your booking is confirmed.'
        : 'Payment received',
    );
  };

  const webhook: RequestHandler = async (req, res) => {
    const outcome = await payments.handleWebhook(
      rawBody(req) ?? Buffer.alloc(0),
      req.get('X-Razorpay-Signature') ?? '',
      req.get('X-Razorpay-Event-Id'),
      requestContext(req),
    );
    sendSuccess(res, { outcome }, 'Webhook received');
  };

  const fail: RequestHandler = async (req, res) => {
    const { orderId, reason } = validated<{ orderId: string; reason: string }>(req, 'body');
    await payments.markFailed(requireAuth(req).userId, orderId, reason, requestContext(req));
    sendSuccess(res, null, 'Payment marked as failed. You can try again.');
  };

  const mockComplete: RequestHandler = async (req, res) => {
    const { orderId, outcome } = validated<{ orderId: string; outcome: 'success' | 'failure' }>(
      req,
      'body',
    );
    const result = await payments.simulateMockPayment(
      requireAuth(req).userId,
      orderId,
      outcome,
      requestContext(req),
    );
    sendSuccess(res, result, outcome === 'success' ? 'Payment authorised' : 'Payment failed');
  };

  return { create, verify, webhook, fail, mockComplete };
}

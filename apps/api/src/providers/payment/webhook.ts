import type { GatewayPayment, WebhookEvent } from './PaymentProvider';

interface RazorpayPaymentEntity {
  id?: unknown;
  order_id?: unknown;
  amount?: unknown;
  currency?: unknown;
  status?: unknown;
}

const STATUSES = ['created', 'authorized', 'captured', 'failed', 'refunded'] as const;

export function toGatewayPayment(entity: RazorpayPaymentEntity | undefined): GatewayPayment | null {
  if (!entity) return null;
  const { id, order_id: orderId, amount, currency, status } = entity;
  if (
    typeof id !== 'string' ||
    typeof orderId !== 'string' ||
    typeof amount !== 'number' ||
    !Number.isInteger(amount) ||
    typeof currency !== 'string' ||
    !STATUSES.includes(status as (typeof STATUSES)[number])
  )
    return null;
  return {
    paymentId: id,
    orderId,
    amountPaise: amount,
    currency,
    status: status as GatewayPayment['status'],
  };
}

/** Razorpay webhook body: `{ event, payload: { payment: { entity } } }`. */
export function parseRazorpayWebhook(
  rawBody: Buffer,
  eventIdHeader: string | undefined,
): WebhookEvent | null {
  let body: unknown;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null) return null;
  const { event, payload } = body as {
    event?: unknown;
    payload?: { payment?: { entity?: RazorpayPaymentEntity } };
  };
  if (typeof event !== 'string' || !eventIdHeader || !/^[\w.-]{6,100}$/.test(eventIdHeader))
    return null;
  return {
    eventId: eventIdHeader,
    type: event,
    payment: toGatewayPayment(payload?.payment?.entity),
  };
}

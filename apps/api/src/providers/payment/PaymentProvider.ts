export interface CreateOrderInput {
  amountPaise: number;
  currency: 'INR';
  /** Our reference, shown in the provider's dashboard (the booking reference). */
  receipt: string;
}

export interface VerifySignatureInput {
  orderId: string;
  paymentId: string;
  signature: string;
}

/** A payment as the gateway reports it (source of truth for amount and currency). */
export interface GatewayPayment {
  paymentId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'failed' | 'refunded';
}

export interface WebhookEvent {
  /** Provider's unique event ID (dedupe key). */
  eventId: string;
  /** e.g. `payment.captured`, `order.paid`, `payment.failed` */
  type: string;
  payment: GatewayPayment | null;
}

/**
 * A payment gateway (Razorpay, or the development mock). The server never trusts the browser's
 * word that a payment succeeded: it verifies the gateway's signature and re-reads the payment's
 * amount, currency and order from the gateway. Select with PAYMENT_PROVIDER.
 */
export interface PaymentProvider {
  readonly name: string;
  readonly isDemo: boolean;
  /** Public key for the browser checkout (Razorpay key_id). Never a secret. */
  readonly publicKey: string | null;
  createOrder(input: CreateOrderInput): Promise<{ orderId: string }>;
  /** HMAC-SHA256(`orderId|paymentId`, key secret), compared in constant time. */
  verifySignature(input: VerifySignatureInput): boolean;
  fetchPayment(paymentId: string): Promise<GatewayPayment | null>;
  /** HMAC-SHA256(raw body, webhook secret), compared in constant time. */
  verifyWebhook(rawBody: Buffer, signature: string): boolean;
  /** Parses a verified webhook body; `eventIdHeader` is the provider's event-id header. */
  parseWebhook(rawBody: Buffer, eventIdHeader: string | undefined): WebhookEvent | null;
  refund(paymentId: string, amountPaise: number): Promise<{ refundId: string }>;
}

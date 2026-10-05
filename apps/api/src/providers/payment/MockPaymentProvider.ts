import { createHmac, randomBytes } from 'node:crypto';
import { hmacSha256, safeEqualHex } from '../../utils/crypto';
import type {
  CreateOrderInput,
  GatewayPayment,
  PaymentProvider,
  VerifySignatureInput,
  WebhookEvent,
} from './PaymentProvider';
import { parseRazorpayWebhook } from './webhook';

/** Alphanumeric IDs, like the gateway's own. */
const id = () => randomBytes(8).toString('hex');

/**
 * Development gateway that behaves like Razorpay: orders carry an amount, payments are signed
 * with HMAC-SHA256("orderId|paymentId"), webhooks with HMAC-SHA256(raw body), so the server's
 * verification path is the one real payments take. Refused in production by env validation.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly isDemo = true;
  readonly publicKey = 'rzp_test_mock';
  private readonly keySecret: string;
  readonly webhookSecret: string;
  private readonly orders = new Map<string, { amountPaise: number; currency: string }>();
  private readonly payments = new Map<string, GatewayPayment>();

  constructor(serverSecret: string) {
    this.keySecret = hmacSha256(serverSecret, 'zproo-go:mock-payments:v1');
    this.webhookSecret = hmacSha256(serverSecret, 'zproo-go:mock-webhooks:v1');
  }

  async createOrder(input: CreateOrderInput): Promise<{ orderId: string }> {
    const orderId = `order_mock${id()}`;
    this.orders.set(orderId, { amountPaise: input.amountPaise, currency: input.currency });
    return { orderId };
  }

  verifySignature({ orderId, paymentId, signature }: VerifySignatureInput): boolean {
    return (
      /^[0-9a-f]{64}$/.test(signature) && safeEqualHex(signature, this.sign(orderId, paymentId))
    );
  }

  async fetchPayment(paymentId: string): Promise<GatewayPayment | null> {
    return this.payments.get(paymentId) ?? null;
  }

  verifyWebhook(rawBody: Buffer, signature: string): boolean {
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    return /^[0-9a-f]{64}$/.test(signature) && safeEqualHex(signature, expected);
  }

  parseWebhook(rawBody: Buffer, eventIdHeader: string | undefined): WebhookEvent | null {
    return parseRazorpayWebhook(rawBody, eventIdHeader);
  }

  async refund(paymentId: string): Promise<{ refundId: string }> {
    const payment = this.payments.get(paymentId);
    if (payment) payment.status = 'refunded';
    return { refundId: `rfnd_mock${id()}` };
  }

  /**
   * What the gateway's checkout returns to the browser after the customer pays (development
   * only). The payment is captured for the order's own amount.
   */
  simulateSuccess(orderId: string): { orderId: string; paymentId: string; signature: string } {
    const order = this.orders.get(orderId);
    const paymentId = `pay_mock${id()}`;
    this.payments.set(paymentId, {
      paymentId,
      orderId,
      amountPaise: order?.amountPaise ?? 0,
      currency: order?.currency ?? 'INR',
      status: 'captured',
    });
    return { orderId, paymentId, signature: this.sign(orderId, paymentId) };
  }

  /** Signs a webhook body like the gateway (development and tests). */
  signWebhook(rawBody: string): string {
    return createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
  }

  private sign(orderId: string, paymentId: string): string {
    return hmacSha256(this.keySecret, `${orderId}|${paymentId}`);
  }
}

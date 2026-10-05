import { createHmac } from 'node:crypto';
import { ProviderError } from '../../utils/errors';
import { hmacSha256, safeEqualHex } from '../../utils/crypto';
import type {
  CreateOrderInput,
  GatewayPayment,
  PaymentProvider,
  VerifySignatureInput,
  WebhookEvent,
} from './PaymentProvider';
import { parseRazorpayWebhook, toGatewayPayment } from './webhook';

const API = 'https://api.razorpay.com/v1';
const TIMEOUT_MS = 8_000;

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  fetch?: typeof fetch;
}

/**
 * Razorpay Orders API. Card data never touches ZPROO GO: the customer pays in Razorpay Checkout
 * and the server verifies the signature and re-reads the payment before confirming anything.
 */
export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = 'razorpay';
  readonly isDemo = false;
  readonly publicKey: string;
  private readonly http: typeof fetch;

  constructor(private readonly config: RazorpayConfig) {
    this.publicKey = config.keyId;
    this.http = config.fetch ?? fetch;
  }

  async createOrder(input: CreateOrderInput): Promise<{ orderId: string }> {
    const order = await this.call<{ id?: unknown }>('POST', '/orders', {
      amount: input.amountPaise,
      currency: input.currency,
      receipt: input.receipt,
      payment_capture: 1,
    });
    if (typeof order.id !== 'string') throw new ProviderError(undefined, 'razorpay');
    return { orderId: order.id };
  }

  verifySignature({ orderId, paymentId, signature }: VerifySignatureInput): boolean {
    const expected = hmacSha256(this.config.keySecret, `${orderId}|${paymentId}`);
    return /^[0-9a-f]{64}$/.test(signature) && safeEqualHex(signature, expected);
  }

  async fetchPayment(paymentId: string): Promise<GatewayPayment | null> {
    if (!/^pay_[A-Za-z0-9]{6,40}$/.test(paymentId)) return null;
    return toGatewayPayment(await this.call('GET', `/payments/${paymentId}`));
  }

  verifyWebhook(rawBody: Buffer, signature: string): boolean {
    const expected = createHmac('sha256', this.config.webhookSecret).update(rawBody).digest('hex');
    return /^[0-9a-f]{64}$/.test(signature) && safeEqualHex(signature, expected);
  }

  parseWebhook(rawBody: Buffer, eventIdHeader: string | undefined): WebhookEvent | null {
    return parseRazorpayWebhook(rawBody, eventIdHeader);
  }

  async refund(paymentId: string, amountPaise: number): Promise<{ refundId: string }> {
    const refund = await this.call<{ id?: unknown }>('POST', `/payments/${paymentId}/refund`, {
      amount: amountPaise,
    });
    if (typeof refund.id !== 'string') throw new ProviderError(undefined, 'razorpay');
    return { refundId: refund.id };
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const auth = Buffer.from(`${this.config.keyId}:${this.config.keySecret}`).toString('base64');
    let res: Response;
    try {
      res = await this.http(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Basic ${auth}`,
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new ProviderError(
        "We couldn't reach the payment gateway. Please try again.",
        'razorpay',
      );
    }
    // Never forward the gateway's payload; it may contain internal details.
    if (!res.ok) throw new ProviderError('The payment gateway refused the request.', 'razorpay');
    return (await res.json()) as T;
  }
}

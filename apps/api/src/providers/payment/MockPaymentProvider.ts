import { hmacSha256, randomToken, safeEqualHex } from '../../utils/crypto';
import type { CreateOrderInput, PaymentProvider, VerifyPaymentInput } from './PaymentProvider';

/**
 * Development gateway. Signs payments like Razorpay (HMAC-SHA256 of "orderId|paymentId"), so the
 * verification path is the same one real payments take. Refused in production by env validation.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly isDemo = true;
  readonly publicKey = null;
  private readonly secret: string;

  constructor(serverSecret: string) {
    this.secret = hmacSha256(serverSecret, 'zproo-go:mock-payments:v1');
  }

  async createOrder(_input: CreateOrderInput): Promise<{ orderId: string }> {
    return { orderId: `mockorder_${randomToken(12)}` };
  }

  verifyPayment({ orderId, paymentId, signature }: VerifyPaymentInput): boolean {
    return (
      /^[0-9a-f]{64}$/.test(signature) && safeEqualHex(signature, this.sign(orderId, paymentId))
    );
  }

  /** What the gateway would send back after a successful payment. Development only. */
  simulateSuccess(orderId: string): { paymentId: string; signature: string } {
    const paymentId = `mockpay_${randomToken(12)}`;
    return { paymentId, signature: this.sign(orderId, paymentId) };
  }

  private sign(orderId: string, paymentId: string): string {
    return hmacSha256(this.secret, `${orderId}|${paymentId}`);
  }
}

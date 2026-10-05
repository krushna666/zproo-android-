import type { Env } from '../../config/env';
import { MockPaymentProvider } from './MockPaymentProvider';
import type { PaymentProvider } from './PaymentProvider';
import { RazorpayPaymentProvider } from './RazorpayPaymentProvider';

export { MockPaymentProvider } from './MockPaymentProvider';
export { RazorpayPaymentProvider } from './RazorpayPaymentProvider';
export type {
  CreateOrderInput,
  GatewayPayment,
  PaymentProvider,
  VerifySignatureInput,
  WebhookEvent,
} from './PaymentProvider';

export function createPaymentProvider(
  env: Pick<
    Env,
    | 'PAYMENT_PROVIDER'
    | 'JWT_SECRET'
    | 'RAZORPAY_KEY_ID'
    | 'RAZORPAY_KEY_SECRET'
    | 'RAZORPAY_WEBHOOK_SECRET'
  >,
): PaymentProvider {
  switch (env.PAYMENT_PROVIDER) {
    case 'mock':
      return new MockPaymentProvider(env.JWT_SECRET);
    case 'razorpay':
      // Env validation guarantees all three are set for razorpay.
      return new RazorpayPaymentProvider({
        keyId: env.RAZORPAY_KEY_ID ?? '',
        keySecret: env.RAZORPAY_KEY_SECRET ?? '',
        webhookSecret: env.RAZORPAY_WEBHOOK_SECRET ?? '',
      });
  }
}

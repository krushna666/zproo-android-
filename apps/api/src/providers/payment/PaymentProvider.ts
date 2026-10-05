export interface CreateOrderInput {
  amountPaise: number;
  currency: 'INR';
  /** Our reference, shown in the provider's dashboard (the booking reference). */
  receipt: string;
}

export interface VerifyPaymentInput {
  orderId: string;
  paymentId: string;
  signature: string;
}

/**
 * A payment gateway. Razorpay arrives in Phase 14; any gateway with orders + signed payment
 * confirmation fits. The server never trusts the browser's word that a payment succeeded — it
 * verifies the gateway's signature.
 */
export interface PaymentProvider {
  readonly name: string;
  readonly isDemo: boolean;
  /** Public key for the browser checkout, if the gateway uses one. Never a secret. */
  readonly publicKey: string | null;
  createOrder(input: CreateOrderInput): Promise<{ orderId: string }>;
  verifyPayment(input: VerifyPaymentInput): boolean;
}

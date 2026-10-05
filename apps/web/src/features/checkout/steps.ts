export type CheckoutService = 'flight' | 'bus';

export const STEPS: Record<CheckoutService, readonly string[]> = {
  flight: ['Flights', 'Travellers', 'Review', 'Payment', 'Done'],
  bus: ['Bus', 'Seats', 'Travellers', 'Review', 'Payment', 'Done'],
};

/** Index of each shared step, per service (the bus flow has an extra seat step). */
export const CHECKOUT_STEP: Record<
  CheckoutService,
  Record<'travellers' | 'review' | 'payment' | 'done', number>
> = {
  flight: { travellers: 1, review: 2, payment: 3, done: 4 },
  bus: { travellers: 2, review: 3, payment: 4, done: 5 },
};

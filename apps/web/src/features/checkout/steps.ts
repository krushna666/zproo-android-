export type CheckoutService = 'flight' | 'bus' | 'hotel';

export const STEPS: Record<CheckoutService, readonly string[]> = {
  flight: ['Flights', 'Travellers', 'Review', 'Payment', 'Done'],
  bus: ['Bus', 'Seats', 'Travellers', 'Review', 'Payment', 'Done'],
  hotel: ['Hotel', 'Rooms', 'Guests', 'Review', 'Payment', 'Done'],
};

/** Index of each shared step, per service (buses and hotels have an extra selection step). */
export const CHECKOUT_STEP: Record<
  CheckoutService,
  Record<'travellers' | 'review' | 'payment' | 'done', number>
> = {
  flight: { travellers: 1, review: 2, payment: 3, done: 4 },
  bus: { travellers: 2, review: 3, payment: 4, done: 5 },
  hotel: { travellers: 2, review: 3, payment: 4, done: 5 },
};

/** How each service names its supplier, its travel document and the supplier's reference. */
export const SERVICE_TEXT: Record<
  CheckoutService,
  { supplier: string; document: string; reference: string; confirming: string }
> = {
  flight: {
    supplier: 'airline',
    document: 'e-ticket',
    reference: 'Airline PNR',
    confirming: 'Issuing tickets with the airline…',
  },
  bus: {
    supplier: 'operator',
    document: 'e-ticket',
    reference: 'Operator PNR',
    confirming: 'Issuing tickets with the operator…',
  },
  hotel: {
    supplier: 'hotel',
    document: 'voucher',
    reference: 'Hotel confirmation number',
    confirming: 'Confirming your rooms with the hotel…',
  },
};

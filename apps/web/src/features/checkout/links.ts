import type { CheckoutService } from './steps';

const BASE: Record<CheckoutService, string> = {
  flight: '/flights',
  bus: '/buses',
  hotel: '/hotels',
};

export const serviceOf = (booking: { serviceType: string }): CheckoutService =>
  booking.serviceType === 'BUS' ? 'bus' : booking.serviceType === 'HOTEL' ? 'hotel' : 'flight';

/** The service a shared checkout page (payment, confirmation) was opened for. */
export const serviceFromPath = (pathname: string): CheckoutService =>
  pathname.startsWith('/buses') ? 'bus' : pathname.startsWith('/hotels') ? 'hotel' : 'flight';

export const paymentUrl = (service: CheckoutService, reference: string) =>
  `${BASE[service]}/payment?ref=${encodeURIComponent(reference)}`;

export const confirmationUrl = (service: CheckoutService, reference: string) =>
  `${BASE[service]}/confirmation?ref=${encodeURIComponent(reference)}`;

export const searchHome = (service: CheckoutService) => BASE[service];

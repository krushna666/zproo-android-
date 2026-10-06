import type { BookingDetails, FlightBookResponse, FlightOfferDetails } from '@zproo/types';
import { addDays, todayInIst } from '@zproo/validation';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFlightDraft } from '@/features/flights/draft';
import { makeDetails, makeSearch, OFFERS } from '@/features/flights/test/fixtures';
import type * as httpModule from '@/services/http';
import { apiGet, apiPost, ApiClientError } from '@/services/http';
import { makeUser, renderRoute } from '@/test/render';

vi.mock('@/services/http', async (importOriginal) => ({
  ...(await importOriginal<typeof httpModule>()),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

const get = vi.mocked(apiGet);
const post = vi.mocked(apiPost);
const DATE = addDays(todayInIst(), 20);
const RESULTS = `/flights/search?from=PNQ&to=DEL&date=${DATE}&adults=1&children=0&infants=0&cabin=ECONOMY`;
const OFFER = OFFERS[0] as (typeof OFFERS)[number];
const DETAILS = makeDetails(OFFER);
const OFFER_URL = `/flights/offer/${OFFER.offerId}`;

function serve(routes: (url: string, params?: Record<string, string>) => unknown) {
  get.mockImplementation(async (url: string, config?: { params?: Record<string, string> }) => {
    const found = routes(url, config?.params);
    if (found instanceof Error) throw found;
    if (found === undefined) throw new ApiClientError('Not found', 404, 'NOT_FOUND');
    return found;
  });
}

const flightRoutes = (url: string): unknown => {
  if (url === '/flights/search') return makeSearch();
  if (url === `/flights/${OFFER.offerId}`) return DETAILS;
  return undefined;
};

function flightBooking(overrides: Partial<BookingDetails> = {}): BookingDetails {
  const fare = DETAILS.fareFamilies[1] as FlightOfferDetails['fareFamilies'][number];
  return {
    reference: 'ZF00000ABC12',
    serviceType: 'FLIGHT',
    status: 'HELD',
    paymentStatus: 'CREATED',
    createdAt: '2026-09-26T10:00:00.000Z',
    holdExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    serverNow: new Date().toISOString(),
    coupon: null,
    demo: true,
    confirmedAt: null,
    cancelledAt: null,
    travelDate: '2026-10-25',
    price: {
      lines: [
        { label: 'Base fare — Adult × 1', amountPaise: fare.perPax.ADULT.base },
        { label: 'Taxes (GST)', amountPaise: fare.perPax.ADULT.taxes },
        { label: 'Airport fees', amountPaise: fare.perPax.ADULT.fees },
      ],
      basePaise: fare.perPax.ADULT.base,
      taxesPaise: fare.perPax.ADULT.taxes + fare.perPax.ADULT.fees,
      feesPaise: 0,
      discountPaise: 0,
      totalPaise: fare.total,
      currency: 'INR',
    },
    contact: { email: 'amit@example.com', phone: '+919876543210' },
    passengers: [
      {
        id: 'p1',
        type: 'ADULT',
        title: 'MR',
        firstName: 'Amit',
        lastName: 'Sharma',
        dateOfBirth: null,
        travellingWith: null,
        age: null,
        gender: 'MALE',
        seatNumber: null,
      },
    ],
    flights: [{ sequence: 1, offer: OFFER, fare, pnr: null, tickets: [] }],
    bus: null,
    hotel: null,
    ...overrides,
  };
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  useFlightDraft.getState().clear();
  window.sessionStorage.clear();
});

describe('flight search form', () => {
  it('toggles one-way / round-trip and applies the passenger rules inline', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/flights');
    await user.click(await screen.findByTestId('flight-trip-round'));
    expect(screen.getByTestId('flight-search-return')).toBeEnabled();
    await user.click(screen.getByTestId('flight-trip-oneway'));
    expect(screen.getByTestId('flight-search-return')).toBeDisabled();

    await user.click(screen.getByTestId('flight-pax-open'));
    await user.click(screen.getByTestId('flight-pax-infants-inc'));
    await user.click(screen.getByTestId('flight-pax-infants-inc'));
    expect(await screen.findByTestId('field-error-pax')).toHaveTextContent(
      'Each infant must travel with an adult',
    );
    await user.click(screen.getByTestId('flight-pax-adults-inc'));
    expect(screen.queryByTestId('field-error-pax')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('flight-cabin-business'));
    await user.click(screen.getByTestId('flight-pax-done'));
    await user.click(screen.getByTestId('flight-search-submit'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/flights/search'));
    expect(router.state.location.search).toContain('adults=2&children=0&infants=2&cabin=BUSINESS');
  });
});

describe('flight results', () => {
  it('lists flights with data attributes, sorts and filters through the URL', async () => {
    serve(flightRoutes);
    const user = userEvent.setup();
    const { router } = renderRoute(RESULTS);
    expect(await screen.findByText('3 flights found')).toHaveAttribute(
      'data-testid',
      'flight-results-count',
    );
    const card = screen.getByTestId(`flight-result-card-${OFFER.offerId}`);
    expect(card).toHaveAttribute('data-price', '489900');
    expect(card).toHaveAttribute('data-duration', '140');
    expect(card).toHaveAttribute('data-stops', '0');
    expect(within(card).getByText('Refundable')).toBeInTheDocument();
    const night = screen.getByTestId(`flight-result-card-${OFFERS[2]?.offerId}`);
    expect(within(night).getByText('+1')).toBeInTheDocument();
    expect(screen.getByText('1 stop via BLR (1h 25m)')).toBeInTheDocument();
    expect(screen.getByText('3 seats left')).toBeInTheDocument();

    // "Best" first by default (price + journey time).
    expect(screen.getAllByRole('article')[0]).toHaveAccessibleName(/Deccan Blue/);
    await user.click(screen.getByTestId('flight-sort-cheapest'));
    expect(screen.getAllByRole('article')[0]).toHaveAccessibleName(/Monsoon Airways/);
    expect(router.state.location.search).toContain('sort=cheapest');
    await user.click(screen.getAllByTestId('flight-filter-stops-0')[0] as HTMLElement);
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(router.state.location.search).toContain('stops=0');
    expect(screen.getByTestId(`flight-view-fares-${OFFER.offerId}`)).toHaveAttribute(
      'href',
      OFFER_URL,
    );
  });

  it('shows the empty state with nearby dates, and the error with Retry', async () => {
    serve((url) => (url === '/flights/search' ? makeSearch([]) : undefined));
    const { unmount } = renderRoute(RESULTS);
    expect(await screen.findByText('No flights found')).toBeInTheDocument();
    unmount();
    serve((url) =>
      url === '/flights/search' ? new ApiClientError('down', 502, 'PROVIDER_ERROR') : undefined,
    );
    renderRoute(RESULTS);
    expect(await screen.findByTestId('flight-results-error')).toHaveTextContent(
      "We couldn't reach the operator right now. Please try again.",
    );
  });

  it('explains an invalid deep link', async () => {
    renderRoute(`/flights/search?from=PNQ&to=DEL&date=${DATE}&returnDate=${addDays(DATE, -2)}`);
    expect(await screen.findByTestId('flight-results-error')).toHaveTextContent(
      'Return date must be on or after the departure date',
    );
  });

  it('picks outbound and return flights for a round trip', async () => {
    const back = { ...OFFER, offerId: 'off_DELPNQ_20261029_E_100_04_t1abcd_0123abcd' };
    serve((url) =>
      url === '/flights/search'
        ? makeSearch(OFFERS, { returnDate: addDays(DATE, 4), returnOffers: [back] })
        : undefined,
    );
    const user = userEvent.setup();
    const { router } = renderRoute(`${RESULTS}&returnDate=${addDays(DATE, 4)}`);
    await screen.findAllByRole('article');
    const continueButton = screen.getByTestId('flight-continue');
    expect(continueButton).toBeDisabled();
    await user.click(screen.getByTestId(`flight-select-out-${OFFER.offerId}`));
    await user.click(screen.getByTestId(`flight-select-ret-${back.offerId}`));
    expect(screen.getByTestId('flight-roundtrip-total')).toHaveTextContent('₹9,798');
    await user.click(continueButton);
    await waitFor(() => expect(router.state.location.pathname).toBe(OFFER_URL));
    expect(router.state.location.search).toBe(`?return=${back.offerId}`);
  });
});

describe('fare selection', () => {
  it('chooses a fare family and deep-logs-in guests with the draft', async () => {
    serve(flightRoutes);
    const user = userEvent.setup();
    const { router } = renderRoute(OFFER_URL);
    const flexi = await screen.findByTestId('flight-fare-fare_a1b2c3_flexi');
    expect(within(flexi).getByText('Most popular')).toBeInTheDocument();
    expect(screen.getByTestId('flight-fare-timer')).toHaveTextContent(/Fare valid for \d{2}:\d{2}/);
    await user.click(flexi);
    expect(flexi).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('flight-fare-total')).toHaveTextContent('₹5,479');
    await user.click(screen.getByTestId('flight-continue'));
    await screen.findByRole('heading', { level: 1, name: 'Welcome back' });
    expect(router.state.location.search).toBe(`?returnTo=${encodeURIComponent(OFFER_URL)}`);
    expect(useFlightDraft.getState().selection).toMatchObject({
      offerId: OFFER.offerId,
      fareId: 'fare_a1b2c3_flexi',
      pax: { adults: 1, children: 0, infants: 0 },
      expectedTotal: DETAILS.fareFamilies[1]?.total,
    });
  });

  it('says when the fare is no longer available', async () => {
    serve((url) =>
      url.startsWith('/flights/') ? new ApiClientError('gone', 409, 'FARE_UNAVAILABLE') : undefined,
    );
    renderRoute(OFFER_URL);
    expect(await screen.findByTestId('flight-fare-unavailable')).toHaveTextContent(
      'This fare is no longer available. Please choose another flight or fare.',
    );
    expect(screen.getByRole('link', { name: 'Search again' })).toHaveAttribute('href', '/flights');
  });

  it('re-prices automatically when the fare expires and asks before a new price', async () => {
    const expired = {
      ...DETAILS,
      serverNow: new Date().toISOString(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    };
    const renewed = makeDetails({
      ...OFFER,
      offerId: 'off_PNQDEL_20261025_E_100_00_t9abcd_0123abcd',
    });
    const dearer = {
      ...renewed,
      fareFamilies: renewed.fareFamilies.map((f, i) =>
        i === 0 ? { ...f, total: f.total + 52_500 } : f,
      ),
    };
    serve((url, params) =>
      url === `/flights/${OFFER.offerId}`
        ? params?.reprice === '1'
          ? dearer
          : expired
        : undefined,
    );
    renderRoute(OFFER_URL);
    const dialog = await screen.findByTestId('dialog-price-changed');
    expect(dialog).toHaveTextContent('The fare changed from ₹4,954 to ₹5,479.');
    expect(within(dialog).getByTestId('dialog-price-continue')).toHaveTextContent(
      'Continue at ₹5,479',
    );
  });
});

describe('flight checkout', () => {
  const start = (pax = { adults: 1, children: 0, infants: 0 }) =>
    useFlightDraft.getState().start({
      offerId: OFFER.offerId,
      fareId: 'fare_a1b2c3_flexi',
      pax,
      expectedTotal: DETAILS.fareFamilies[1]?.total ?? 0,
      offerUrl: OFFER_URL,
    });
  const held: FlightBookResponse = {
    bookingRef: 'ZF00000ABC12',
    status: 'HELD',
    holdExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    serverNow: new Date().toISOString(),
    priceBreakdown: flightBooking().price,
  };

  it('collects travellers with infant links and DOB rules, then holds the fare', async () => {
    const pax = { adults: 1, children: 0, infants: 1 };
    start(pax);
    const details = makeDetails(OFFER, pax);
    useFlightDraft.setState((s) => ({
      selection: s.selection && {
        ...s.selection,
        expectedTotal: details.fareFamilies[1]?.total ?? 0,
      },
    }));
    serve((url) =>
      url === `/flights/${OFFER.offerId}`
        ? details
        : url.startsWith('/bookings/')
          ? flightBooking()
          : undefined,
    );
    const user = userEvent.setup();
    const { router } = renderRoute('/flights/booking', makeUser({ fullName: 'Amit Sharma' }));
    expect(
      await screen.findByText("Enter names exactly as on the government ID you'll carry."),
    ).toBeInTheDocument();
    expect(screen.getByTestId('checkout-traveller-0-first-name')).toHaveValue('Amit');
    expect(screen.getByTestId('checkout-traveller-1-infant-of')).toHaveValue('0');
    await user.type(screen.getByTestId('checkout-traveller-1-first-name'), 'Aanya');
    await user.type(screen.getByTestId('checkout-traveller-1-last-name'), 'Sharma');
    await user.selectOptions(screen.getByTestId('checkout-traveller-1-title'), 'MISS');
    await user.click(screen.getByTestId('checkout-travellers-continue'));
    expect(await screen.findByTestId('field-error-traveller-1-dob')).toHaveTextContent(
      'Enter a valid date of birth',
    );

    await user.type(screen.getByTestId('checkout-traveller-1-dob'), addDays(todayInIst(), -200));
    post.mockResolvedValueOnce(held);
    await user.click(screen.getByTestId('checkout-travellers-continue'));
    await screen.findByRole('heading', { level: 1, name: 'Review your booking' });
    expect(router.state.location.search).toBe('?ref=ZF00000ABC12');
    expect(post).toHaveBeenCalledWith(
      '/flights/book',
      {
        offerId: OFFER.offerId,
        fareId: 'fare_a1b2c3_flexi',
        travellers: [
          { type: 'ADULT', title: 'MR', firstName: 'Amit', lastName: 'Sharma', gender: 'MALE' },
          {
            type: 'INFANT',
            title: 'MISS',
            firstName: 'Aanya',
            lastName: 'Sharma',
            gender: 'MALE',
            dob: addDays(todayInIst(), -200),
            infantOfIndex: 0,
          },
        ],
        contact: { email: 'amit@example.com', mobile: '+919876543210' },
        expectedTotal: details.fareFamilies[1]?.total,
      },
      { headers: { 'Idempotency-Key': useFlightDraft.getState().idempotencyKey } },
    );
  });

  it('asks before continuing at a changed fare and re-submits with a new key', async () => {
    start();
    serve((url) =>
      url === `/flights/${OFFER.offerId}`
        ? DETAILS
        : url.startsWith('/bookings/')
          ? flightBooking()
          : undefined,
    );
    const user = userEvent.setup();
    renderRoute('/flights/booking', makeUser({ fullName: 'Amit Sharma' }));
    await screen.findByTestId('checkout-traveller-0-first-name');
    post.mockRejectedValueOnce(
      new ApiClientError('changed', 409, 'PRICE_CHANGED', { oldTotal: 547_900, newTotal: 600_400 }),
    );
    await user.click(screen.getByTestId('checkout-travellers-continue'));
    expect(await screen.findByTestId('dialog-price-changed')).toHaveTextContent(
      'The fare changed from ₹5,479 to ₹6,004.',
    );
    const firstKey = (post.mock.calls[0]?.[2] as { headers: Record<string, string> }).headers[
      'Idempotency-Key'
    ];
    post.mockResolvedValueOnce(held);
    await user.click(screen.getByTestId('dialog-price-continue'));
    await screen.findByRole('heading', { level: 1, name: 'Review your booking' });
    const retry = post.mock.calls[1];
    expect((retry?.[1] as { expectedTotal: number }).expectedTotal).toBe(600_400);
    expect((retry?.[2] as { headers: Record<string, string> }).headers['Idempotency-Key']).not.toBe(
      firstKey,
    );
  });

  it('reviews with fare benefits, coupon and required terms', async () => {
    serve((url) => (url === '/bookings/ZF00000ABC12' ? flightBooking() : undefined));
    const user = userEvent.setup();
    const { router } = renderRoute('/flights/review?ref=ZF00000ABC12', makeUser());
    expect(await screen.findByTestId('checkout-hold-timer')).toBeInTheDocument();
    expect(screen.getByText('Fare benefits')).toBeInTheDocument();
    expect(screen.getByText('Base fare — Adult × 1')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-coupon-input')).toBeInTheDocument();
    await user.click(screen.getByTestId('checkout-proceed'));
    expect(await screen.findByTestId('field-error-terms')).toBeInTheDocument();
    await user.click(screen.getByTestId('checkout-terms'));
    post.mockResolvedValue({
      orderId: 'order_mock1',
      amount: 547_900,
      currency: 'INR',
      keyId: null,
      provider: 'mock',
      bookingRef: 'ZF00000ABC12',
      holdExpiresAt: null,
      serverNow: new Date().toISOString(),
    });
    await user.click(screen.getByTestId('checkout-proceed'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/flights/payment'));
  });

  it('shows "Confirming with the airline..." while ticketing is pending', async () => {
    serve((url) =>
      url.startsWith('/bookings/')
        ? flightBooking({
            status: 'PAYMENT_PENDING',
            paymentStatus: 'CAPTURED',
            holdExpiresAt: null,
          })
        : undefined,
    );
    renderRoute('/flights/confirmation?ref=ZF00000ABC12', makeUser());
    expect(await screen.findByTestId('flight-status-pending')).toHaveTextContent(
      'Confirming with the airline...',
    );
  });

  it('shows the refund when the airline could not issue', async () => {
    serve((url) =>
      url.startsWith('/bookings/')
        ? flightBooking({ status: 'FAILED', paymentStatus: 'REFUND_DUE', holdExpiresAt: null })
        : undefined,
    );
    renderRoute('/flights/confirmation?ref=ZF00000ABC12', makeUser());
    expect(
      await screen.findByText(
        "We couldn't confirm your ticket with the airline. Your refund of ₹5,479 has been started.",
      ),
    ).toBeInTheDocument();
  });

  it('shows the PNR and ticket numbers once confirmed', async () => {
    const confirmed = flightBooking({
      status: 'CONFIRMED',
      paymentStatus: 'CAPTURED',
      holdExpiresAt: null,
    });
    const leg = confirmed.flights[0];
    if (leg) {
      leg.pnr = 'Q7X2KD';
      leg.tickets = [{ passengerId: 'p1', ticketNumber: '9811234567890', segmentKey: 'PNQ-DEL' }];
    }
    serve((url) => (url.startsWith('/bookings/') ? confirmed : undefined));
    renderRoute('/flights/confirmation?ref=ZF00000ABC12', makeUser());
    expect(await screen.findByText('Your trip is booked!')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-pnr')).toHaveTextContent('Q7X2KD');
    expect(screen.getByText('9811234567890')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-download-pdf')).toBeEnabled();
    await act(async () => undefined);
  });
});

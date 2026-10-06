import type { BookingDetails, BusBookResponse, BusSeatMap } from '@zproo/types';
import { addDays, todayInIst } from '@zproo/validation';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Toaster } from '@zproo/ui';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBusDraft } from '@/features/buses/draft';
import { makeDetails, makeSearch, makeSeatMap, TRIPS } from '@/features/buses/test/fixtures';
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
const DATE = addDays(todayInIst(), 10);
const RESULTS = `/buses/search?from=PNQ&to=BOM&date=${DATE}`;
const TRIP = makeDetails();
const SEATS_URL = `/buses/${TRIP.tripId}/seats`;

function serve(routes: (url: string) => unknown) {
  get.mockImplementation(async (url: string) => {
    const found = routes(url);
    if (found instanceof Error) throw found;
    if (found === undefined) throw new ApiClientError('Not found', 404, 'NOT_FOUND');
    return found;
  });
}

const busRoutes = (url: string): unknown => {
  if (url === '/buses/search') return makeSearch();
  if (url === `/buses/${TRIP.tripId}`) return TRIP;
  if (url === SEATS_URL) return makeSeatMap(TRIP.tripId);
  return undefined;
};

function busBooking(overrides: Partial<BookingDetails> = {}): BookingDetails {
  return {
    reference: 'ZB00000BUS12',
    serviceType: 'BUS',
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
        { label: 'Base fare — 2 seats', amountPaise: 237_904 },
        { label: 'GST (5%)', amountPaise: 11_896 },
      ],
      basePaise: 237_904,
      taxesPaise: 11_896,
      feesPaise: 0,
      discountPaise: 0,
      totalPaise: 249_800,
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
        age: 34,
        gender: 'MALE',
        seatNumber: 'L1',
      },
      {
        id: 'p2',
        type: 'ADULT',
        title: 'MS',
        firstName: 'Priya',
        lastName: 'Sharma',
        dateOfBirth: null,
        travellingWith: null,
        age: 31,
        gender: 'FEMALE',
        seatNumber: 'L3',
      },
    ],
    flights: [],
    bus: {
      trip: TRIP,
      seats: ['L1', 'L3'],
      boardingPoint: TRIP.boardingPoints[0] as (typeof TRIP.boardingPoints)[number],
      droppingPoint: TRIP.droppingPoints[1] as (typeof TRIP.droppingPoints)[number],
      pnr: null,
    },
    hotel: null,
    ...overrides,
  };
}

const seat = (name: RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  useBusDraft.getState().clear();
  window.sessionStorage.clear();
});

describe('bus results', () => {
  it('lists buses with the contract data attributes, sorts and filters through the URL', async () => {
    serve(busRoutes);
    const user = userEvent.setup();
    const { router } = renderRoute(RESULTS);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Pune → Mumbai' }),
    ).toBeInTheDocument();
    expect(await screen.findByTestId('bus-results-count')).toHaveTextContent('3 buses found');
    expect(get).toHaveBeenCalledWith('/buses/search', {
      params: { from: 'PNQ', to: 'BOM', date: DATE },
    });
    const card = screen.getByTestId(`bus-result-card-${TRIP.tripId}`);
    expect(card).toHaveAttribute('data-price', '124900');
    expect(card).toHaveAttribute('data-duration', '210');
    expect(card).toHaveAttribute('data-departure', '2026-10-25T21:30:00+05:30');
    expect(within(card).getByText('+1')).toBeInTheDocument();
    expect(screen.getByText('Only 4 seats left')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/buses, operators and payments/i);

    // Earliest first by default.
    expect(screen.getAllByRole('article')[0]).toHaveAccessibleName(/Pune Pravas/);
    await user.click(screen.getByTestId('bus-sort-latest'));
    expect(screen.getAllByRole('article')[0]).toHaveAccessibleName(/Sahyadri Skyline/);
    expect(router.state.location.search).toContain('sort=latest');

    await user.click(screen.getAllByTestId('bus-filter-sleeper')[0] as HTMLElement);
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(router.state.location.search).toContain('type=sleeper');
    await user.click(screen.getByRole('button', { name: 'Remove filter Sleeper' }));
    expect(screen.getAllByRole('article')).toHaveLength(3);
  });

  it('restores filters from a shared link and offers "Clear filters" when nothing matches', async () => {
    serve(busRoutes);
    const user = userEvent.setup();
    renderRoute(`${RESULTS}&type=nonac&rating=4`);
    expect(await screen.findByText('No buses match your filters')).toBeInTheDocument();
    expect(screen.getByTestId('bus-results-empty')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findAllByRole('article')).toHaveLength(3);
  });

  it('shows the empty state with other dates', async () => {
    serve((url) => (url === '/buses/search' ? makeSearch([]) : undefined));
    renderRoute(RESULTS);
    expect(await screen.findByText('No buses found for this date')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /\d{1,2} [A-Z][a-z]{2}/ }).length).toBeGreaterThan(
      0,
    );
  });

  it('shows the provider error with Retry', async () => {
    serve(() => new ApiClientError('down', 502, 'PROVIDER_ERROR'));
    const user = userEvent.setup();
    renderRoute(RESULTS);
    const error = await screen.findByTestId('bus-results-error');
    expect(error).toHaveTextContent("We couldn't reach the operator right now. Please try again.");
    serve(busRoutes);
    await user.click(within(error).getByRole('button', { name: 'Retry' }));
    expect(await screen.findAllByRole('article')).toHaveLength(3);
  });

  it('explains an invalid deep link and pre-fills what was valid', async () => {
    renderRoute('/buses/search?from=PNQ&to=PNQ&date=2020-01-01');
    const error = await screen.findByTestId('bus-results-error');
    expect(error).toHaveTextContent('Choose different cities for From and To');
    expect(error).toHaveTextContent('Choose a date within the next 120 days');
    expect(screen.getByTestId('bus-search-from')).toHaveValue('Pune');
  });

  it('has a date strip with the ±3 days', async () => {
    serve(busRoutes);
    renderRoute(RESULTS);
    await screen.findAllByRole('article');
    expect(screen.getByTestId(`bus-date-strip-${DATE}`)).toHaveAttribute('aria-current', 'date');
    expect(screen.getByTestId(`bus-date-strip-${addDays(DATE, 3)}`)).toHaveAttribute(
      'href',
      `/buses/search?from=PNQ&to=BOM&date=${addDays(DATE, 3)}`,
    );
  });
});

describe('seat selection', () => {
  it('selects seats with the keyboard-operable map and deep-logs-in guests with a draft', async () => {
    serve(busRoutes);
    const user = userEvent.setup();
    const { router } = renderRoute(SEATS_URL);
    await screen.findByTestId('bus-seat-L2');

    expect(seat(/Seat L2, lower deck, sleeper, ₹1,249, booked/)).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByTestId('bus-seat-L2')).toHaveAttribute('data-status', 'BOOKED');
    const continueButton = screen.getByTestId('bus-seats-continue');
    expect(continueButton).toBeDisabled();

    await user.click(screen.getByTestId('bus-seat-L1'));
    expect(screen.getByTestId('bus-seat-L1')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('bus-seat-L1')).toHaveAttribute('data-status', 'SELECTED');
    // Ladies seat: allowed, with the note.
    await user.click(screen.getByTestId('bus-seat-L3'));
    expect(
      screen.getByText("This seat is reserved for women. You'll need to enter a female traveller."),
    ).toBeInTheDocument();
    expect(screen.getByTestId('bus-seats-total')).toHaveTextContent('₹2,498');
    expect(screen.getByText('Choose a boarding point')).toBeInTheDocument();

    await user.click(screen.getByTestId('bus-boarding-bp_2'));
    await user.click(screen.getByTestId('bus-dropping-dp_2'));
    expect(continueButton).toBeEnabled();
    await user.click(continueButton);

    await screen.findByRole('heading', { level: 1, name: 'Welcome back' });
    expect(router.state.location.search).toBe(`?returnTo=${encodeURIComponent(SEATS_URL)}`);
    expect(
      JSON.parse(window.sessionStorage.getItem('zproo:draft:bus') ?? '{}').state,
    ).toMatchObject({
      selection: {
        tripId: TRIP.tripId,
        seats: [
          { seatNo: 'L1', price: 124_900, ladiesOnly: false },
          { seatNo: 'L3', price: 124_900, ladiesOnly: true },
        ],
        boardingPointId: 'bp_2',
        droppingPointId: 'dp_2',
        expectedTotal: 249_800,
      },
    });
  });

  it('moves focus with arrow keys (roving tabindex)', async () => {
    serve(busRoutes);
    renderRoute(SEATS_URL, makeUser());
    const l1 = await screen.findByTestId('bus-seat-L1');
    expect(l1).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('bus-seat-L4')).toHaveAttribute('tabindex', '-1');
    l1.focus();
    fireEvent.keyDown(l1, { key: 'ArrowDown' });
    expect(screen.getByTestId('bus-seat-L4')).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('bus-seat-L4'), { key: 'ArrowRight' });
    expect(screen.getByTestId('bus-seat-L5')).toHaveFocus();
    expect(screen.getByTestId('bus-seat-L5')).toHaveAttribute('tabindex', '0');
  });

  it('allows at most 6 seats', async () => {
    const map = makeSeatMap(TRIP.tripId);
    const lower = map.decks[0] as BusSeatMap['decks'][number];
    for (const s of lower.seats) s.status = 'AVAILABLE';
    serve((url) => (url === SEATS_URL ? map : busRoutes(url)));
    render(<Toaster />);
    renderRoute(SEATS_URL, makeUser());
    await screen.findByTestId('bus-seat-L1');
    for (const n of ['L1', 'L2', 'L4', 'L5', 'L6', 'U1', 'U2']) {
      fireEvent.click(screen.getByTestId(`bus-seat-${n}`));
    }
    expect(await screen.findByText('You can select up to 6 seats')).toBeInTheDocument();
    expect(screen.getByTestId('bus-seat-U2')).toHaveAttribute('aria-pressed', 'false');
  });

  it('restores the draft after login and drops a seat that was taken meanwhile', async () => {
    const map = makeSeatMap(TRIP.tripId);
    const l1 = map.decks[0]?.seats.find((s) => s.seatNo === 'L1');
    if (l1) l1.status = 'BOOKED';
    serve((url) => (url === SEATS_URL ? map : busRoutes(url)));
    useBusDraft.getState().start({
      tripId: TRIP.tripId,
      seats: [
        { seatNo: 'L1', price: 124_900, ladiesOnly: false },
        { seatNo: 'L4', price: 124_900, ladiesOnly: false },
      ],
      boardingPointId: 'bp_1',
      droppingPointId: 'dp_2',
      expectedTotal: 249_800,
      seatsUrl: SEATS_URL,
    });
    renderRoute(SEATS_URL, makeUser());
    expect(
      await screen.findByText(
        'Seat L1 was just booked by someone else. Please choose another seat.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('bus-seat-L4')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('bus-seats-total')).toHaveTextContent('₹1,249');
    expect(screen.getByTestId('bus-boarding-bp_1').querySelector('input')).toBeChecked();
  });

  it('says when booking has closed', async () => {
    serve((url) =>
      url === `/buses/${TRIP.tripId}` ? makeDetails({ bookable: false }) : busRoutes(url),
    );
    renderRoute(SEATS_URL, makeUser());
    expect(await screen.findByText('Booking for this bus has closed')).toBeInTheDocument();
  });
});

describe('bus checkout', () => {
  beforeEach(() => {
    useBusDraft.getState().start({
      tripId: TRIP.tripId,
      seats: [
        { seatNo: 'L1', price: 124_900, ladiesOnly: false },
        { seatNo: 'L3', price: 124_900, ladiesOnly: true },
      ],
      boardingPointId: 'bp_1',
      droppingPointId: 'dp_2',
      expectedTotal: 249_800,
      seatsUrl: SEATS_URL,
    });
  });

  const held: BusBookResponse = {
    bookingRef: 'ZB00000BUS12',
    status: 'HELD',
    holdExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    serverNow: new Date().toISOString(),
    priceBreakdown: busBooking().price,
  };

  async function fillTravellers(user: ReturnType<typeof userEvent.setup>, secondGender = 'female') {
    await user.type(await screen.findByTestId('checkout-traveller-0-name'), 'Amit Sharma');
    await user.type(screen.getByTestId('checkout-traveller-0-age'), '34');
    await user.type(screen.getByTestId('checkout-traveller-1-name'), 'Priya Sharma');
    await user.type(screen.getByTestId('checkout-traveller-1-age'), '31');
    await user.click(screen.getByTestId(`checkout-traveller-1-gender-${secondGender}`));
  }

  it('asks for a bus when none is selected', async () => {
    useBusDraft.getState().clear();
    renderRoute('/buses/booking', makeUser());
    expect(
      await screen.findByRole('heading', { level: 1, name: 'No bus selected' }),
    ).toBeInTheDocument();
  });

  it('keeps the ladies seat for women, then holds the seats with one request', async () => {
    serve(busRoutes);
    const user = userEvent.setup();
    const { router } = renderRoute('/buses/booking', makeUser({ fullName: '' }));
    await screen.findByRole('heading', { level: 1, name: 'Traveller details' });
    await fillTravellers(user, 'male');
    expect(screen.getAllByText('As on your ID — used for tickets')).toHaveLength(2);
    await user.click(screen.getByTestId('checkout-travellers-continue'));
    expect(await screen.findByTestId('field-error-traveller-1-gender')).toHaveTextContent(
      'This seat is reserved for women',
    );

    await user.click(screen.getByTestId('checkout-traveller-1-gender-female'));
    post.mockResolvedValueOnce(held);
    serve((url) => (url.startsWith('/bookings/') ? busBooking() : busRoutes(url)));
    await user.click(screen.getByTestId('checkout-travellers-continue'));
    await screen.findByRole('heading', { level: 1, name: 'Review your booking' });
    expect(router.state.location.search).toBe('?ref=ZB00000BUS12');
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      '/buses/book',
      {
        tripId: TRIP.tripId,
        seats: ['L1', 'L3'],
        boardingPointId: 'bp_1',
        droppingPointId: 'dp_2',
        travellers: [
          { seatNo: 'L1', name: 'Amit Sharma', age: 34, gender: 'MALE' },
          { seatNo: 'L3', name: 'Priya Sharma', age: 31, gender: 'FEMALE' },
        ],
        contact: { email: 'amit@example.com', mobile: '+919876543210' },
        expectedTotal: 249_800,
      },
      { headers: { 'Idempotency-Key': useBusDraft.getState().idempotencyKey } },
    );
  });

  it('asks before continuing at a changed fare, then re-submits with a new key', async () => {
    serve(busRoutes);
    const user = userEvent.setup();
    renderRoute('/buses/booking', makeUser());
    await fillTravellers(user);
    post.mockRejectedValueOnce(
      new ApiClientError('changed', 409, 'PRICE_CHANGED', {
        oldTotal: 249_800,
        newTotal: 264_800,
      }),
    );
    await user.click(screen.getByTestId('checkout-travellers-continue'));
    const dialog = await screen.findByTestId('dialog-price-changed');
    expect(dialog).toHaveTextContent('The fare changed from ₹2,498 to ₹2,648.');
    const firstKey = (post.mock.calls[0]?.[2] as { headers: Record<string, string> }).headers[
      'Idempotency-Key'
    ];

    post.mockResolvedValueOnce({
      ...held,
      priceBreakdown: { ...held.priceBreakdown, totalPaise: 264_800 },
    });
    serve((url) => (url.startsWith('/bookings/') ? busBooking() : busRoutes(url)));
    await user.click(screen.getByTestId('dialog-price-continue'));
    await screen.findByRole('heading', { level: 1, name: 'Review your booking' });
    const retry = post.mock.calls[1];
    expect((retry?.[1] as { expectedTotal: number }).expectedTotal).toBe(264_800);
    expect((retry?.[2] as { headers: Record<string, string> }).headers['Idempotency-Key']).not.toBe(
      firstKey,
    );
  });

  it('reviews with coupon and required terms, then goes to payment', async () => {
    serve((url) => (url === '/bookings/ZB00000BUS12' ? busBooking() : busRoutes(url)));
    const user = userEvent.setup();
    const { router } = renderRoute('/buses/review?ref=ZB00000BUS12', makeUser());
    expect(await screen.findByTestId('checkout-hold-timer')).toHaveTextContent(
      /Complete payment in \d{2}:\d{2}/,
    );
    expect(screen.getByText('Priya Sharma')).toBeInTheDocument();
    expect(screen.getByText('More than 24 hours before departure')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-total')).toHaveTextContent('₹2,498');

    post.mockRejectedValueOnce(
      new ApiClientError('bad', 422, 'COUPON_INVALID', { reason: 'expired' }),
    );
    await user.type(screen.getByTestId('checkout-coupon-input'), 'monsoon20');
    await user.click(screen.getByTestId('checkout-coupon-apply'));
    expect(await screen.findByTestId('field-error-coupon')).toHaveTextContent(
      "This coupon can't be used for this booking.This coupon has expired.",
    );
    expect(post).toHaveBeenCalledWith('/coupons/apply', {
      bookingRef: 'ZB00000BUS12',
      code: 'MONSOON20',
    });

    await user.click(screen.getByTestId('checkout-proceed'));
    expect(await screen.findByTestId('field-error-terms')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/buses/review');
    await user.click(screen.getByTestId('checkout-terms'));
    post.mockResolvedValue({
      orderId: 'order_mock1',
      amount: 249_800,
      currency: 'INR',
      keyId: null,
      provider: 'mock',
      bookingRef: 'ZB00000BUS12',
      holdExpiresAt: null,
      serverNow: new Date().toISOString(),
    });
    await user.click(screen.getByTestId('checkout-proceed'));
    await screen.findByRole('heading', { level: 1, name: 'Payment' });
    expect(router.state.location.pathname).toBe('/buses/payment');
    expect(await screen.findByTestId('checkout-pay-submit')).toHaveTextContent('Pay ₹2,498');
    expect(screen.getByTestId('checkout-pay-method-upi')).toHaveAttribute('aria-checked', 'true');
  });

  it('shows the hold-expired state and no pay button once the hold ran out', async () => {
    const expired = busBooking({ holdExpiresAt: new Date(Date.now() - 1000).toISOString() });
    serve((url) => (url === '/bookings/ZB00000BUS12' ? expired : busRoutes(url)));
    post.mockResolvedValue({});
    renderRoute('/buses/payment?ref=ZB00000BUS12', makeUser());
    expect(await screen.findByTestId('checkout-hold-expired')).toHaveTextContent(
      'Your hold has expired. Please start again.',
    );
    expect(screen.queryByTestId('checkout-pay-submit')).not.toBeInTheDocument();
  });

  it('shows the confirmation with the reference, operator PNR and ticket actions', async () => {
    const confirmed = busBooking({
      status: 'CONFIRMED',
      paymentStatus: 'CAPTURED',
      holdExpiresAt: null,
    });
    if (confirmed.bus) confirmed.bus.pnr = 'SSK1234567';
    serve((url) => (url === '/bookings/ZB00000BUS12' ? confirmed : undefined));
    renderRoute('/buses/confirmation?ref=ZB00000BUS12', makeUser());
    expect(await screen.findByText('Your trip is booked!')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-booking-ref')).toHaveTextContent('ZB00000BUS12');
    expect(screen.getByTestId('confirm-pnr')).toHaveTextContent('SSK1234567');
    expect(screen.getByTestId('confirm-download-pdf')).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Go to My bookings' })).toHaveAttribute(
      'href',
      '/bookings',
    );
  });
});

describe('fixtures', () => {
  it('cover three operators', () => {
    expect(TRIPS.map((t) => t.operator.code)).toEqual(['SSK', 'PPR', 'ECO']);
  });
});

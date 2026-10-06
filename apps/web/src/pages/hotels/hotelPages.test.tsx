import {
  hotelDetails,
  hotelPlan,
  hotelPlansInCity,
  hotelPriceBreakdown,
  hotelResultsPage,
  hotelRoomTypes,
  hotelSummary,
  type HotelPlan,
} from '@zproo/catalog';
import type {
  BookingDetails,
  HotelBookResponse,
  HotelRoomsResponse,
  HotelSearchResponse,
  HotelSummary,
} from '@zproo/types';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addDays, todayInIst } from '@zproo/validation';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHotelDraft } from '@/features/hotels/draft';
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
const IN = addDays(todayInIst(), 20);
const OUT = addDays(IN, 3);
const NOW = new Date();
const PLAN = hotelPlan('htl_GOI007') as HotelPlan;
const DETAILS = hotelDetails(PLAN, true);
const ROOM_TYPES = hotelRoomTypes(PLAN, IN, OUT);
const TYPE = ROOM_TYPES[0] as (typeof ROOM_TYPES)[number];
const RATE = TYPE.rates[0] as (typeof TYPE.rates)[number];
const DETAILS_URL = `/hotels/htl_GOI007?checkIn=${IN}&checkOut=${OUT}&rooms=2-0`;

function searchResponse(
  query: URLSearchParams,
  hotels: HotelSummary[] = hotelPlansInCity('GOI')
    .map((p) => hotelSummary(p, IN, OUT, [{ adults: 2, childAges: [] }], NOW))
    .filter((h): h is HotelSummary => h !== null),
): HotelSearchResponse {
  const list = (k: string) => (query.get(k) ? (query.get(k) as string).split(',') : []);
  const page = hotelResultsPage(hotels, {
    sort: (query.get('sort') ?? undefined) as 'price_asc' | undefined,
    stars: list('stars').map(Number),
    freeCancellation: query.get('freeCancellation') === '1',
    breakfast: false,
    amenities: list('amenities'),
    areas: [],
    types: [],
    page: Number(query.get('page') ?? 1),
    pageSize: 20,
  });
  return {
    searchId: 'hsrch_test',
    serverNow: NOW.toISOString(),
    destination: { id: 'city_GOI', type: 'CITY', name: 'Goa', city: 'Goa', state: 'Goa' },
    checkIn: IN,
    checkOut: OUT,
    nights: 3,
    rooms: [{ adults: 2, childAges: [] }],
    ...page,
    demo: true,
  };
}

const roomsResponse = (types = ROOM_TYPES): HotelRoomsResponse => ({
  hotelId: 'htl_GOI007',
  serverNow: NOW.toISOString(),
  checkIn: IN,
  checkOut: OUT,
  nights: 3,
  roomTypes: types,
  demo: true,
});

function serve(routes: (url: string) => unknown) {
  get.mockImplementation(async (url: string) => {
    const found = routes(url);
    if (found instanceof Error) throw found;
    if (found === undefined) throw new ApiClientError('Not found', 404, 'NOT_FOUND');
    return found;
  });
}

const hotelRoutes = (url: string): unknown => {
  if (url.startsWith('/hotels/search?'))
    return searchResponse(new URLSearchParams(url.slice('/hotels/search?'.length)));
  if (url === '/hotels/htl_GOI007') return DETAILS;
  if (url === '/hotels/htl_GOI007/rooms') return roomsResponse();
  return undefined;
};

const BILL = hotelPriceBreakdown([{ price: RATE.totalPrice, taxes: RATE.taxes }], 3);

function hotelBooking(overrides: Partial<BookingDetails> = {}): BookingDetails {
  return {
    reference: 'ZH00000HTL12',
    serviceType: 'HOTEL',
    status: 'HELD',
    paymentStatus: 'CREATED',
    createdAt: NOW.toISOString(),
    holdExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    serverNow: new Date().toISOString(),
    confirmedAt: null,
    cancelledAt: null,
    travelDate: IN,
    price: BILL,
    contact: { email: 'amit@example.com', phone: '+919876543210' },
    coupon: null,
    passengers: [],
    flights: [],
    bus: null,
    hotel: {
      hotel: {
        hotelId: DETAILS.hotelId,
        name: DETAILS.name,
        stars: DETAILS.stars,
        address: DETAILS.address,
        city: DETAILS.city,
        phone: DETAILS.phone,
        checkInTime: DETAILS.checkInTime,
        checkOutTime: DETAILS.checkOutTime,
        images: DETAILS.images.slice(0, 3),
        houseRules: DETAILS.houseRules,
      },
      checkIn: IN,
      checkOut: OUT,
      nights: 3,
      rooms: [
        {
          roomTypeId: TYPE.roomTypeId,
          roomName: TYPE.name,
          rateId: RATE.rateId,
          boardBasis: RATE.boardBasis,
          refundable: RATE.refundable,
          freeCancellationUntil: RATE.freeCancellationUntil,
          adults: 2,
          childAges: [],
          leadGuest: { title: 'MR', firstName: 'Amit', lastName: 'Sharma' },
          price: RATE.totalPrice,
          nightlyBreakdown: RATE.nightlyBreakdown,
        },
      ],
      specialRequests: '<script>alert(1)</script> late arrival',
      confirmationNo: null,
      supplierRef: null,
    },
    demo: true,
    ...overrides,
  };
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  useHotelDraft.getState().clear();
  window.sessionStorage.clear();
});

describe('hotel results', () => {
  const RESULTS = `/hotels/search?destinationId=city_GOI&checkIn=${IN}&checkOut=${OUT}&rooms=2-0`;

  it('lists hotels with data attributes, sorts and filters through the URL', async () => {
    serve(hotelRoutes);
    const user = userEvent.setup();
    const { router } = renderRoute(RESULTS);
    const count = await screen.findByTestId('hotel-results-count');
    await waitFor(() => expect(count).toHaveTextContent(/^\d+ hotels found$/));
    expect(screen.getByTestId('hotel-nights')).toHaveTextContent('3 nights');
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(20);
    const first = cards[0] as HTMLElement;
    expect(first).toHaveAttribute('data-stars');
    expect(first).toHaveAttribute('data-rating');
    expect(within(first).getByRole('img', { name: /\d star hotel/ })).toBeInTheDocument();
    expect(within(first).getByText(/total for 3 nights \+/)).toBeInTheDocument();

    await user.click(screen.getByTestId('hotel-sort-price_asc'));
    await waitFor(() => expect(router.state.location.search).toContain('sort=price_asc'));
    await waitFor(() => {
      const prices = screen
        .getAllByRole('article')
        .map((a) => Number(a.getAttribute('data-price')));
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
    });

    await user.click(screen.getAllByTestId('hotel-filter-stars-4')[0] as HTMLElement);
    await waitFor(() => expect(router.state.location.search).toContain('stars=4'));
    await waitFor(() =>
      screen.getAllByRole('article').forEach((a) => expect(a).toHaveAttribute('data-stars', '4')),
    );
  });

  it('loads more hotels and keeps the page in the URL', async () => {
    serve(hotelRoutes);
    const user = userEvent.setup();
    const { router } = renderRoute(RESULTS);
    await user.click(await screen.findByTestId('hotel-results-load-more'));
    await waitFor(() => expect(screen.getAllByRole('article').length).toBeGreaterThan(20));
    expect(router.state.location.search).toContain('page=2');
    expect(get).toHaveBeenCalledWith(expect.stringContaining('&page=2'));
  });

  it('shows the empty state and the error with Retry', async () => {
    serve((url) =>
      url.startsWith('/hotels/search?') ? searchResponse(new URLSearchParams(), []) : undefined,
    );
    const { unmount } = renderRoute(RESULTS);
    expect(await screen.findByText('No hotels found')).toBeInTheDocument();
    unmount();
    serve(() => new ApiClientError('down', 502, 'PROVIDER_ERROR'));
    renderRoute(RESULTS);
    expect(await screen.findByTestId('hotel-results-error')).toHaveTextContent(
      "We couldn't reach the operator right now. Please try again.",
    );
  });

  it.each([
    ['rooms=2-1', 'Add the age of each child'],
    [`rooms=${Array(9).fill('1-0').join('|')}`, 'You can book up to 8 rooms at a time'],
  ])('explains an invalid deep link (%s) and offers the default search', async (rooms, message) => {
    renderRoute(`/hotels/search?destinationId=city_GOI&checkIn=${IN}&checkOut=${OUT}&${rooms}`);
    const error = await screen.findByTestId('hotel-results-error');
    expect(error).toHaveTextContent(message);
    expect(within(error).getByTestId('hotel-guests-open')).toHaveTextContent(/guests?/);
  });
});

describe('hotel details', () => {
  it('opens the gallery lightbox, moves with the arrow keys and returns focus on Escape', async () => {
    serve(hotelRoutes);
    const user = userEvent.setup();
    renderRoute(DETAILS_URL);
    const open = await screen.findByTestId('hotel-gallery-open');
    await user.click(open);
    const lightbox = await screen.findByTestId('hotel-lightbox');
    expect(within(lightbox).getByText(`1 / ${DETAILS.images.length}`)).toBeInTheDocument();
    await user.keyboard('{ArrowRight}');
    expect(within(lightbox).getByText(`2 / ${DETAILS.images.length}`)).toBeInTheDocument();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(
      within(lightbox).getByText(`${DETAILS.images.length} / ${DETAILS.images.length}`),
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('hotel-lightbox')).not.toBeInTheDocument());
    expect(open).toHaveFocus();
  });

  it('refuses a room type the guests do not fit', async () => {
    serve(hotelRoutes);
    renderRoute(`/hotels/htl_GOI007?checkIn=${IN}&checkOut=${OUT}&rooms=4-0`);
    const small = ROOM_TYPES.find((t) => t.maxAdults < 4) as (typeof ROOM_TYPES)[number];
    const card = await screen.findByTestId(`hotel-room-type-${small.roomTypeId}`);
    expect(card).toHaveTextContent(`This room fits up to ${small.maxAdults} adults`);
    expect(within(card).getAllByRole('button', { name: /^Select/ })[0]).toBeDisabled();
  });

  it('assigns a rate to each searched room, then deep-logs-in guests with the draft', async () => {
    serve((url) =>
      url === '/hotels/htl_GOI007/rooms'
        ? roomsResponse(ROOM_TYPES.map((t) => ({ ...t, maxAdults: 4, maxChildren: 2 })))
        : hotelRoutes(url),
    );
    const user = userEvent.setup();
    const url = `/hotels/htl_GOI007?checkIn=${IN}&checkOut=${OUT}&rooms=2-0|2-1:7`;
    const { router } = renderRoute(url);
    const reserve = await screen.findByTestId('hotel-reserve');
    await screen.findByTestId(`hotel-room-type-${TYPE.roomTypeId}`);
    expect(reserve).toBeDisabled();
    await user.click(screen.getAllByTestId(`hotel-room-select-${RATE.rateId}`)[0] as HTMLElement);
    expect(screen.getByTestId('hotel-rooms-selected')).toHaveTextContent('1 of 2 rooms selected');
    expect(screen.getByTestId('hotel-assign-room-2')).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getAllByTestId(`hotel-room-select-${RATE.rateId}`)[0] as HTMLElement);
    const total = hotelPriceBreakdown(
      [
        { price: RATE.totalPrice, taxes: RATE.taxes },
        { price: RATE.totalPrice, taxes: RATE.taxes },
      ],
      3,
    ).totalPaise;
    expect(reserve).toBeEnabled();
    await user.click(reserve);
    await screen.findByRole('heading', { level: 1, name: 'Welcome back' });
    expect(decodeURIComponent(router.state.location.search)).toBe(`?returnTo=${url}`);
    expect(useHotelDraft.getState().selection).toMatchObject({
      hotelId: 'htl_GOI007',
      checkIn: IN,
      checkOut: OUT,
      expectedTotal: total,
      rooms: [
        { rateId: RATE.rateId, adults: 2, childAges: [] },
        { rateId: RATE.rateId, adults: 2, childAges: [7] },
      ],
    });
  });

  it('restores the chosen rooms after login and re-checks them', async () => {
    useHotelDraft.getState().start({
      hotelId: 'htl_GOI007',
      hotelName: DETAILS.name,
      checkIn: IN,
      checkOut: OUT,
      rooms: [
        {
          roomTypeId: TYPE.roomTypeId,
          rateId: RATE.rateId,
          roomName: TYPE.name,
          adults: 2,
          childAges: [],
        },
      ],
      expectedTotal: BILL.totalPaise,
      detailsUrl: DETAILS_URL,
    });
    serve(hotelRoutes);
    renderRoute(DETAILS_URL, makeUser());
    await waitFor(() => expect(screen.getByTestId('hotel-reserve')).toBeEnabled());
    expect(screen.getByTestId('hotel-rooms-selected')).toHaveTextContent('1 of 1 room selected');
  });

  it('drops a chosen room that sold out and says so', async () => {
    useHotelDraft.getState().start({
      hotelId: 'htl_GOI007',
      hotelName: DETAILS.name,
      checkIn: IN,
      checkOut: OUT,
      rooms: [
        {
          roomTypeId: TYPE.roomTypeId,
          rateId: RATE.rateId,
          roomName: TYPE.name,
          adults: 2,
          childAges: [],
        },
      ],
      expectedTotal: BILL.totalPaise,
      detailsUrl: DETAILS_URL,
    });
    serve((url) =>
      url === '/hotels/htl_GOI007/rooms'
        ? roomsResponse(
            ROOM_TYPES.map((t, i) =>
              i === 0 ? { ...t, rates: t.rates.map((r) => ({ ...r, roomsLeft: 0 })) } : t,
            ),
          )
        : hotelRoutes(url),
    );
    renderRoute(DETAILS_URL, makeUser());
    expect(await screen.findByText(/A room you chose is no longer available/)).toBeInTheDocument();
    expect(screen.getByTestId('hotel-reserve')).toBeDisabled();
  });
});

describe('hotel checkout', () => {
  const start = () =>
    useHotelDraft.getState().start({
      hotelId: 'htl_GOI007',
      hotelName: DETAILS.name,
      checkIn: IN,
      checkOut: OUT,
      rooms: [
        {
          roomTypeId: TYPE.roomTypeId,
          rateId: RATE.rateId,
          roomName: TYPE.name,
          adults: 2,
          childAges: [],
        },
      ],
      expectedTotal: BILL.totalPaise,
      detailsUrl: DETAILS_URL,
    });
  const held: HotelBookResponse = {
    bookingRef: 'ZH00000HTL12',
    status: 'HELD',
    holdExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    serverNow: new Date().toISOString(),
    priceBreakdown: BILL,
  };

  it('collects lead guests and special requests, then holds the rooms', async () => {
    start();
    serve((url) => (url.startsWith('/bookings/') ? hotelBooking() : hotelRoutes(url)));
    const user = userEvent.setup();
    const { router } = renderRoute('/hotels/booking', makeUser({ fullName: 'Amit Sharma' }));
    expect(
      await screen.findByText(
        'The lead guest must be 18 or older and carry a valid photo ID at check-in.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('checkout-traveller-0-first-name')).toHaveValue('Amit');
    await user.type(screen.getByTestId('checkout-special-requests'), 'Late check-in');
    expect(screen.getByText('13/300')).toBeInTheDocument();
    post.mockResolvedValueOnce(held);
    await user.click(screen.getByTestId('checkout-travellers-continue'));
    await screen.findByRole('heading', { level: 1, name: 'Review your booking' });
    expect(router.state.location.search).toBe('?ref=ZH00000HTL12');
    expect(post).toHaveBeenCalledWith(
      '/hotels/book',
      {
        hotelId: 'htl_GOI007',
        checkIn: IN,
        checkOut: OUT,
        rooms: [
          {
            roomTypeId: TYPE.roomTypeId,
            rateId: RATE.rateId,
            adults: 2,
            childAges: [],
            leadGuest: { title: 'MR', firstName: 'Amit', lastName: 'Sharma' },
          },
        ],
        contact: { email: 'amit@example.com', mobile: '+919876543210' },
        specialRequests: 'Late check-in',
        expectedTotal: BILL.totalPaise,
      },
      { headers: { 'Idempotency-Key': useHotelDraft.getState().idempotencyKey } },
    );
  });

  it('explains a sold-out room and offers to choose another', async () => {
    start();
    serve(hotelRoutes);
    const user = userEvent.setup();
    renderRoute('/hotels/booking', makeUser({ fullName: 'Amit Sharma' }));
    await screen.findByTestId('checkout-traveller-0-first-name');
    post.mockRejectedValueOnce(
      new ApiClientError(
        'This room just sold out. Please choose another room.',
        409,
        'ROOM_UNAVAILABLE',
        {
          roomTypeId: TYPE.roomTypeId,
        },
      ),
    );
    await user.click(screen.getByTestId('checkout-travellers-continue'));
    const alert = await screen.findByTestId('hotel-book-error');
    expect(alert).toHaveTextContent('This room just sold out. Please choose another room.');
    expect(within(alert).getByRole('link', { name: 'Choose another room' })).toHaveAttribute(
      'href',
      DETAILS_URL,
    );
  });

  it('asks before continuing at a changed price', async () => {
    start();
    serve(hotelRoutes);
    const user = userEvent.setup();
    renderRoute('/hotels/booking', makeUser({ fullName: 'Amit Sharma' }));
    await screen.findByTestId('checkout-traveller-0-first-name');
    post.mockRejectedValueOnce(
      new ApiClientError('changed', 409, 'PRICE_CHANGED', {
        oldTotal: BILL.totalPaise,
        newTotal: BILL.totalPaise + 42_000,
      }),
    );
    await user.click(screen.getByTestId('checkout-travellers-continue'));
    expect(await screen.findByTestId('dialog-price-changed')).toBeInTheDocument();
  });

  it('reviews the stay with special requests as plain text, then goes to payment', async () => {
    serve((url) => (url === '/bookings/ZH00000HTL12' ? hotelBooking() : undefined));
    const user = userEvent.setup();
    const { router } = renderRoute('/hotels/review?ref=ZH00000HTL12', makeUser());
    expect(await screen.findByTestId('checkout-hold-timer')).toBeInTheDocument();
    expect(screen.getByTestId('hotel-special-requests')).toHaveTextContent(
      '<script>alert(1)</script> late arrival',
    );
    expect(document.querySelector('script:not([src])')).toBeNull();
    expect(screen.getByTestId('hotel-nights')).toHaveTextContent('3 nights');
    expect(screen.getByText(`Room charges — 1 room × 3 nights`)).toBeInTheDocument();
    await user.click(screen.getByTestId('checkout-terms'));
    post.mockResolvedValue({
      orderId: 'order_mock1',
      amount: BILL.totalPaise,
      currency: 'INR',
      keyId: null,
      provider: 'mock',
      bookingRef: 'ZH00000HTL12',
      holdExpiresAt: null,
      serverNow: new Date().toISOString(),
    });
    await user.click(screen.getByTestId('checkout-proceed'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/hotels/payment'));
  });

  it('shows the hotel confirmation number once confirmed', async () => {
    const base = hotelBooking({
      status: 'CONFIRMED',
      paymentStatus: 'CAPTURED',
      holdExpiresAt: null,
    });
    const confirmed = {
      ...base,
      hotel: base.hotel && { ...base.hotel, confirmationNo: 'GOI1234567' },
    };
    serve((url) => (url.startsWith('/bookings/') ? confirmed : undefined));
    renderRoute('/hotels/confirmation?ref=ZH00000HTL12', makeUser());
    expect(await screen.findByText('Your stay is booked!')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-pnr')).toHaveTextContent('GOI1234567');
    expect(screen.getByText('Hotel confirmation number')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-download-pdf')).toBeEnabled();
    await act(async () => undefined);
  });
});

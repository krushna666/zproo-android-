/**
 * UI page map. Every customer-facing route is registered from day one so navigation never
 * leads to a broken link; each renders a placeholder until its phase ships and replaces it
 * with the real page.
 */
export interface PlannedRoute {
  path: string;
  title: string;
  description: string;
  phase: number;
  /** Account pages: only for signed-in users. */
  requiresAuth?: boolean;
}

export const PUBLIC_ROUTES: readonly PlannedRoute[] = [
  // Trains — Phase 6
  { path: '/trains', title: 'Trains', description: 'Search trains across all classes.', phase: 6 },
  {
    path: '/trains/results',
    title: 'Train results',
    description: 'Availability and fares by class.',
    phase: 6,
  },
  // Hotels — Phase 7
  { path: '/hotels', title: 'Hotels', description: 'Stays in top destinations.', phase: 7 },
  {
    path: '/hotels/results',
    title: 'Hotel results',
    description: 'Filter by price, rating, amenities and location.',
    phase: 7,
  },
  {
    path: '/hotels/:id',
    title: 'Hotel details',
    description: 'Photos, amenities, policies and reviews.',
    phase: 7,
  },
  {
    path: '/hotels/:id/rooms',
    title: 'Choose a room',
    description: 'Room types, inclusions and cancellation terms.',
    phase: 7,
  },
  // Mobility — Phases 8–9
  {
    path: '/cabs',
    title: 'Cabs',
    description: 'Book a mini, sedan, SUV or premium ride.',
    phase: 8,
  },
  {
    path: '/cabs/booking',
    title: 'Confirm your cab',
    description: 'Fare estimate, ETA and driver assignment.',
    phase: 8,
  },
  {
    path: '/rides/:id',
    title: 'Track your ride',
    description: 'Live driver location and trip status.',
    phase: 8,
  },
  {
    path: '/bikes',
    title: 'Bike taxi',
    description: 'Beat traffic with a quick bike ride.',
    phase: 9,
  },
  // Holidays, parcel, corporate — Phases 10–12
  {
    path: '/holidays',
    title: 'Holiday packages',
    description: 'Domestic, international, honeymoon, family and more.',
    phase: 10,
  },
  {
    path: '/holidays/:id',
    title: 'Holiday details',
    description: 'Itinerary, inclusions and terms.',
    phase: 10,
  },
  {
    path: '/parcel',
    title: 'Parcel delivery',
    description: 'Send parcels safely, tracked end to end.',
    phase: 11,
  },
  {
    path: '/parcel/track/:id',
    title: 'Track parcel',
    description: 'Live status of your parcel.',
    phase: 11,
  },
  {
    path: '/corporate',
    title: 'Corporate travel',
    description: 'Policies, approvals, GST invoices and reports.',
    phase: 12,
  },
  // Account & money — Phases 2, 13, 15
  {
    path: '/offers',
    title: 'Offers',
    description: 'Coupons, cashback and bank offers.',
    phase: 13,
  },
  {
    path: '/wallet',
    title: 'ZPROO Wallet',
    description: 'Add money, pay faster and earn cashback.',
    phase: 13,
    requiresAuth: true,
  },
  // Support & company — Phases 3, 17
  { path: '/help', title: 'Help center', description: 'Answers and 24×7 support.', phase: 17 },
  { path: '/contact', title: 'Contact us', description: 'Reach the ZPROO GO team.', phase: 17 },
];

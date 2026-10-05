import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderRoute } from '@/test/render';

describe('home page', () => {
  it('renders every section in order', async () => {
    renderRoute('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: /Travel Smarter/ }),
    ).toBeInTheDocument();
    // Page sections only; the footer has its own column headings.
    const headings = within(screen.getByRole('main'))
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent);
    expect(headings).toEqual([
      'Search and book',
      'Our Travel Services',
      'Top Flight Deals',
      'Popular Bus Routes',
      'Train Bookings',
      'Hotels in Top Destinations',
      'Popular Destinations',
      'Your travel money, one tap away',
      'Offers for you',
      'Your whole trip, in your pocket',
      'Why travellers choose ZPROO GO',
    ]);
    expect(await screen.findByRole('tablist', { name: 'Choose a service' })).toBeInTheDocument();
  });

  it('links deals to searches and labels fares as indicative', async () => {
    renderRoute('/');
    const deal = await screen.findByRole('link', { name: /Search flights from Pune to New Delhi/ });
    // No date in the link: prerendered HTML must not freeze one; the results page defaults it.
    expect(deal).toHaveAttribute(
      'href',
      '/flights/results?trip=ONE_WAY&from=PNQ&to=DEL&adults=1&cabin=ECONOMY',
    );
    expect(screen.getByText(/Indicative lowest one-way fares/)).toBeInTheDocument();
  });

  it('shows the coupon codes', async () => {
    renderRoute('/');
    for (const code of ['WELCOME500', 'FIRSTFLIGHT', 'BUS100', 'HOTEL10']) {
      expect(await screen.findByRole('button', { name: `Copy code ${code}` })).toBeInTheDocument();
    }
  });
});

describe('company pages', () => {
  it.each([
    ['/terms', 'Terms of Use'],
    ['/privacy', 'Privacy Policy'],
    ['/refund-policy', 'Refund Policy'],
  ])('%s is marked as a draft for legal review', async (path, title) => {
    renderRoute(path);
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Draft for legal review');
    expect(screen.getByRole('navigation', { name: 'On this page' })).toBeInTheDocument();
  });

  it('renders the About page', async () => {
    renderRoute('/about');
    expect(
      await screen.findByRole('heading', { level: 1, name: /Travel is more than a ticket/ }),
    ).toBeInTheDocument();
  });
});

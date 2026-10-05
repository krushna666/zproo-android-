import { addDays, todayInIst } from '@zproo/validation';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SearchWidget } from './SearchWidget';

function renderWidget() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <SearchWidget /> },
      { path: '*', element: <p>results page</p> },
    ],
    { initialEntries: ['/'] },
  );
  render(<RouterProvider router={router} />);
  const location = () => `${router.state.location.pathname}${router.state.location.search}`;
  return { router, location };
}

const inDays = (n: number) => addDays(todayInIst(), n);

describe('SearchWidget — flights', () => {
  const search = () => screen.getByRole('button', { name: 'Search flights' });

  it('submits the default Pune → Delhi one-way search', async () => {
    const user = userEvent.setup();
    const { location } = renderWidget();
    await user.click(search());
    expect(await screen.findByText('results page')).toBeInTheDocument();
    expect(location()).toBe(
      `/flights/search?from=PNQ&to=DEL&date=${inDays(7)}&adults=1&children=0&infants=0&cabin=ECONOMY`,
    );
  });

  it('chooses an airport with the keyboard', async () => {
    const user = userEvent.setup();
    const { location } = renderWidget();
    const to = screen.getByRole('combobox', { name: 'To' });
    await user.click(to);
    await user.type(to, 'goi');
    expect(to).toHaveAttribute('aria-expanded', 'true');
    expect(
      within(screen.getByRole('listbox', { name: 'To' })).getAllByRole('option')[0],
    ).toHaveTextContent('Goa (GOI)');
    await user.keyboard('{Enter}');
    expect(to).toHaveValue('Goa (GOI)');
    expect(to).toHaveAttribute('aria-expanded', 'false');
    await user.click(search());
    await screen.findByText('results page');
    expect(location()).toContain('from=PNQ&to=GOI');
  });

  it('swaps origin and destination', async () => {
    const user = userEvent.setup();
    const { location } = renderWidget();
    await user.click(screen.getByRole('button', { name: 'Swap airports' }));
    expect(screen.getByRole('combobox', { name: 'From' })).toHaveValue('New Delhi (DEL)');
    await user.click(search());
    await screen.findByText('results page');
    expect(location()).toContain('from=DEL&to=PNQ');
  });

  it('shows validation errors instead of searching', async () => {
    const user = userEvent.setup();
    const { location } = renderWidget();
    const to = screen.getByRole('combobox', { name: 'To' });
    await user.click(to);
    await user.type(to, 'pnq{Enter}');
    await user.click(search());
    expect(
      await screen.findByText('Choose different airports for From and To'),
    ).toBeInTheDocument();
    expect(to).toHaveAttribute('aria-invalid', 'true');
    expect(location()).toBe('/');
  });

  it('becomes a round trip with a return date', async () => {
    const user = userEvent.setup();
    const { location } = renderWidget();
    expect(screen.getByLabelText('Return')).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'Round-trip' }));
    fireEvent.change(screen.getByLabelText('Return'), { target: { value: inDays(12) } });
    await user.click(search());
    await screen.findByText('results page');
    expect(location()).toContain(`date=${inDays(7)}&returnDate=${inDays(12)}`);
  });

  it('adds travellers and cabin class', async () => {
    const user = userEvent.setup();
    const { location } = renderWidget();
    await user.click(screen.getByRole('button', { name: /Travellers & class/ }));
    await user.click(screen.getByRole('button', { name: 'More adults' }));
    await user.click(screen.getByRole('button', { name: 'More infants' }));
    await user.click(screen.getByRole('radio', { name: 'Business' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: /Travellers & class/ })).toHaveTextContent(
      '3 Travellers',
    );
    await user.click(search());
    await screen.findByText('results page');
    expect(location()).toContain('adults=2&children=0&infants=1&cabin=BUSINESS');
  });
});

describe('SearchWidget — other services', () => {
  it('switches tabs and searches buses', async () => {
    const user = userEvent.setup();
    const { location } = renderWidget();
    await user.click(screen.getByRole('tab', { name: 'Bus' }));
    await user.click(await screen.findByTestId('bus-search-submit'));
    await screen.findByText('results page');
    expect(location()).toBe(`/buses/search?from=PNQ&to=BOM&date=${addDays(todayInIst(), 1)}`);
  });

  it('keeps hotel check-out after check-in', async () => {
    const user = userEvent.setup();
    const { location } = renderWidget();
    await user.click(screen.getByRole('tab', { name: 'Hotels' }));
    const checkIn = await screen.findByLabelText('Check-in');
    fireEvent.change(checkIn, { target: { value: inDays(20) } });
    await user.click(screen.getByRole('button', { name: 'Search Hotels' }));
    await screen.findByText('results page');
    expect(location()).toContain(`checkIn=${inDays(20)}&checkOut=${inDays(21)}`);
  });

  it('validates cab addresses', async () => {
    const user = userEvent.setup();
    renderWidget();
    await user.click(screen.getByRole('tab', { name: 'Cabs' }));
    await user.click(await screen.findByRole('button', { name: 'See Cab Fares' }));
    expect(await screen.findByText('Enter a pickup location')).toBeInTheDocument();
  });

  it('validates parcel PIN codes', async () => {
    const user = userEvent.setup();
    renderWidget();
    await user.click(screen.getByRole('tab', { name: 'Parcel' }));
    await user.type(await screen.findByLabelText('Pickup PIN code'), '0123');
    await user.click(screen.getByRole('button', { name: 'Get Quote' }));
    expect(await screen.findByText('Enter a valid 6-digit pickup PIN code')).toBeInTheDocument();
  });
});

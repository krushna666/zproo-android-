import { CABIN_CLASS_LABELS, type BookingDetails } from '@zproo/types';
import { Button } from '@zproo/ui';
import { formatMoney } from '@zproo/utils';
import { Printer } from 'lucide-react';
import { useParams } from 'react-router';
import { Logo } from '@/components/brand/Logo';
import { PageLoader } from '@/components/feedback/PageLoader';
import { Seo } from '@/components/seo/Seo';
import { FormAlert } from '@/features/auth/components/FormAlert';
import { errorMessage } from '@/features/auth/errors';
import { IST } from '@/features/buses/format';
import { useBooking } from '@/features/checkout/api';
import { duration, localDay, localTime } from '@/features/flights/format';

const TITLE: Record<string, string> = {
  MR: 'Mr',
  MRS: 'Mrs',
  MS: 'Ms',
  MSTR: 'Master',
  MISS: 'Miss',
  MX: 'Mx',
};

/** Printable e-ticket (Print → Save as PDF). Used by the static website instead of the PDF API. */
export default function TicketPage() {
  const { reference = '' } = useParams();
  const { data: booking, isPending, error } = useBooking(reference.toUpperCase());
  if (isPending) return <PageLoader fullscreen />;
  if (error || !booking) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <FormAlert>{errorMessage(error)}</FormAlert>
      </div>
    );
  }
  if (booking.status !== 'CONFIRMED' && booking.status !== 'COMPLETED') {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <FormAlert>The e-ticket is available once the booking is confirmed.</FormAlert>
      </div>
    );
  }
  return <Ticket booking={booking} />;
}

function Ticket({ booking }: { booking: BookingDetails }) {
  const bus = booking.bus;
  return (
    <div className="min-h-screen bg-background py-6 print:bg-white print:py-0">
      <Seo title={`E-ticket ${booking.reference}`} noIndex />
      <div className="mx-auto mb-4 flex max-w-3xl justify-end px-4 print:hidden">
        <Button onClick={() => window.print()}>
          <Printer aria-hidden /> Print / Save as PDF
        </Button>
      </div>
      <article className="relative mx-auto max-w-3xl overflow-hidden bg-white px-8 py-8 shadow-card print:shadow-none">
        <p
          aria-hidden
          className="pointer-events-none absolute inset-0 grid -rotate-[30deg] place-items-center text-5xl font-black tracking-widest text-primary/10"
        >
          DEMO — NOT VALID FOR TRAVEL
        </p>
        <header className="flex items-start justify-between border-b-2 border-primary pb-4">
          <div>
            <Logo height={34} priority />
          </div>
          <div className="text-right">
            <p className="text-xl font-extrabold">E-TICKET</p>
            <p className="text-sm text-muted">Booking {booking.reference}</p>
          </div>
        </header>
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          Demo booking from the ZPROO GO website demo — not valid for travel.
        </p>

        <dl className="mt-5 grid grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-xs text-muted">STATUS</dt>
            <dd className="font-bold">Confirmed</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">BOOKED ON</dt>
            <dd className="font-bold">{localDay(booking.createdAt, IST)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">CONTACT</dt>
            <dd className="font-bold">{booking.contact.phone}</dd>
            <dd className="text-xs text-muted">{booking.contact.email}</dd>
          </div>
        </dl>

        <section className="mt-6 space-y-3">
          {bus ? (
            <div className="rounded-xl border border-border p-4">
              <div className="flex justify-between gap-3">
                <p className="font-bold">
                  {bus.offer.operator.name} · {bus.offer.serviceNumber}
                </p>
                <p className="font-bold text-primary">PNR {bus.pnr}</p>
              </div>
              <p className="text-xs text-muted">
                {localDay(bus.offer.departureAt, IST)} · {bus.offer.bus.name}
              </p>
              <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-start gap-3">
                <div>
                  <p className="text-2xl font-extrabold">
                    {localTime(bus.boardingPoint.time, IST)}
                  </p>
                  <p className="text-sm font-semibold">
                    {bus.offer.from.name} · {bus.boardingPoint.name}
                  </p>
                  <p className="text-xs text-muted">{bus.boardingPoint.address}</p>
                </div>
                <p className="pt-2 text-xs text-muted">
                  {duration(bus.offer.durationMinutes)} · {bus.offer.distanceKm} km
                </p>
                <div className="text-right">
                  <p className="text-2xl font-extrabold">
                    {localTime(bus.droppingPoint.time, IST)}
                  </p>
                  <p className="text-sm font-semibold">
                    {bus.offer.to.name} · {bus.droppingPoint.name}
                  </p>
                  <p className="text-xs text-muted">{bus.droppingPoint.address}</p>
                </div>
              </div>
              <p className="mt-3 text-sm font-bold">Seats: {bus.seatNumbers.join(', ')}</p>
            </div>
          ) : (
            booking.flights.map((leg) => (
              <div key={leg.sequence} className="rounded-xl border border-border p-4">
                <div className="flex justify-between gap-3">
                  <p className="font-bold">
                    {leg.offer.airline.name} · {leg.offer.flightNumber}
                  </p>
                  <p className="font-bold text-primary">PNR {leg.pnr}</p>
                </div>
                <p className="text-xs text-muted">
                  {localDay(leg.offer.departureAt, leg.offer.from.timezone)} ·{' '}
                  {CABIN_CLASS_LABELS[leg.offer.cabin]} ({leg.offer.fareFamily})
                </p>
                <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-start gap-3">
                  <div>
                    <p className="text-2xl font-extrabold">
                      {localTime(leg.offer.departureAt, leg.offer.from.timezone)}
                    </p>
                    <p className="text-sm">
                      {leg.offer.from.code} · {leg.offer.from.city}
                    </p>
                  </div>
                  <p className="pt-2 text-xs text-muted">
                    {duration(leg.offer.durationMinutes)} ·{' '}
                    {leg.offer.stops === 0 ? 'Non-stop' : `${leg.offer.stops} stop`}
                  </p>
                  <div className="text-right">
                    <p className="text-2xl font-extrabold">
                      {localTime(leg.offer.arrivalAt, leg.offer.to.timezone)}
                    </p>
                    <p className="text-sm">
                      {leg.offer.to.code} · {leg.offer.to.city}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </section>

        <section className="mt-6">
          <h2 className="text-sm font-extrabold uppercase text-primary">Travellers</h2>
          <table className="mt-2 w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 font-semibold">Name</th>
                <th className="py-1 font-semibold">{bus ? 'Age / gender' : 'Type'}</th>
                <th className="py-1 font-semibold">{bus ? 'Seat' : 'E-ticket number'}</th>
              </tr>
            </thead>
            <tbody>
              {booking.passengers.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="py-1.5">
                    {bus ? '' : `${TITLE[p.title] ?? p.title} `}
                    {p.firstName} {p.lastName}
                  </td>
                  <td className="py-1.5">
                    {bus
                      ? `${p.age} / ${p.gender.charAt(0)}${p.gender.slice(1).toLowerCase()}`
                      : p.type.toLowerCase()}
                  </td>
                  <td className="py-1.5 font-semibold">
                    {bus
                      ? p.seatNumber
                      : booking.flights
                          .map((f) => f.tickets.find((t) => t.passengerId === p.id)?.ticketNumber)
                          .filter(Boolean)
                          .join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-6">
          <h2 className="text-sm font-extrabold uppercase text-primary">Fare summary</h2>
          <dl className="mt-2 space-y-1 text-sm">
            {booking.price.lines.map((l) => (
              <div key={l.label} className="flex justify-between">
                <dt>{l.label}</dt>
                <dd>{formatMoney(l.amountPaise)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-2 text-base font-extrabold">
              <dt>Total paid</dt>
              <dd>{formatMoney(booking.price.totalPaise)}</dd>
            </div>
          </dl>
        </section>

        <section className="mt-6 text-xs text-muted">
          <h2 className="text-sm font-extrabold uppercase text-primary">Important information</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {bus ? (
              <>
                <li>Reach your boarding point 15 minutes before the time shown.</li>
                <li>
                  Carry a government photo ID; the operator may check it against the traveller
                  names.
                </li>
                <li>
                  Cancellation:{' '}
                  {bus.offer.cancellationPolicy
                    .map((r) =>
                      r.hoursBefore > 0
                        ? `${r.refundPercent}% refund more than ${r.hoursBefore}h before`
                        : 'no refund after that',
                    )
                    .join('; ')}
                  .
                </li>
              </>
            ) : (
              <>
                <li>Carry a valid government photo ID. Names must match the ID.</li>
                <li>
                  Check-in closes 45 minutes before domestic and 60 minutes before international
                  departures.
                </li>
                <li>Cancellations and changes follow the airline fare rules shown at booking.</li>
              </>
            )}
          </ul>
        </section>
        <p className="mt-8 text-center text-xs text-muted">
          ZPROO GO — Travel Smarter. Go Further.
        </p>
      </article>
    </div>
  );
}

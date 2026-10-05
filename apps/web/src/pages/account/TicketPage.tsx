import { findMockAirline } from '@zproo/catalog';
import { CABIN_CLASS_LABELS, type BookingDetails } from '@zproo/types';
import { Button, FormAlert } from '@zproo/ui';
import { formatMoney } from '@zproo/utils';
import { Printer } from 'lucide-react';
import { useParams } from 'react-router';
import { Logo } from '@/components/brand/Logo';
import { PageLoader } from '@/components/feedback/PageLoader';
import { Seo } from '@/components/seo/Seo';
import { errorMessage } from '@/features/auth/errors';
import { IST } from '@/features/buses/format';
import { useBooking } from '@/features/checkout/api';
import { ReferenceQr } from '@/features/checkout/ReferenceQr';
import {
  arrivalLabel,
  clockTime,
  duration,
  localDateOf,
  localDay,
  localTime,
} from '@/features/flights/format';

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
        {booking.demo && (
          <p
            aria-hidden
            className="pointer-events-none absolute inset-0 grid -rotate-[30deg] place-items-center text-5xl font-black tracking-widest text-primary/10"
          >
            DEMO — NOT VALID FOR TRAVEL
          </p>
        )}
        <header className="flex items-start justify-between border-b-2 border-primary pb-4">
          <div>
            <Logo height={34} priority />
          </div>
          <div className="flex items-start gap-4 text-right">
            <div>
              <p className="text-xl font-extrabold">E-TICKET</p>
              <p className="text-sm text-muted">
                Booking <span className="font-mono">{booking.reference}</span>
              </p>
            </div>
            <ReferenceQr reference={booking.reference} size={88} />
          </div>
        </header>
        {booking.demo && (
          <p className="mt-4 rounded-lg bg-warning/10 px-3 py-2 text-xs font-semibold text-foreground">
            Demo booking — simulated inventory and payment, not valid for travel.
          </p>
        )}

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
                  {bus.trip.operator.name} · {bus.trip.serviceNumber}
                </p>
                <p className="font-mono font-bold text-primary">PNR {bus.pnr}</p>
              </div>
              <p className="text-xs text-muted">
                {localDay(bus.trip.departure, IST)} · {bus.trip.busType.label} · Operator helpline{' '}
                {bus.trip.operator.phone}
              </p>
              <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-start gap-3">
                <div>
                  <p className="text-2xl font-extrabold">
                    {localTime(bus.boardingPoint.time, IST)}
                  </p>
                  <p className="text-sm font-semibold">
                    {bus.trip.from.name} · {bus.boardingPoint.name}
                  </p>
                  <p className="text-xs text-muted">{bus.boardingPoint.landmark}</p>
                  <p className="text-xs text-muted">{bus.boardingPoint.address}</p>
                  <p className="mt-1 text-xs font-semibold">
                    Reporting time{' '}
                    {localTime(
                      new Date(Date.parse(bus.boardingPoint.time) - 15 * 60_000).toISOString(),
                      IST,
                    )}{' '}
                    (15 min before departure)
                  </p>
                </div>
                <p className="pt-2 text-xs text-muted">
                  {duration(bus.trip.durationMin)} · {bus.trip.distanceKm} km
                </p>
                <div className="text-right">
                  <p className="text-2xl font-extrabold">
                    {localTime(bus.droppingPoint.time, IST)}
                  </p>
                  <p className="text-sm font-semibold">
                    {bus.trip.to.name} · {bus.droppingPoint.name}
                  </p>
                  <p className="text-xs text-muted">{bus.droppingPoint.address}</p>
                </div>
              </div>
              <p className="mt-3 text-sm font-bold">Seats: {bus.seats.join(', ')}</p>
            </div>
          ) : (
            booking.flights.map((leg) => {
              const slice = leg.offer.slices[0];
              const departure = slice?.segments[0]?.departure ?? '';
              return (
                <div key={leg.sequence} className="rounded-xl border border-border p-4">
                  <div className="flex justify-between gap-3">
                    <p className="font-bold">
                      {slice?.segments[0]?.from} → {slice?.segments.at(-1)?.to} ·{' '}
                      {leg.offer.carrier.name}
                    </p>
                    <p className="font-mono font-bold text-primary">PNR {leg.pnr}</p>
                  </div>
                  <p className="text-xs text-muted">
                    {localDateOf(departure)} · {CABIN_CLASS_LABELS[leg.offer.cabin]} (
                    {leg.fare.name}) · Baggage: cabin {leg.fare.cabinBaggageKg} kg, check-in{' '}
                    {leg.fare.checkinBaggageKg} kg
                  </p>
                  <ol className="mt-3 space-y-2">
                    {slice?.segments.map((seg, i) => (
                      <li
                        key={`${seg.flightNo}-${i}`}
                        className="grid grid-cols-[6rem_1fr_1fr] gap-3 text-sm"
                      >
                        <span className="font-bold">{seg.flightNo}</span>
                        <span>
                          <strong className="tabular-nums">{clockTime(seg.departure)}</strong>{' '}
                          {seg.from} · Terminal {seg.terminalFrom}
                        </span>
                        <span>
                          <strong className="tabular-nums">
                            {arrivalLabel(seg.departure, seg.arrival)}
                          </strong>{' '}
                          {seg.to} · Terminal {seg.terminalTo} · {duration(seg.durationMin)}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })
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
                  {bus.trip.cancellationPolicy
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
                  Web check-in opens 48 hours and closes 60 minutes before departure — check in on
                  the airline website or app. Counters close 45 minutes before domestic departures.
                </li>
                {[...new Set(booking.flights.map((f) => f.offer.carrier.code))].map((code) => {
                  const airline = findMockAirline(code);
                  return (
                    <li key={code}>
                      {airline?.name ?? code} helpline:{' '}
                      {airline?.phone ?? 'see the airline website'}
                    </li>
                  );
                })}
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

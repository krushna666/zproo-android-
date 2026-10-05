import { Button, Card, CardContent, CardHeader, CardTitle, FormAlert, Skeleton } from '@zproo/ui';
import { formatMoney } from '@zproo/utils';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router';
import { Seo } from '@/components/seo/Seo';
import { useBusTrip } from '@/features/buses/api';
import { AmenityList } from '@/features/buses/components/AmenityList';
import { BusTripSummary } from '@/features/buses/components/BusTripSummary';
import { istTime, policyRows } from '@/features/buses/format';
import { busSeatsUrl } from '@/features/buses/links';
import { userMessage } from '@/lib/apiErrors';

export default function BusDetailsPage() {
  const { id } = useParams();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const { data: trip, isPending, error, refetch } = useBusTrip(id);

  if (isPending) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-8 sm:px-6" aria-busy>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-64 rounded-[14px]" />
      </div>
    );
  }
  if (error || !trip) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-12 sm:px-6">
        <Seo title="Bus details" noIndex />
        <h1 className="text-[28px] font-extrabold">Bus unavailable</h1>
        <FormAlert>{userMessage(error)}</FormAlert>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
          <Button asChild variant="ghost">
            <Link to="/buses">
              <ArrowLeft aria-hidden /> Search buses
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <Seo title={`${trip.operator.name} ${trip.serviceNumber}`} noIndex />
      <Link
        to={from ?? '/buses'}
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" /> {from ? 'Back to results' : 'Search buses'}
      </Link>
      <h1 className="text-[28px] font-extrabold tracking-tight">
        {trip.from.name} → {trip.to.name}
      </h1>
      <p className="mt-1 text-muted">
        {trip.operator.name} · {trip.busType.label} · {trip.distanceKm} km
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <BusTripSummary trip={trip} />
          {trip.photos.length > 0 && (
            <ul className="flex gap-3 overflow-x-auto pb-1" aria-label="Photos">
              {trip.photos.map((p) => (
                <li key={p.url} className="shrink-0">
                  <img
                    src={p.url}
                    alt={p.alt}
                    loading="lazy"
                    width={240}
                    height={160}
                    className="h-40 w-60 rounded-[14px] border border-border bg-background object-cover"
                  />
                </li>
              ))}
            </ul>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Amenities</CardTitle>
            </CardHeader>
            <CardContent>
              <AmenityList amenities={trip.amenities} />
            </CardContent>
          </Card>
          <div className="grid gap-6 sm:grid-cols-2">
            {(
              [
                ['Boarding points', trip.boardingPoints],
                ['Dropping points', trip.droppingPoints],
              ] as const
            ).map(([title, points]) => (
              <Card key={title}>
                <CardHeader>
                  <CardTitle className="text-base">{title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-3 text-sm">
                    {points.map((p) => (
                      <li key={p.id} className="flex gap-3">
                        <span className="w-12 shrink-0 font-bold tabular-nums">
                          {istTime(p.time)}
                        </span>
                        <span>
                          <span className="block font-semibold">{p.name}</span>
                          <span className="block text-xs text-muted">{p.landmark}</span>
                          <span className="block text-xs text-muted">{p.address}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            ))}
          </div>
          {trip.restStops.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Rest stops</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {trip.restStops.map((r) => (
                    <li key={r.name} className="flex gap-3">
                      <span className="w-12 shrink-0 font-bold tabular-nums">
                        {istTime(r.time)}
                      </span>
                      <span>
                        {r.name} <span className="text-muted">· {r.durationMin} min</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cancellation policy</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {policyRows(trip.cancellationPolicy).map((r) => (
                    <tr key={r.when}>
                      <td className="py-2 text-muted">{r.when}</td>
                      <td className="py-2 text-right font-semibold">{r.refund}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Travel policies</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted">
              <p>{trip.policies.luggage}</p>
              <p>{trip.policies.pets}</p>
              <p>{trip.policies.idProof}</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-[calc(var(--header-height)+1rem)] lg:self-start">
          <Card>
            <CardContent className="space-y-1 p-5">
              <p className="text-sm text-muted">Seats from</p>
              <p className="text-2xl font-extrabold tabular-nums">{formatMoney(trip.fromPrice)}</p>
              <p className="text-sm text-muted">{trip.seatsLeft} seats left</p>
            </CardContent>
          </Card>
          {trip.bookable ? (
            <Button asChild size="lg" className="w-full">
              <Link to={busSeatsUrl(trip.tripId)} state={from ? { from } : undefined}>
                Select seats <ArrowRight aria-hidden />
              </Link>
            </Button>
          ) : (
            <FormAlert>Booking for this bus has closed</FormAlert>
          )}
        </div>
      </div>
    </div>
  );
}

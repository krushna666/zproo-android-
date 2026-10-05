import { FormAlert } from '@zproo/ui';
import { Navigate, useParams } from 'react-router';
import { PageLoader } from '@/components/feedback/PageLoader';
import { errorMessage } from '@/features/auth/errors';
import { useBooking } from '@/features/checkout/api';
import { confirmationUrl, paymentUrl, serviceOf } from '@/features/checkout/links';
import { isAwaitingPayment } from '@/features/checkout/status';

/** /bookings/:reference opens the booking's own page (payment if unpaid, otherwise the ticket). */
export default function BookingRedirectPage() {
  const { id = '' } = useParams();
  const { data, isPending, error } = useBooking(id.toUpperCase());
  if (isPending) return <PageLoader />;
  if (error || !data) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <FormAlert>{errorMessage(error)}</FormAlert>
      </div>
    );
  }
  const service = serviceOf(data);
  return (
    <Navigate
      to={
        isAwaitingPayment(data)
          ? paymentUrl(service, data.reference)
          : confirmationUrl(service, data.reference)
      }
      replace
    />
  );
}

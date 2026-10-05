import { formatMoney } from '@zproo/utils';
import { useEffect, useState } from 'react';
import { env } from '@/lib/env';

/**
 * A UPI QR for the amount (scan with any UPI app), from VITE_UPI_ID. Payment is still confirmed
 * only by the gateway; the QR is a convenience for paying from another phone.
 */
export function UpiQr({ amountPaise, reference }: { amountPaise: number; reference: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const upiId = env.upiId;
  useEffect(() => {
    if (!upiId) return;
    const uri = `upi://pay?${new URLSearchParams({
      pa: upiId,
      pn: 'ZPROO GO',
      am: (amountPaise / 100).toFixed(2),
      cu: 'INR',
      tn: `Booking ${reference}`,
    }).toString()}`;
    let cancelled = false;
    void import('qrcode')
      .then((qr) => qr.toDataURL(uri, { margin: 1, width: 176 }))
      .then((url) => !cancelled && setSrc(url))
      .catch(() => !cancelled && setSrc(null));
    return () => {
      cancelled = true;
    };
  }, [upiId, amountPaise, reference]);

  if (!upiId) {
    return <p className="text-sm text-muted">Pay with any UPI app at the next step.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-4">
      {src ? (
        <img
          src={src}
          width={176}
          height={176}
          alt={`UPI QR code to pay ${formatMoney(amountPaise)} to ${upiId}`}
          className="rounded-xl border border-border bg-card"
        />
      ) : (
        <div className="size-44 animate-pulse rounded-xl bg-border/60" aria-hidden />
      )}
      <div className="text-sm">
        <p className="font-semibold">Scan with any UPI app</p>
        <p className="text-muted">
          UPI ID: <span className="font-mono">{upiId}</span>
        </p>
        <p className="text-muted">Amount: {formatMoney(amountPaise)}</p>
      </div>
    </div>
  );
}

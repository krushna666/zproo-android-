import { useEffect, useState } from 'react';

/** QR code of the booking reference (what operators scan at boarding). */
export function ReferenceQr({ reference, size = 96 }: { reference: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void import('qrcode')
      .then((qr) => qr.toDataURL(reference, { margin: 1, width: size }))
      .then((url) => !cancelled && setSrc(url))
      .catch(() => !cancelled && setSrc(null));
    return () => {
      cancelled = true;
    };
  }, [reference, size]);
  return src ? (
    <img src={src} width={size} height={size} alt={`QR code for booking ${reference}`} />
  ) : (
    <span aria-hidden className="block bg-border/60" style={{ width: size, height: size }} />
  );
}

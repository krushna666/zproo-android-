import { useEffect, useState } from 'react';
import { clientNow } from '@/lib/clock';

/** Whole seconds remaining until `targetMs` (a timestamp), updating every second. */
export function useCountdown(targetMs: number): number {
  const [now, setNow] = useState(() => clientNow());

  useEffect(() => {
    const tick = () => {
      const t = clientNow();
      setNow(t);
      if (t >= targetMs) window.clearInterval(interval);
    };
    // Sync immediately (the target may have just moved), then every second.
    const immediate = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(immediate);
      window.clearInterval(interval);
    };
  }, [targetMs]);

  return Math.max(0, Math.ceil((targetMs - now) / 1000));
}

import { useEffect, useState } from 'react';
import { clientNow } from '@/lib/clock';

/** The app clock (server-corrected), refreshed every `intervalMs` (deadlines that can pass). */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => clientNow());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(clientNow()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

import { Check, CircleAlert } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';
import { cn } from '../lib/cn';

export type ToastTone = 'success' | 'error';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

/** SOP: toasts disappear after 3.2 seconds. */
export const TOAST_DURATION_MS = 3_200;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function push(tone: ToastTone, message: string): number {
  const id = nextId++;
  // One toast at a time keeps the message readable; the newest wins.
  items = [{ id, tone, message }];
  emit();
  return id;
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

/** Show a toast from anywhere (event handlers, mutations, interceptors). */
export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message),
  dismiss,
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => items;
// The same empty list every time: useSyncExternalStore needs a stable server snapshot.
const NO_TOASTS: ToastItem[] = [];
const serverSnapshot = () => NO_TOASTS;

function ToastView({ item }: { item: ToastItem }) {
  useEffect(() => {
    const timer = setTimeout(() => dismiss(item.id), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [item.id]);
  const Icon = item.tone === 'success' ? Check : CircleAlert;
  return (
    <div
      role={item.tone === 'success' ? 'status' : 'alert'}
      data-testid={item.tone === 'success' ? 'toast-success' : 'toast-error'}
      className="pointer-events-auto flex max-w-[calc(100vw-2rem)] animate-fade-in items-center gap-3 rounded-xl bg-card px-4 py-3 text-sm font-medium text-foreground shadow-2xl"
    >
      <span
        aria-hidden
        className={cn(
          'grid size-6 shrink-0 place-items-center rounded-full text-primary-foreground',
          item.tone === 'success' ? 'bg-success' : 'bg-danger',
        )}
      >
        <Icon className="size-4" strokeWidth={3} />
      </span>
      <span>{item.message}</span>
    </div>
  );
}

/** Mount once near the root: fixed top-centre, 20px from the top. */
export function Toaster() {
  const current = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-5 z-[100] flex flex-col items-center gap-2 px-4"
    >
      {current.map((item) => (
        <ToastView key={item.id} item={item} />
      ))}
    </div>
  );
}

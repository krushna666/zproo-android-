import { Skeleton } from '@zproo/ui';
import { SERVICES } from '@/config/services';

/** Same footprint as the loaded widget (tabs + flight form) so nothing jumps when it arrives. */
export function SearchWidgetSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading search"
      className="rounded-[1.75rem] border border-border bg-card shadow-raised"
    >
      <div className="flex gap-1 overflow-hidden border-b border-border px-3 pt-3 sm:px-5 lg:justify-between">
        {SERVICES.map(({ type, label, icon: Icon }) => (
          <div
            key={type}
            className="flex min-w-[4.75rem] shrink-0 flex-col items-center gap-1 px-3 pb-3 pt-2 text-xs font-semibold text-foreground/40 sm:text-sm"
          >
            <span className="grid size-10 place-items-center rounded-2xl bg-background">
              <Icon aria-hidden className="size-5" />
            </span>
            {label}
          </div>
        ))}
      </div>
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
        <div className="grid gap-3 lg:grid-cols-[1.15fr_1.15fr_0.85fr_0.85fr_1fr]">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[4.25rem] rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-14 w-full rounded-full lg:mx-auto lg:w-72" />
      </div>
    </div>
  );
}

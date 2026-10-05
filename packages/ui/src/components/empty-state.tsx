import type { ComponentType, ReactNode } from 'react';
import { cn } from '../lib/cn';

interface EmptyStateProps {
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  title: string;
  description?: ReactNode;
  /** Buttons or links, e.g. "Clear filters" or "Search again". */
  actions?: ReactNode;
  className?: string;
  'data-testid'?: string;
}

/** The "nothing here" state every data screen needs (never a blank screen). */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actions,
  className,
  ...rest
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-[14px] border border-dashed border-border bg-card px-6 py-12 text-center',
        className,
      )}
      {...rest}
    >
      {Icon && (
        <span className="mb-4 grid size-12 place-items-center rounded-full bg-primary-light text-primary">
          <Icon aria-hidden className="size-6" />
        </span>
      )}
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      {description && <p className="mt-1.5 max-w-md text-sm text-muted">{description}</p>}
      {actions && <div className="mt-5 flex flex-wrap justify-center gap-3">{actions}</div>}
    </div>
  );
}

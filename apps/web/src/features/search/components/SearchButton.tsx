import { Button, cn } from '@zproo/ui';
import { Search } from 'lucide-react';

export function SearchButton({
  label,
  className,
  testId,
}: {
  label: string;
  className?: string;
  testId?: string;
}) {
  return (
    <Button
      type="submit"
      data-testid={testId}
      size="lg"
      className={cn('h-14 w-full text-base shadow-md shadow-primary/25', className)}
    >
      <Search aria-hidden className="size-5!" /> {label}
    </Button>
  );
}

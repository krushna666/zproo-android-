import type { SavedTraveller } from '@zproo/types';
import { useId } from 'react';
import { travellerName } from '@/features/travellers/api';
import { SelectInput } from './SelectInput';

/**
 * SOP §6.3 on each traveller card: fill it from a saved traveller, and "Save traveller for next
 * time" (saved after the booking is held). The picker only shows when there is someone to pick.
 */
export function SavedTravellerControls({
  index,
  saved,
  onPick,
  keep,
  onKeepChange,
}: {
  index: number;
  saved: readonly SavedTraveller[];
  onPick: (traveller: SavedTraveller) => void;
  keep: boolean;
  onKeepChange: (keep: boolean) => void;
}) {
  const id = useId();
  const prefix = `checkout-traveller-${index}`;
  return (
    <div className="col-span-full flex flex-wrap items-end justify-between gap-3">
      {saved.length > 0 && (
        <div className="min-w-[12rem] flex-1 sm:max-w-xs">
          <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-muted">
            Saved travellers
          </label>
          <SelectInput
            id={id}
            data-testid={`${prefix}-saved`}
            value=""
            onChange={(e) => {
              const picked = saved.find((t) => t.id === e.target.value);
              if (picked) onPick(picked);
            }}
          >
            <option value="">Choose a saved traveller</option>
            {saved.map((t) => (
              <option key={t.id} value={t.id}>
                {travellerName(t)}
              </option>
            ))}
          </SelectInput>
        </div>
      )}
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          data-testid={`${prefix}-save`}
          checked={keep}
          onChange={(e) => onKeepChange(e.target.checked)}
          className="size-4 accent-primary"
        />
        Save traveller for next time
      </label>
    </div>
  );
}

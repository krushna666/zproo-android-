import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormAlert,
  Skeleton,
} from '@zproo/ui';
import { Trash2, UserRound } from 'lucide-react';
import { titleLabel } from '@/features/checkout/titles';
import { userMessage } from '@/lib/apiErrors';
import { travellerName, useRemoveTraveller, useSavedTravellers } from './api';

const GENDER = { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other' } as const;

/** Profile: the travellers saved from checkout ("Save traveller for next time"). */
export function SavedTravellersCard() {
  const { data, isPending, error } = useSavedTravellers();
  const remove = useRemoveTraveller();
  return (
    <Card data-testid="saved-travellers">
      <CardHeader>
        <CardTitle>Saved travellers</CardTitle>
        <CardDescription>
          Offered on every booking form. Tick “Save traveller for next time” at checkout to add
          someone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <FormAlert>{userMessage(error)}</FormAlert>
        ) : isPending ? (
          <Skeleton className="h-16 rounded-xl" />
        ) : data.length === 0 ? (
          <p className="text-sm text-muted" data-testid="saved-travellers-empty">
            No saved travellers yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {data.map((t) => (
              <li
                key={t.id}
                data-testid={`saved-traveller-${t.id}`}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <UserRound aria-hidden className="size-5 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {t.title ? `${titleLabel(t.title)} ` : ''}
                      {travellerName(t)}
                    </span>
                    <span className="block text-xs text-muted">
                      {[t.gender && GENDER[t.gender], t.dob && `Born ${t.dob}`]
                        .filter(Boolean)
                        .join(' · ') || 'Name only'}
                    </span>
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${travellerName(t)}`}
                  data-testid={`saved-traveller-remove-${t.id}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(t.id)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiSuccess, SavedTraveller } from '@zproo/types';
import type { SavedTravellerInput } from '@zproo/validation';
import { toast } from '@zproo/ui';
import { useAuthStore } from '@/features/auth/store';
import { userMessage } from '@/lib/apiErrors';
import { apiGet, http } from '@/services/http';

export const travellerKeys = { all: ['me', 'travellers'] as const };

export const travellersApi = {
  list: () => apiGet<SavedTraveller[]>('/me/travellers'),
  save: async (input: SavedTravellerInput) =>
    (await http.put<ApiSuccess<SavedTraveller>>('/me/travellers', input)).data.data,
  remove: async (id: string) => {
    await http.delete(`/me/travellers/${encodeURIComponent(id)}`);
  },
};

/** The signed-in user's saved travellers (SOP §6.3); empty while signed out. */
export function useSavedTravellers() {
  const signedIn = useAuthStore((s) => s.status === 'authenticated');
  return useQuery({
    queryKey: travellerKeys.all,
    queryFn: travellersApi.list,
    enabled: signedIn,
    staleTime: 60_000,
  });
}

/**
 * Saves the ticked travellers after the booking went through. It never blocks checkout: a
 * failure (e.g. the 20-traveller limit) is only a toast.
 */
export function useSaveTravellers() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (list: SavedTravellerInput[]) =>
      Promise.allSettled(list.map((t) => travellersApi.save(t))),
    onSuccess: (results) => {
      const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed) toast.error(userMessage(failed.reason));
      void queryClient.invalidateQueries({ queryKey: travellerKeys.all });
    },
  });
  return (list: SavedTravellerInput[]) => {
    if (list.length > 0) mutation.mutate(list);
  };
}

export function useRemoveTraveller() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: travellersApi.remove,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: travellerKeys.all }),
    onError: (err) => toast.error(userMessage(err)),
  });
}

/** The name as saved ("Amit Sharma"; one-word names have no last name). */
export const travellerName = (t: Pick<SavedTraveller, 'firstName' | 'lastName'>) =>
  `${t.firstName} ${t.lastName}`.trim();

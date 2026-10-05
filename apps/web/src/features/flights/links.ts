/** Fare selection page; round trips carry the chosen return offer. */
export const offerUrl = (offerId: string, returnOfferId?: string) =>
  `/flights/offer/${encodeURIComponent(offerId)}${returnOfferId ? `?return=${encodeURIComponent(returnOfferId)}` : ''}`;

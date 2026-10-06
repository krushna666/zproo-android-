/** A hotel's page for a stay (dates and rooms in the URL, so the link can be shared). */
export function hotelDetailsUrl(
  hotelId: string,
  stay: { checkIn: string; checkOut: string; rooms: string },
): string {
  const query = new URLSearchParams(stay);
  return `/hotels/${encodeURIComponent(hotelId)}?${query.toString()}`;
}

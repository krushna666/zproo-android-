import type { HotelRoomType, RoomOccupancy } from '@zproo/types';
import { roomFitsMessage } from '@zproo/validation';

/** Why the active room can't take this room type, or null. */
export function fitProblem(roomType: HotelRoomType, room: RoomOccupancy): string | null {
  if (room.adults > roomType.maxAdults) return roomFitsMessage(roomType.maxAdults, 'adults');
  if (room.childAges.length > roomType.maxChildren)
    return roomFitsMessage(roomType.maxChildren, 'children');
  return null;
}

import type { PrismaClient, SavedTraveller as Row } from '@prisma/client';
import type { SavedTraveller } from '@zproo/types';
import {
  SAVED_TRAVELLERS_MAX,
  TRAVELLER_MESSAGES,
  type SavedTravellerData,
} from '@zproo/validation';
import { ConflictError, NotFoundError } from '../utils/errors';

const toSavedTraveller = (r: Row): SavedTraveller => ({
  id: r.id,
  title: r.title as SavedTraveller['title'],
  firstName: r.firstName,
  lastName: r.lastName,
  gender: r.gender,
  dob: r.dateOfBirth ? r.dateOfBirth.toISOString().slice(0, 10) : null,
  updatedAt: r.updatedAt.toISOString(),
});

/**
 * Travellers saved on the profile (SOP §6.3). Every query is scoped to the signed-in user, so
 * another customer's traveller is simply "not found".
 */
export class TravellerService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: string): Promise<SavedTraveller[]> {
    const rows = await this.prisma.savedTraveller.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: SAVED_TRAVELLERS_MAX,
    });
    return rows.map(toSavedTraveller);
  }

  /** Saves a traveller; the same name again updates the saved details. */
  async save(userId: string, input: SavedTravellerData): Promise<SavedTraveller> {
    const key = { userId, firstName: input.firstName, lastName: input.lastName };
    const existing = await this.prisma.savedTraveller.findUnique({
      where: { userId_firstName_lastName: key },
    });
    if (
      !existing &&
      (await this.prisma.savedTraveller.count({ where: { userId } })) >= SAVED_TRAVELLERS_MAX
    )
      throw new ConflictError(TRAVELLER_MESSAGES.limit);
    const details = {
      // A later save without a detail keeps what was saved before.
      ...(input.title !== undefined && { title: input.title }),
      ...(input.gender !== undefined && { gender: input.gender }),
      ...(input.dob !== undefined && { dateOfBirth: new Date(`${input.dob}T00:00:00Z`) }),
    };
    const row = await this.prisma.savedTraveller.upsert({
      where: { userId_firstName_lastName: key },
      create: { ...key, ...details },
      update: details,
    });
    return toSavedTraveller(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.savedTraveller.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundError('Traveller not found');
  }
}

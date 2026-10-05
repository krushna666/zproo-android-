/**
 * Seeds the database (`npm run db:seed`). Idempotent — safe to run repeatedly.
 * Reference data (roles, permissions, settings) plus development demo data.
 */
import { PrismaClient } from '@prisma/client';
import { seedDemoUsers } from './seed/demoUsers';
import { seedBusData } from './seed/buses';
import { seedFlightData } from './seed/flights';
import { seedReferenceData } from './seed/reference';

const prisma = new PrismaClient();

async function main() {
  await seedReferenceData(prisma);
  const demo = await seedDemoUsers(prisma);
  const { flights } = await seedFlightData(prisma);
  const buses = await seedBusData(prisma);
  const [roles, permissions, settings, users] = await Promise.all([
    prisma.role.count(),
    prisma.permission.count(),
    prisma.systemSetting.count(),
    prisma.user.count(),
  ]);
  console.info(
    `Seed complete: ${roles} roles, ${permissions} permissions, ${settings} settings, ${users} users, ${flights} flight services, ${buses.services} bus services on ${buses.routes} routes`,
  );
  if (demo.printed) console.info(demo.printed);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

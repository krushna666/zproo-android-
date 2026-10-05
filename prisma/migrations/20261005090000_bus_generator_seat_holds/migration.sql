-- Bus inventory now comes from the shared deterministic generator (@zproo/catalog); seats
-- held or sold through ZPROO GO live in bus_seat_holds. The seeded network tables go.
-- DropForeignKey
ALTER TABLE "bus_route_points" DROP CONSTRAINT "bus_route_points_route_id_fkey";

-- DropForeignKey
ALTER TABLE "bus_schedules" DROP CONSTRAINT "bus_schedules_bus_id_fkey";

-- DropForeignKey
ALTER TABLE "bus_schedules" DROP CONSTRAINT "bus_schedules_route_id_fkey";

-- DropForeignKey
ALTER TABLE "bus_seat_bookings" DROP CONSTRAINT "bus_seat_bookings_booking_id_fkey";

-- DropForeignKey
ALTER TABLE "bus_seat_bookings" DROP CONSTRAINT "bus_seat_bookings_seat_id_fkey";

-- DropForeignKey
ALTER TABLE "bus_seat_bookings" DROP CONSTRAINT "bus_seat_bookings_trip_id_fkey";

-- DropForeignKey
ALTER TABLE "bus_seats" DROP CONSTRAINT "bus_seats_bus_id_fkey";

-- DropForeignKey
ALTER TABLE "bus_trips" DROP CONSTRAINT "bus_trips_schedule_id_fkey";

-- DropForeignKey
ALTER TABLE "buses" DROP CONSTRAINT "buses_operator_id_fkey";

-- AlterTable: keep existing bus bookings (backfill the new columns from the old ones).
ALTER TABLE "bus_bookings" ADD COLUMN "bus_type" TEXT, ADD COLUMN "seats" TEXT[];
UPDATE "bus_bookings"
SET "seats" = "seat_numbers",
    "bus_type" = COALESCE("offer"->'bus'->>'name', 'Bus'),
    "trip_id" = COALESCE("trip_id", "offer_id");
ALTER TABLE "bus_bookings"
  DROP COLUMN "offer_id",
  DROP COLUMN "seat_numbers",
  ALTER COLUMN "bus_type" SET NOT NULL,
  ALTER COLUMN "trip_id" SET NOT NULL;

-- DropTable
DROP TABLE "bus_operators";

-- DropTable
DROP TABLE "bus_route_points";

-- DropTable
DROP TABLE "bus_routes";

-- DropTable
DROP TABLE "bus_schedules";

-- DropTable
DROP TABLE "bus_seat_bookings";

-- DropTable
DROP TABLE "bus_seats";

-- DropTable
DROP TABLE "bus_trips";

-- DropTable
DROP TABLE "buses";

-- DropEnum
DROP TYPE "BusDeck";

-- DropEnum
DROP TYPE "BusPointKind";

-- DropEnum
DROP TYPE "BusSeatKind";

-- DropEnum
DROP TYPE "BusType";

-- CreateTable
CREATE TABLE "bus_seat_holds" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "seat_no" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "female" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3),
    "active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bus_seat_holds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bus_seat_holds_booking_id_idx" ON "bus_seat_holds"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "bus_seat_holds_trip_id_seat_no_active_key" ON "bus_seat_holds"("trip_id", "seat_no", "active");

-- AddForeignKey
ALTER TABLE "bus_seat_holds" ADD CONSTRAINT "bus_seat_holds_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;


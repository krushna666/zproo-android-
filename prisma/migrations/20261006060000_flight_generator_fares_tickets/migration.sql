-- Flights move from a seeded timetable to the deterministic generator (@zproo/catalog):
-- timetable tables are dropped, seat holds get their own table, fares and tickets are stored
-- per direction, and passengers gain infant links and encrypted passport columns.
-- Existing bookings are preserved: fares and tickets are back-filled from the stored snapshot.

-- Timetable (replaced by the generator)
ALTER TABLE "flight_inventory" DROP CONSTRAINT "flight_inventory_flight_id_fkey";
ALTER TABLE "flight_segments" DROP CONSTRAINT "flight_segments_airline_id_fkey";
ALTER TABLE "flight_segments" DROP CONSTRAINT "flight_segments_destination_id_fkey";
ALTER TABLE "flight_segments" DROP CONSTRAINT "flight_segments_flight_id_fkey";
ALTER TABLE "flight_segments" DROP CONSTRAINT "flight_segments_origin_id_fkey";
ALTER TABLE "flights" DROP CONSTRAINT "flights_airline_id_fkey";
ALTER TABLE "flights" DROP CONSTRAINT "flights_destination_id_fkey";
ALTER TABLE "flights" DROP CONSTRAINT "flights_origin_id_fkey";
DROP INDEX "flight_bookings_flight_id_service_date_idx";

-- Passengers
ALTER TABLE "booking_passengers" ADD COLUMN "nationality" CHAR(2),
ADD COLUMN "passport_expiry_enc" TEXT,
ADD COLUMN "passport_number_enc" TEXT,
ADD COLUMN "travelling_with" INTEGER;

-- Tickets: one row per traveller and direction
CREATE TABLE "flight_tickets" (
    "id" TEXT NOT NULL,
    "flight_booking_id" TEXT NOT NULL,
    "passenger_id" TEXT NOT NULL,
    "ticket_number" TEXT NOT NULL,
    "segment_key" TEXT NOT NULL,

    CONSTRAINT "flight_tickets_pkey" PRIMARY KEY ("id")
);

INSERT INTO "flight_tickets" ("id", "flight_booking_id", "passenger_id", "ticket_number", "segment_key")
SELECT gen_random_uuid()::text, fb."id", t->>'passengerId', t->>'ticketNumber',
       fb."origin_code" || '-' || fb."destination_code"
FROM "flight_bookings" fb
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(fb."tickets", '[]'::jsonb)) AS t
WHERE COALESCE(t->>'ticketNumber', '') <> ''
  AND EXISTS (SELECT 1 FROM "booking_passengers" p WHERE p."id" = t->>'passengerId');

-- Fares per direction (nullable first, back-filled from the offer snapshot, then required)
ALTER TABLE "flight_bookings" ADD COLUMN "airline_locator" TEXT,
ADD COLUMN "fare" JSONB,
ADD COLUMN "fare_family" TEXT,
ADD COLUMN "fare_id" TEXT,
ADD COLUMN "itinerary_key" TEXT;

UPDATE "flight_bookings" SET
  "fare_family" = COALESCE("offer"->>'fareFamily', 'Saver'),
  "fare_id" = 'fare_legacy_' || lower(replace(COALESCE("offer"->>'fareFamily', 'saver'), ' ', '')),
  "itinerary_key" = 'legacy_' || "id",
  "fare" = jsonb_build_object(
    'fareId', 'fare_legacy_' || lower(replace(COALESCE("offer"->>'fareFamily', 'saver'), ' ', '')),
    'name', COALESCE("offer"->>'fareFamily', 'Saver'),
    'price', COALESCE(("offer"#>>'{fares,ADULT,totalPaise}')::int, 0),
    'total', COALESCE(("offer"->>'totalPaise')::int, 0),
    'perPax', jsonb_build_object(
      'ADULT', jsonb_build_object('base', COALESCE(("offer"#>>'{fares,ADULT,basePaise}')::int, 0), 'taxes', COALESCE(("offer"#>>'{fares,ADULT,taxesPaise}')::int, 0), 'fees', 0, 'total', COALESCE(("offer"#>>'{fares,ADULT,totalPaise}')::int, 0)),
      'CHILD', jsonb_build_object('base', COALESCE(("offer"#>>'{fares,CHILD,basePaise}')::int, 0), 'taxes', COALESCE(("offer"#>>'{fares,CHILD,taxesPaise}')::int, 0), 'fees', 0, 'total', COALESCE(("offer"#>>'{fares,CHILD,totalPaise}')::int, 0)),
      'INFANT', jsonb_build_object('base', COALESCE(("offer"#>>'{fares,INFANT,basePaise}')::int, 0), 'taxes', COALESCE(("offer"#>>'{fares,INFANT,taxesPaise}')::int, 0), 'fees', 0, 'total', COALESCE(("offer"#>>'{fares,INFANT,totalPaise}')::int, 0))),
    'cabinBaggageKg', COALESCE(("offer"#>>'{baggage,cabinKg}')::int, 7),
    'checkinBaggageKg', COALESCE(("offer"#>>'{baggage,checkInKg}')::int, 15),
    'changeFee', 0,
    'cancellationFee', "offer"->'cancellationFeePaise',
    'refundable', COALESCE(("offer"->>'refundable')::boolean, false),
    'meal', 'PAID',
    'seatSelection', 'PAID',
    'priority', false,
    'mostPopular', false)
WHERE "fare" IS NULL;

ALTER TABLE "flight_bookings" ALTER COLUMN "fare" SET NOT NULL,
ALTER COLUMN "fare_family" SET NOT NULL,
ALTER COLUMN "fare_id" SET NOT NULL,
ALTER COLUMN "itinerary_key" SET NOT NULL;

ALTER TABLE "flight_bookings" DROP COLUMN "flight_id",
DROP COLUMN "service_date",
DROP COLUMN "tickets";

DROP TABLE "airlines";
DROP TABLE "airports";
DROP TABLE "flight_inventory";
DROP TABLE "flight_segments";
DROP TABLE "flights";

-- Seat holds on generated itineraries
CREATE TABLE "flight_seat_holds" (
    "id" TEXT NOT NULL,
    "itinerary_key" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3),
    "active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flight_seat_holds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "flight_tickets_ticket_number_key" ON "flight_tickets"("ticket_number");
CREATE UNIQUE INDEX "flight_tickets_flight_booking_id_passenger_id_key" ON "flight_tickets"("flight_booking_id", "passenger_id");
CREATE INDEX "flight_seat_holds_itinerary_key_active_idx" ON "flight_seat_holds"("itinerary_key", "active");

ALTER TABLE "flight_tickets" ADD CONSTRAINT "flight_tickets_flight_booking_id_fkey" FOREIGN KEY ("flight_booking_id") REFERENCES "flight_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "flight_tickets" ADD CONSTRAINT "flight_tickets_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "booking_passengers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "flight_seat_holds" ADD CONSTRAINT "flight_seat_holds_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

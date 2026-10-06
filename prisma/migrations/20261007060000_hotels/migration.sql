-- CreateTable
CREATE TABLE "hotel_booking_details" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "hotel_name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "nights" INTEGER NOT NULL,
    "confirmation_no" TEXT,
    "supplier_ref" TEXT,
    "special_requests" TEXT,
    "hotel" JSONB NOT NULL,

    CONSTRAINT "hotel_booking_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_booking_rooms" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "room_type_id" TEXT NOT NULL,
    "room_name" TEXT NOT NULL,
    "rate_id" TEXT NOT NULL,
    "board_basis" TEXT NOT NULL,
    "refundable" BOOLEAN NOT NULL,
    "free_cancellation_until" TIMESTAMP(3),
    "adults" INTEGER NOT NULL,
    "child_ages" INTEGER[],
    "lead_guest" JSONB NOT NULL,
    "price" INTEGER NOT NULL,
    "taxes" INTEGER NOT NULL,
    "nightly" JSONB NOT NULL,

    CONSTRAINT "hotel_booking_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_room_holds" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "room_type_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "rooms" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3),
    "active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotel_room_holds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hotel_booking_details_booking_id_key" ON "hotel_booking_details"("booking_id");

-- CreateIndex
CREATE INDEX "hotel_booking_details_hotel_id_idx" ON "hotel_booking_details"("hotel_id");

-- CreateIndex
CREATE UNIQUE INDEX "hotel_booking_rooms_booking_id_sequence_key" ON "hotel_booking_rooms"("booking_id", "sequence");

-- CreateIndex
CREATE INDEX "hotel_room_holds_hotel_id_active_idx" ON "hotel_room_holds"("hotel_id", "active");

-- CreateIndex
CREATE INDEX "hotel_room_holds_booking_id_idx" ON "hotel_room_holds"("booking_id");

-- AddForeignKey
ALTER TABLE "hotel_booking_details" ADD CONSTRAINT "hotel_booking_details_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_booking_rooms" ADD CONSTRAINT "hotel_booking_rooms_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_room_holds" ADD CONSTRAINT "hotel_room_holds_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;


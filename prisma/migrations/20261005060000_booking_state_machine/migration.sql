-- Booking lifecycle per the booking state machine (see @zproo/utils bookingState.ts).
-- Values are renamed (not dropped) so existing rows keep their meaning.
ALTER TYPE "BookingStatus" RENAME VALUE 'INITIATED' TO 'DRAFT';
ALTER TYPE "BookingStatus" RENAME VALUE 'PENDING_PAYMENT' TO 'HELD';
ALTER TYPE "BookingStatus" ADD VALUE 'PAYMENT_PENDING' AFTER 'HELD';
ALTER TYPE "BookingStatus" ADD VALUE 'EXPIRED' AFTER 'CONFIRMED';
ALTER TYPE "BookingStatus" ADD VALUE 'FAILED' AFTER 'EXPIRED';

ALTER TYPE "PaymentStatus" RENAME VALUE 'SUCCESS' TO 'CAPTURED';
ALTER TYPE "PaymentStatus" ADD VALUE 'REFUND_DUE' AFTER 'FAILED';

-- CreateTable
CREATE TABLE "booking_events" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "from_status" "BookingStatus",
    "to_status" "BookingStatus" NOT NULL,
    "actor" TEXT NOT NULL,
    "reason" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_events_booking_id_at_idx" ON "booking_events"("booking_id", "at");

-- AddForeignKey
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

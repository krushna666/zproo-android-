-- Refund owed after a customer cancellation (paise).
ALTER TABLE "bookings" ADD COLUMN "refund_amount_paise" INTEGER;

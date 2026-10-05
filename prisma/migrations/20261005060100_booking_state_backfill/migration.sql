-- Separate migration: PostgreSQL cannot use enum values added in the same transaction.
-- Holds that ran out were previously stored as CANCELLED with reason HOLD_EXPIRED.
UPDATE "bookings" SET "status" = 'EXPIRED' WHERE "status" = 'CANCELLED' AND "cancellation_reason" = 'HOLD_EXPIRED';
-- Payments captured after the hold expired were stored as FAILED with a "refund due" note.
UPDATE "payments" SET "status" = 'REFUND_DUE' WHERE "status" = 'FAILED' AND "failure_reason" LIKE '%refund due%';
ALTER TABLE "bookings" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

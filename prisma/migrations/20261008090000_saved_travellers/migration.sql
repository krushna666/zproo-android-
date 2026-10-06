-- CreateTable
CREATE TABLE "saved_travellers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "gender" "Gender",
    "date_of_birth" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_travellers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_travellers_user_id_updated_at_idx" ON "saved_travellers"("user_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "saved_travellers_user_id_first_name_last_name_key" ON "saved_travellers"("user_id", "first_name", "last_name");

-- AddForeignKey
ALTER TABLE "saved_travellers" ADD CONSTRAINT "saved_travellers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


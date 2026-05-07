-- Add soft-ban marker to users
ALTER TABLE "users"
ADD COLUMN "banned_at" TIMESTAMP(3);

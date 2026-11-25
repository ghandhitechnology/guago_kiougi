ALTER TABLE "floor_leaders" ADD COLUMN "paid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Rows written before the flag existed were paid when they were written.
UPDATE "floor_leaders" SET "paid" = true;

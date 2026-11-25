ALTER TABLE "characters" ADD COLUMN "opening_beat" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "opening_play" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "story_seen" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
-- Characters made before the opening existed have played without it: their opening is over.
UPDATE "characters" SET "opening_beat" = 8;

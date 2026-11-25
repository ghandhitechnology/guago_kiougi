CREATE TABLE "merit_daily" (
	"character_id" uuid NOT NULL,
	"day" integer NOT NULL,
	"key" text NOT NULL,
	"n" integer NOT NULL,
	CONSTRAINT "merit_daily_character_id_day_key_pk" PRIMARY KEY("character_id","day","key"),
	CONSTRAINT "merit_daily_n_check" CHECK ("merit_daily"."n" >= 0)
);
--> statement-breakpoint
ALTER TABLE "floor_leaders" ADD COLUMN "paid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "merit_daily" ADD CONSTRAINT "merit_daily_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Rows written before the flag existed were paid when they were written.
UPDATE "floor_leaders" SET "paid" = true;

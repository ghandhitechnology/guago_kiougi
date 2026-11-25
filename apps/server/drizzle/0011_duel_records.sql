CREATE TABLE "duel_records" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"played" integer DEFAULT 0 NOT NULL,
	"won" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "duel_records_counts_check" CHECK ("duel_records"."won" >= 0 and "duel_records"."won" <= "duel_records"."played")
);
--> statement-breakpoint
ALTER TABLE "duel_records" ADD CONSTRAINT "duel_records_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
CREATE TABLE "duel_origins" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"map_id" text NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "duel_origins" ADD CONSTRAINT "duel_origins_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
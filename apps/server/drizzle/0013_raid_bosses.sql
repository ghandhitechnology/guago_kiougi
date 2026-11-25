CREATE TABLE "boss_clears" (
	"character_id" uuid NOT NULL,
	"boss_id" text NOT NULL,
	"cleared_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boss_clears_character_id_boss_id_pk" PRIMARY KEY("character_id","boss_id")
);
--> statement-breakpoint
CREATE TABLE "raid_damage" (
	"hour" bigint PRIMARY KEY NOT NULL,
	"total" double precision DEFAULT 0 NOT NULL,
	"boss" double precision DEFAULT 0 NOT NULL,
	"standing_ms" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raid_participants" (
	"raid_id" text NOT NULL,
	"phase" smallint NOT NULL,
	"character_id" uuid NOT NULL,
	"damage" double precision DEFAULT 0 NOT NULL,
	"active_ms" double precision DEFAULT 0 NOT NULL,
	"objectives" integer DEFAULT 0 NOT NULL,
	"support" integer DEFAULT 0 NOT NULL,
	"tier" smallint,
	"paid" boolean DEFAULT false NOT NULL,
	CONSTRAINT "raid_participants_raid_id_phase_character_id_pk" PRIMARY KEY("raid_id","phase","character_id")
);
--> statement-breakpoint
CREATE TABLE "raid_phases" (
	"raid_id" text NOT NULL,
	"phase" smallint NOT NULL,
	"max_hp" double precision NOT NULL,
	"calibration" jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "raid_phases_raid_id_phase_pk" PRIMARY KEY("raid_id","phase")
);
--> statement-breakpoint
CREATE TABLE "raids" (
	"id" text PRIMARY KEY NOT NULL,
	"page" integer NOT NULL,
	"boss_id" text NOT NULL,
	"phase" smallint NOT NULL,
	"hp" double precision NOT NULL,
	"max_hp" double precision NOT NULL,
	"shield" double precision NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"phase_started_at" timestamp with time zone NOT NULL,
	"freed_at" timestamp with time zone,
	"final_hit_by" uuid,
	"final_hit_name" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "raids_phase_check" CHECK ("raids"."phase" >= 1),
	CONSTRAINT "raids_hp_check" CHECK ("raids"."hp" >= 0 and "raids"."hp" <= "raids"."max_hp"),
	CONSTRAINT "raids_shield_check" CHECK ("raids"."shield" >= 0 and "raids"."shield" <= 1)
);
--> statement-breakpoint
ALTER TABLE "boss_clears" ADD CONSTRAINT "boss_clears_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_participants" ADD CONSTRAINT "raid_participants_raid_id_raids_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_participants" ADD CONSTRAINT "raid_participants_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raid_phases" ADD CONSTRAINT "raid_phases_raid_id_raids_id_fk" FOREIGN KEY ("raid_id") REFERENCES "public"."raids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raids" ADD CONSTRAINT "raids_final_hit_by_characters_id_fk" FOREIGN KEY ("final_hit_by") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "raid_participants_unpaid_idx" ON "raid_participants" USING btree ("raid_id","phase") WHERE not "raid_participants"."paid";
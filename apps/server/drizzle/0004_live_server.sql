CREATE TABLE "conduct_ledger" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "conduct_ledger_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"character_id" uuid NOT NULL,
	"operation_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conduct_ledger_kind_check" CHECK ("conduct_ledger"."kind" in ('demerit', 'merit')),
	CONSTRAINT "conduct_ledger_amount_check" CHECK ("conduct_ledger"."amount" <> 0)
);
--> statement-breakpoint
CREATE TABLE "floor_leaders" (
	"week" integer NOT NULL,
	"character_id" uuid NOT NULL,
	"rank" smallint NOT NULL,
	CONSTRAINT "floor_leaders_week_character_id_pk" PRIMARY KEY("week","character_id")
);
--> statement-breakpoint
CREATE TABLE "help_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poster_id" uuid NOT NULL,
	"poster_level" integer NOT NULL,
	"template" text NOT NULL,
	"slots" jsonb NOT NULL,
	"count" integer NOT NULL,
	"quest_id" text,
	"state" text DEFAULT 'open' NOT NULL,
	"helper_id" uuid,
	"posted_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "help_notices_state_check" CHECK ("help_notices"."state" in ('open', 'taken', 'done', 'cancelled')),
	CONSTRAINT "help_notices_count_check" CHECK ("help_notices"."count" >= 1)
);
--> statement-breakpoint
CREATE TABLE "kill_counts" (
	"character_id" uuid NOT NULL,
	"monster_id" text NOT NULL,
	"kills" bigint NOT NULL,
	CONSTRAINT "kill_counts_character_id_monster_id_pk" PRIMARY KEY("character_id","monster_id"),
	CONSTRAINT "kill_counts_check" CHECK ("kill_counts"."kills" >= 0)
);
--> statement-breakpoint
CREATE TABLE "notebook" (
	"page" integer PRIMARY KEY NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"sealed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notebook_bosses" (
	"page" integer NOT NULL,
	"boss_id" text NOT NULL,
	"freed_at" timestamp with time zone NOT NULL,
	"final_hit_by" uuid,
	"final_hit_name" text,
	"board_leaders" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "notebook_bosses_page_boss_id_pk" PRIMARY KEY("page","boss_id")
);
--> statement-breakpoint
CREATE TABLE "server_state" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"current_page" integer NOT NULL,
	"page_opened_at" timestamp with time zone NOT NULL,
	"milestone" text NOT NULL,
	"clock_real_ms" double precision NOT NULL,
	"clock_game_ms" double precision NOT NULL,
	"clock_rate" double precision DEFAULT 1 NOT NULL,
	"last_day" integer NOT NULL,
	"last_week" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_state_one_row" CHECK ("server_state"."id" = 1),
	CONSTRAINT "server_state_rate_check" CHECK ("server_state"."clock_rate" > 0)
);
--> statement-breakpoint
CREATE TABLE "weekly_tally" (
	"week" integer NOT NULL,
	"kind" text NOT NULL,
	"character_id" uuid NOT NULL,
	"n" integer NOT NULL,
	CONSTRAINT "weekly_tally_week_kind_character_id_pk" PRIMARY KEY("week","kind","character_id"),
	CONSTRAINT "weekly_tally_kind_check" CHECK ("weekly_tally"."kind" in ('merit', 'meal'))
);
--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "pool_stopped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "hunt_rates" jsonb;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "home_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "penalty_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "drowsy" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "meal_id" text;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "meal_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "titles" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "patrol_catches" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "expulsions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "board_streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "board_streak_day" integer;--> statement-breakpoint
ALTER TABLE "conduct_ledger" ADD CONSTRAINT "conduct_ledger_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floor_leaders" ADD CONSTRAINT "floor_leaders_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_notices" ADD CONSTRAINT "help_notices_poster_id_characters_id_fk" FOREIGN KEY ("poster_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_notices" ADD CONSTRAINT "help_notices_helper_id_characters_id_fk" FOREIGN KEY ("helper_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kill_counts" ADD CONSTRAINT "kill_counts_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebook_bosses" ADD CONSTRAINT "notebook_bosses_page_notebook_page_fk" FOREIGN KEY ("page") REFERENCES "public"."notebook"("page") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notebook_bosses" ADD CONSTRAINT "notebook_bosses_final_hit_by_characters_id_fk" FOREIGN KEY ("final_hit_by") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_tally" ADD CONSTRAINT "weekly_tally_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conduct_ledger_character_idx" ON "conduct_ledger" USING btree ("character_id","kind");--> statement-breakpoint
CREATE INDEX "help_notices_open_idx" ON "help_notices" USING btree ("state","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "help_notices_poster_key" ON "help_notices" USING btree ("poster_id") WHERE "help_notices"."state" in ('open', 'taken');--> statement-breakpoint
CREATE UNIQUE INDEX "help_notices_helper_key" ON "help_notices" USING btree ("helper_id") WHERE "help_notices"."state" = 'taken';--> statement-breakpoint
CREATE INDEX "weekly_tally_rank_idx" ON "weekly_tally" USING btree ("week","kind","n");
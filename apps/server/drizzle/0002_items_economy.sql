CREATE TABLE "codex_unlocks" (
	"character_id" uuid NOT NULL,
	"entry_id" text NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "codex_unlocks_character_id_entry_id_pk" PRIMARY KEY("character_id","entry_id")
);
--> statement-breakpoint
CREATE TABLE "economy_ledger" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "economy_ledger_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"day" date DEFAULT (now() at time zone 'Asia/Seoul')::date NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"character_id" uuid NOT NULL,
	"operation_id" text NOT NULL,
	"currency" text NOT NULL,
	"source_or_sink" text NOT NULL,
	"amount" numeric(40, 0) NOT NULL,
	"item_id" uuid,
	CONSTRAINT "economy_ledger_amount_check" CHECK ("economy_ledger"."amount" <> 0),
	CONSTRAINT "economy_ledger_item_check" CHECK (("economy_ledger"."item_id" is null) = ("economy_ledger"."currency" not like 'item:%') and ("economy_ledger"."item_id" is null or "economy_ledger"."amount" in (1, -1)))
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"def_id" text NOT NULL,
	"kind" text NOT NULL,
	"grade" smallint DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"exp" double precision DEFAULT 0 NOT NULL,
	"pilgi" integer DEFAULT 0 NOT NULL,
	"pilgi_fail_streak" integer DEFAULT 0 NOT NULL,
	"affixes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evolved" boolean DEFAULT false NOT NULL,
	"bound" boolean DEFAULT false NOT NULL,
	"tradable_at" timestamp with time zone,
	"slot" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_kind_check" CHECK ("items"."kind" in ('book', 'tool')),
	CONSTRAINT "items_grade_check" CHECK ("items"."grade" between 0 and 4),
	CONSTRAINT "items_level_check" CHECK ("items"."level" >= 1),
	CONSTRAINT "items_exp_check" CHECK ("items"."exp" >= 0 and "items"."exp" < 'Infinity'),
	CONSTRAINT "items_pilgi_check" CHECK ("items"."pilgi" >= 0 and "items"."pilgi_fail_streak" >= 0),
	CONSTRAINT "items_tool_check" CHECK ("items"."kind" = 'book' or ("items"."level" <= 5 and "items"."grade" = 0 and "items"."pilgi" = 0 and "items"."pilgi_fail_streak" = 0 and not "items"."evolved")),
	CONSTRAINT "items_affixes_check" CHECK (jsonb_typeof("items"."affixes") = 'array' and jsonb_array_length("items"."affixes") <= 3),
	CONSTRAINT "items_slot_check" CHECK ("items"."slot" between 0 and 5)
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"character_id" uuid NOT NULL,
	"def_id" text NOT NULL,
	"qty" bigint NOT NULL,
	CONSTRAINT "materials_character_id_def_id_pk" PRIMARY KEY("character_id","def_id"),
	CONSTRAINT "materials_qty_check" CHECK ("materials"."qty" between 0 and 9007199254740991),
	CONSTRAINT "materials_def_check" CHECK ("materials"."def_id" ~ '^(ink|binding|(sheet|snack):[a-z0-9-]{1,40})$')
);
--> statement-breakpoint
CREATE TABLE "operations" (
	"character_id" uuid NOT NULL,
	"op_id" text NOT NULL,
	"name" text NOT NULL,
	"request_hash" text NOT NULL,
	"ok" boolean NOT NULL,
	"result" jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operations_character_id_op_id_pk" PRIMARY KEY("character_id","op_id")
);
--> statement-breakpoint
CREATE TABLE "quest_progress" (
	"character_id" uuid NOT NULL,
	"quest_id" text NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"target" integer NOT NULL,
	"offer" jsonb NOT NULL,
	"reset_at" timestamp with time zone,
	CONSTRAINT "quest_progress_character_id_quest_id_pk" PRIMARY KEY("character_id","quest_id"),
	CONSTRAINT "quest_progress_state_check" CHECK ("quest_progress"."state" in ('active', 'done', 'claimed')),
	CONSTRAINT "quest_progress_count_check" CHECK ("quest_progress"."target" >= 1 and "quest_progress"."progress" >= 0 and ("quest_progress"."state" = 'active' or "quest_progress"."progress" >= "quest_progress"."target"))
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"pinecones" numeric(40, 0) DEFAULT '0' NOT NULL,
	"merit_points" numeric(40, 0) DEFAULT '0' NOT NULL,
	"tokens" numeric(40, 0) DEFAULT '0' NOT NULL,
	CONSTRAINT "wallets_nonnegative_check" CHECK ("wallets"."pinecones" >= 0 and "wallets"."merit_points" >= 0 and "wallets"."tokens" >= 0)
);
--> statement-breakpoint
ALTER TABLE "characters" DROP CONSTRAINT "characters_tier_check";--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "minor" text;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "stat_understanding" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "stat_memory" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "stat_focus" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "stat_vitality" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "stat_agility" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "stat_luck" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "demerits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "merits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "pool_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "pool_rates" jsonb;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "pool_place" text;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "pool_sheet_book" text;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "rested_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "rev" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "codex_unlocks" ADD CONSTRAINT "codex_unlocks_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_ledger" ADD CONSTRAINT "economy_ledger_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_owner_id_characters_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_progress" ADD CONSTRAINT "quest_progress_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "economy_ledger_day_idx" ON "economy_ledger" USING btree ("day","currency","source_or_sink");--> statement-breakpoint
CREATE INDEX "economy_ledger_character_idx" ON "economy_ledger" USING btree ("character_id","currency");--> statement-breakpoint
CREATE INDEX "economy_ledger_item_idx" ON "economy_ledger" USING btree ("item_id") WHERE "economy_ledger"."item_id" is not null;--> statement-breakpoint
CREATE INDEX "items_owner_idx" ON "items" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "items_slot_key" ON "items" USING btree ("owner_id","kind","slot") WHERE "items"."slot" is not null;--> statement-breakpoint
CREATE INDEX "operations_at_idx" ON "operations" USING btree ("at");--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_minor_check" CHECK ("characters"."minor" is null or ("characters"."minor" in ('math', 'physics', 'chemistry', 'biology', 'earth') and "characters"."minor" <> "characters"."major"));--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_level_check" CHECK ("characters"."level" >= 1);--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_exp_check" CHECK ("characters"."exp" >= 0 and "characters"."exp" < 'Infinity');--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_stats_check" CHECK (least("characters"."stat_understanding", "characters"."stat_memory", "characters"."stat_focus", "characters"."stat_vitality", "characters"."stat_agility", "characters"."stat_luck") >= 0 and "characters"."stat_understanding"::bigint + "characters"."stat_memory" + "characters"."stat_focus" + "characters"."stat_vitality" + "characters"."stat_agility" + "characters"."stat_luck" <= 3 * "characters"."level"::bigint);--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_rules_check" CHECK ("characters"."demerits" >= 0 and "characters"."merits" >= 0);--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_pool_check" CHECK ("characters"."pool_started_at" is null or ("characters"."pool_rates" is not null and "characters"."pool_place" in ('field', 'hub', 'study-hall', 'dorm')));--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_rev_check" CHECK ("characters"."rev" >= 0);--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_tier_check" CHECK ("characters"."tier" between 0 and 5);--> statement-breakpoint
-- Daily totals by source and sink per currency (PLAN §13), on the Korean calendar day.
CREATE VIEW "economy_daily" AS
SELECT "day", "currency", "source_or_sink", sum("amount") AS "amount", count(*) AS "entries"
FROM "economy_ledger"
GROUP BY "day", "currency", "source_or_sink";

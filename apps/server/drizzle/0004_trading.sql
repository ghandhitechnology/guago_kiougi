CREATE TABLE "economy_daily_totals" (
	"day" date NOT NULL,
	"currency" text NOT NULL,
	"source_or_sink" text NOT NULL,
	"amount" numeric(40, 0) NOT NULL,
	"entries" bigint NOT NULL,
	CONSTRAINT "economy_daily_totals_day_currency_source_or_sink_pk" PRIMARY KEY("day","currency","source_or_sink")
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"state" text DEFAULT 'live' NOT NULL,
	"category" text NOT NULL,
	"def_id" text NOT NULL,
	"grade" smallint DEFAULT 0 NOT NULL,
	"item_id" uuid,
	"item" jsonb,
	"qty" bigint NOT NULL,
	"listed_qty" bigint NOT NULL,
	"unit_price" numeric(40, 0) NOT NULL,
	"fee" numeric(40, 0) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "listings_state_check" CHECK ("listings"."state" in ('live', 'sold', 'cancelled', 'expired')),
	CONSTRAINT "listings_qty_check" CHECK ("listings"."listed_qty" >= 1 and "listings"."qty" between 0 and "listings"."listed_qty" and ("listings"."state" = 'live') = ("listings"."qty" > 0)),
	CONSTRAINT "listings_item_check" CHECK (("listings"."item_id" is null) = ("listings"."item" is null) and ("listings"."item_id" is null or "listings"."listed_qty" = 1)),
	CONSTRAINT "listings_price_check" CHECK ("listings"."unit_price" > 0 and "listings"."fee" >= 0),
	CONSTRAINT "listings_closed_check" CHECK (("listings"."state" = 'live') = ("listings"."closed_at" is null))
);
--> statement-breakpoint
CREATE TABLE "trade_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "trade_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"kind" text NOT NULL,
	"op_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"from_id" uuid NOT NULL,
	"to_id" uuid NOT NULL,
	"item_ids" uuid[] NOT NULL,
	"defs" text[] NOT NULL,
	"tax" numeric(40, 0) NOT NULL,
	"payload" jsonb NOT NULL,
	"listing_id" uuid,
	"def_id" text,
	"grade" smallint,
	"qty" bigint,
	"unit_price" numeric(40, 0),
	CONSTRAINT "trade_log_kind_check" CHECK ("trade_log"."kind" in ('board', 'direct')),
	CONSTRAINT "trade_log_board_check" CHECK (("trade_log"."kind" = 'board') = ("trade_log"."listing_id" is not null and "trade_log"."def_id" is not null and "trade_log"."grade" is not null and "trade_log"."qty" > 0 and "trade_log"."unit_price" > 0))
);
--> statement-breakpoint
ALTER TABLE "economy_ledger" ADD COLUMN "coalesced" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "economy_ledger" ADD COLUMN "entries" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "listing_id" uuid;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_seller_id_characters_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listings_seller_idx" ON "listings" USING btree ("seller_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "listings_item_key" ON "listings" USING btree ("item_id") WHERE "listings"."state" = 'live';--> statement-breakpoint
CREATE INDEX "listings_category_idx" ON "listings" USING btree ("category","unit_price","id") WHERE "listings"."state" = 'live';--> statement-breakpoint
CREATE INDEX "listings_def_idx" ON "listings" USING btree ("def_id","grade","unit_price","id") WHERE "listings"."state" = 'live';--> statement-breakpoint
CREATE INDEX "listings_expiry_idx" ON "listings" USING btree ("expires_at") WHERE "listings"."state" = 'live';--> statement-breakpoint
CREATE INDEX "listings_closed_idx" ON "listings" USING btree ("closed_at") WHERE "listings"."state" <> 'live';--> statement-breakpoint
CREATE UNIQUE INDEX "trade_log_op_key" ON "trade_log" USING btree ("kind","to_id","op_id");--> statement-breakpoint
CREATE INDEX "trade_log_from_idx" ON "trade_log" USING btree ("from_id","at");--> statement-breakpoint
CREATE INDEX "trade_log_to_idx" ON "trade_log" USING btree ("to_id","at");--> statement-breakpoint
CREATE INDEX "trade_log_at_idx" ON "trade_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "trade_log_items_idx" ON "trade_log" USING gin ("item_ids");--> statement-breakpoint
CREATE INDEX "trade_log_defs_idx" ON "trade_log" USING gin ("defs");--> statement-breakpoint
CREATE INDEX "trade_log_price_idx" ON "trade_log" USING btree ("def_id","grade","at") WHERE "trade_log"."kind" = 'board';--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "economy_ledger_coalesced_key" ON "economy_ledger" USING btree ("character_id","day","currency","source_or_sink") WHERE "economy_ledger"."coalesced";--> statement-breakpoint
CREATE INDEX "items_listing_idx" ON "items" USING btree ("listing_id") WHERE "items"."listing_id" is not null;--> statement-breakpoint
ALTER TABLE "economy_ledger" ADD CONSTRAINT "economy_ledger_coalesced_check" CHECK ("economy_ledger"."entries" >= 1 and ("economy_ledger"."coalesced" or "economy_ledger"."entries" = 1) and not ("economy_ledger"."coalesced" and "economy_ledger"."item_id" is not null));--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_listing_check" CHECK ("items"."listing_id" is null or "items"."slot" is null);--> statement-breakpoint
-- Daily totals (PLAN §13): closed days from the roll-up, later days summed live from the ledger.
-- The roll-up fills days in order, so every day up to the last rolled one is in the table.
DROP VIEW "economy_daily";--> statement-breakpoint
CREATE VIEW "economy_daily" AS
SELECT "day", "currency", "source_or_sink", "amount", "entries"
FROM "economy_daily_totals"
UNION ALL
SELECT "day", "currency", "source_or_sink", sum("amount") AS "amount", sum("entries")::bigint AS "entries"
FROM "economy_ledger"
WHERE "day" > coalesce((SELECT max("day") FROM "economy_daily_totals"), '-infinity'::date)
GROUP BY "day", "currency", "source_or_sink";

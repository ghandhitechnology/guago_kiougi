CREATE TABLE "trade_pairs" (
	"day" date NOT NULL,
	"a" uuid NOT NULL,
	"b" uuid NOT NULL,
	"kind" text NOT NULL,
	"trades" integer NOT NULL,
	"a_sent" numeric(40, 0) NOT NULL,
	"b_sent" numeric(40, 0) NOT NULL,
	"items" integer NOT NULL,
	"tax" numeric(40, 0) NOT NULL,
	CONSTRAINT "trade_pairs_day_a_b_kind_pk" PRIMARY KEY("day","a","b","kind"),
	CONSTRAINT "trade_pairs_order_check" CHECK ("trade_pairs"."a" < "trade_pairs"."b")
);
--> statement-breakpoint
ALTER TABLE "economy_ledger" DROP CONSTRAINT "economy_ledger_amount_check";--> statement-breakpoint
ALTER TABLE "trade_log" ADD COLUMN "recorded_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "trade_pairs_a_idx" ON "trade_pairs" USING btree ("a","day");--> statement-breakpoint
CREATE INDEX "trade_pairs_b_idx" ON "trade_pairs" USING btree ("b","day");--> statement-breakpoint
CREATE INDEX "listings_price_idx" ON "listings" USING btree ("unit_price","id") WHERE "listings"."state" = 'live';--> statement-breakpoint
CREATE INDEX "trade_log_recorded_idx" ON "trade_log" USING btree ("recorded_at");--> statement-breakpoint
ALTER TABLE "economy_ledger" ADD CONSTRAINT "economy_ledger_amount_check" CHECK ("economy_ledger"."amount" <> 0 or "economy_ledger"."coalesced");
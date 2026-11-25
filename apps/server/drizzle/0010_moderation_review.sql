DROP INDEX "account_ips_ip_idx";--> statement-breakpoint
ALTER TABLE "account_bans" ADD COLUMN "told" text;--> statement-breakpoint
ALTER TABLE "account_bans" ADD COLUMN "ip_scope" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_actions" ADD COLUMN "ip_hash" text;--> statement-breakpoint
ALTER TABLE "filter_strikes" ADD COLUMN "demerit_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mutes" ADD COLUMN "told" text;--> statement-breakpoint
CREATE INDEX "account_ips_seen_idx" ON "account_ips" USING btree ("last_seen");--> statement-breakpoint
CREATE INDEX "filter_strikes_pending_idx" ON "filter_strikes" USING btree ("at") WHERE "filter_strikes"."demerit_at" is null;--> statement-breakpoint
CREATE INDEX "account_ips_ip_idx" ON "account_ips" USING btree ("ip_hash","last_seen");--> statement-breakpoint
-- Rows from before: an IP ban refused everything from its addresses; a strike's 벌점 was sent
-- when it was made (under an older operation id, so retrying it would count it twice); the
-- player was told the reason.
UPDATE "account_bans" SET "ip_scope" = 'all' WHERE cardinality("ip_hashes") > 0;--> statement-breakpoint
UPDATE "account_bans" SET "told" = "reason";--> statement-breakpoint
UPDATE "mutes" SET "told" = "reason";--> statement-breakpoint
UPDATE "filter_strikes" SET "demerit_at" = "at";--> statement-breakpoint
ALTER TABLE "account_bans" ADD CONSTRAINT "account_bans_ip_scope_check" CHECK ("account_bans"."ip_scope" in ('none', 'signup', 'all') and ("account_bans"."ip_scope" = 'none') = (cardinality("account_bans"."ip_hashes") = 0));
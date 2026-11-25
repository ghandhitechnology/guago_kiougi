CREATE TABLE "chat_log" (
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "chat_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"channel" text NOT NULL,
	"sender_id" uuid,
	"target" text,
	"body" text NOT NULL,
	"masked" boolean NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "chat_log_id_at_pk" PRIMARY KEY("id","at")
) PARTITION BY RANGE ("at");
--> statement-breakpoint
CREATE INDEX "chat_log_sender_idx" ON "chat_log" USING btree ("sender_id","at");--> statement-breakpoint
-- Day partitions in UTC, named chat_log_YYYYMMDD. Creates today through `ahead_days` ahead and
-- drops every partition whose day is more than `keep_days` before today. Idempotent; the server
-- runs it at start and every hour. `today` is a parameter so retention can be exercised.
CREATE FUNCTION "chat_log_maintain"(
	"keep_days" integer,
	"ahead_days" integer,
	"today" date DEFAULT (now() AT TIME ZONE 'UTC')::date
) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
	"day" date;
	"part" record;
	"dropped" integer := 0;
BEGIN
	FOR "i" IN 0.."ahead_days" LOOP
		"day" := "today" + "i";
		CONTINUE WHEN to_regclass('chat_log_' || to_char("day", 'YYYYMMDD')) IS NOT NULL;
		EXECUTE format(
			'CREATE TABLE %I PARTITION OF "chat_log" FOR VALUES FROM (%L) TO (%L)',
			'chat_log_' || to_char("day", 'YYYYMMDD'),
			"day"::timestamp AT TIME ZONE 'UTC',
			("day" + 1)::timestamp AT TIME ZONE 'UTC'
		);
	END LOOP;
	FOR "part" IN
		SELECT c.oid::regclass AS "name"
		FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
		WHERE i.inhparent = '"chat_log"'::regclass
			AND c.relname ~ '^chat_log_[0-9]{8}$'
			AND to_date(substring(c.relname FROM 10), 'YYYYMMDD') < "today" - "keep_days"
	LOOP
		EXECUTE format('DROP TABLE %s', "part"."name");
		"dropped" := "dropped" + 1;
	END LOOP;
	RETURN "dropped";
END;
$$;
--> statement-breakpoint
SELECT "chat_log_maintain"(90, 3);

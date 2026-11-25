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
-- Day partitions in UTC, named chat_log_YYYYMMDD: creates today through `ahead_days` ahead when
-- missing. The server runs it hourly with a short lock timeout and drops old partitions itself
-- (DETACH ... CONCURRENTLY cannot run inside a function).
CREATE FUNCTION "chat_log_add_partitions"(
	"ahead_days" integer,
	"today" date DEFAULT (now() AT TIME ZONE 'UTC')::date
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
	"day" date;
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
END;
$$;
--> statement-breakpoint
SELECT "chat_log_add_partitions"(3);

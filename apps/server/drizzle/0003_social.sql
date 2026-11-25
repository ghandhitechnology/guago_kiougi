CREATE TABLE "blocks" (
	"character_id" uuid NOT NULL,
	"other_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_character_id_other_id_pk" PRIMARY KEY("character_id","other_id"),
	CONSTRAINT "blocks_self_check" CHECK ("blocks"."character_id" <> "blocks"."other_id")
);
--> statement-breakpoint
CREATE TABLE "board_posts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "board_posts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"author_id" uuid NOT NULL,
	"category" text NOT NULL,
	"body" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "board_posts_category_check" CHECK ("board_posts"."category" in ('party', 'trade', 'club', 'chat', 'notice')),
	CONSTRAINT "board_posts_pinned_check" CHECK ("board_posts"."pinned" = ("board_posts"."category" = 'notice'))
);
--> statement-breakpoint
CREATE TABLE "club_applications" (
	"club_id" integer NOT NULL,
	"character_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_applications_club_id_character_id_pk" PRIMARY KEY("club_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "club_invites" (
	"club_id" integer NOT NULL,
	"character_id" uuid NOT NULL,
	"invited_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "club_invites_club_id_character_id_pk" PRIMARY KEY("club_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "club_members" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"club_id" integer NOT NULL,
	"rank" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_members_rank_check" CHECK ("club_members"."rank" in ('vice', 'member'))
);
--> statement-breakpoint
CREATE TABLE "club_notices" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "club_notices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"club_id" integer NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "clubs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"leader_id" uuid,
	"join_rule" text NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"exp" double precision DEFAULT 0 NOT NULL,
	"jacket_color" text NOT NULL,
	"emblem" jsonb NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"application_count" integer DEFAULT 0 NOT NULL,
	"invite_count" integer DEFAULT 0 NOT NULL,
	"notice_count" integer DEFAULT 0 NOT NULL,
	"founded_by" uuid NOT NULL,
	"founded_op" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disbanded_at" timestamp with time zone,
	CONSTRAINT "clubs_join_rule_check" CHECK ("clubs"."join_rule" in ('open', 'apply', 'invite')),
	CONSTRAINT "clubs_level_check" CHECK ("clubs"."level" between 1 and 10 and "clubs"."exp" >= 0),
	CONSTRAINT "clubs_leader_check" CHECK (("clubs"."leader_id" is null) = ("clubs"."disbanded_at" is not null)),
	CONSTRAINT "clubs_member_count_check" CHECK ("clubs"."member_count" between 0 and 30),
	CONSTRAINT "clubs_application_count_check" CHECK ("clubs"."application_count" between 0 and 30),
	CONSTRAINT "clubs_invite_count_check" CHECK ("clubs"."invite_count" between 0 and 20),
	CONSTRAINT "clubs_notice_count_check" CHECK ("clubs"."notice_count" between 0 and 5)
);
--> statement-breakpoint
CREATE TABLE "friend_requests" (
	"from_id" uuid NOT NULL,
	"to_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friend_requests_from_id_to_id_pk" PRIMARY KEY("from_id","to_id"),
	CONSTRAINT "friend_requests_self_check" CHECK ("friend_requests"."from_id" <> "friend_requests"."to_id")
);
--> statement-breakpoint
CREATE TABLE "friends" (
	"character_id" uuid NOT NULL,
	"other_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friends_character_id_other_id_pk" PRIMARY KEY("character_id","other_id"),
	CONSTRAINT "friends_self_check" CHECK ("friends"."character_id" <> "friends"."other_id")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"reporter_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"category" text NOT NULL,
	"note" text,
	"context" jsonb NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"handled_by" uuid,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_category_check" CHECK ("reports"."category" in ('abuse', 'sexual', 'spam', 'cheat', 'trade', 'name', 'other')),
	CONSTRAINT "reports_state_check" CHECK ("reports"."state" in ('open', 'resolved', 'dismissed'))
);
--> statement-breakpoint
CREATE TABLE "social_counts" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"friends" integer DEFAULT 0 NOT NULL,
	"requests_out" integer DEFAULT 0 NOT NULL,
	"requests_in" integer DEFAULT 0 NOT NULL,
	"blocks" integer DEFAULT 0 NOT NULL,
	"applied" integer DEFAULT 0 NOT NULL,
	"club_invites" integer DEFAULT 0 NOT NULL,
	"open_reports" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "social_counts_friends_check" CHECK ("social_counts"."friends" between 0 and 100),
	CONSTRAINT "social_counts_requests_out_check" CHECK ("social_counts"."requests_out" between 0 and 20),
	CONSTRAINT "social_counts_requests_in_check" CHECK ("social_counts"."requests_in" between 0 and 50),
	CONSTRAINT "social_counts_blocks_check" CHECK ("social_counts"."blocks" between 0 and 200),
	CONSTRAINT "social_counts_applied_check" CHECK ("social_counts"."applied" between 0 and 3),
	CONSTRAINT "social_counts_club_invites_check" CHECK ("social_counts"."club_invites" between 0 and 10),
	CONSTRAINT "social_counts_open_reports_check" CHECK ("social_counts"."open_reports" between 0 and 20)
);
--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_other_id_characters_id_fk" FOREIGN KEY ("other_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_posts" ADD CONSTRAINT "board_posts_author_id_characters_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_applications" ADD CONSTRAINT "club_applications_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_applications" ADD CONSTRAINT "club_applications_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_invites" ADD CONSTRAINT "club_invites_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_invites" ADD CONSTRAINT "club_invites_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_invites" ADD CONSTRAINT "club_invites_invited_by_characters_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_notices" ADD CONSTRAINT "club_notices_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_notices" ADD CONSTRAINT "club_notices_author_id_characters_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_from_id_characters_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_to_id_characters_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friends" ADD CONSTRAINT "friends_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friends" ADD CONSTRAINT "friends_other_id_characters_id_fk" FOREIGN KEY ("other_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_counts" ADD CONSTRAINT "social_counts_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blocks_other_idx" ON "blocks" USING btree ("other_id");--> statement-breakpoint
CREATE UNIQUE INDEX "board_posts_author_key" ON "board_posts" USING btree ("author_id","category");--> statement-breakpoint
CREATE INDEX "board_posts_list_idx" ON "board_posts" USING btree ("category","id");--> statement-breakpoint
CREATE INDEX "board_posts_expiry_idx" ON "board_posts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "club_applications_character_idx" ON "club_applications" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "club_invites_character_idx" ON "club_invites" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "club_invites_expiry_idx" ON "club_invites" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "club_members_club_key" ON "club_members" USING btree ("club_id","character_id");--> statement-breakpoint
CREATE INDEX "club_notices_club_idx" ON "club_notices" USING btree ("club_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "clubs_name_key" ON "clubs" USING btree (lower("name")) WHERE "clubs"."disbanded_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "clubs_founded_key" ON "clubs" USING btree ("founded_by","founded_op");--> statement-breakpoint
CREATE INDEX "friend_requests_to_idx" ON "friend_requests" USING btree ("to_id","created_at");--> statement-breakpoint
CREATE INDEX "friend_requests_created_idx" ON "friend_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "friends_other_idx" ON "friends" USING btree ("other_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_open_key" ON "reports" USING btree ("reporter_id","target_id","category") WHERE "reports"."state" = 'open';--> statement-breakpoint
CREATE INDEX "reports_queue_idx" ON "reports" USING btree ("state","created_at");--> statement-breakpoint
CREATE INDEX "reports_target_idx" ON "reports" USING btree ("target_id","created_at");--> statement-breakpoint
-- The 짱 is always a member of the club: checked at commit, so founding (club row, then the
-- member row) and handing over fit in one transaction. A disbanded club has no leader.
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_leader_member_fk" FOREIGN KEY ("id","leader_id") REFERENCES "public"."club_members"("club_id","character_id") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
-- Counters behind every capped list. A row added counts up and a row removed counts down; the
-- CHECK constraints on `social_counts` and `clubs` refuse a count past its cap. Counting up is
-- an upsert that locks the counter row, so racing inserts take turns and the second sees the
-- first's count. Counting down only updates, so a character being deleted (its counter row
-- going with it) never makes a new one.
CREATE FUNCTION "social_count"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	"who" uuid;
BEGIN
	IF TG_OP = 'INSERT' THEN
		"who" := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
		EXECUTE format(
			'INSERT INTO "social_counts" ("character_id", %1$I) VALUES ($1, 1)
			 ON CONFLICT ("character_id") DO UPDATE SET %1$I = "social_counts".%1$I + 1',
			TG_ARGV[1]) USING "who";
	ELSE
		"who" := (to_jsonb(OLD) ->> TG_ARGV[0])::uuid;
		EXECUTE format(
			'UPDATE "social_counts" SET %1$I = %1$I - 1 WHERE "character_id" = $1',
			TG_ARGV[1]) USING "who";
	END IF;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION "club_count"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	"row" jsonb;
	"delta" integer;
BEGIN
	IF TG_OP = 'INSERT' THEN
		"row" := to_jsonb(NEW);
		"delta" := 1;
	ELSE
		"row" := to_jsonb(OLD);
		"delta" := -1;
	END IF;
	EXECUTE format('UPDATE "clubs" SET %1$I = %1$I + $2 WHERE "id" = $1', TG_ARGV[0])
		USING ("row" ->> 'club_id')::integer, "delta";
	RETURN NULL;
END;
$$;
--> statement-breakpoint
-- Open reports per reporter: a report counts while its state is `open`.
CREATE FUNCTION "report_count"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP IN ('UPDATE', 'DELETE') AND OLD."state" = 'open' THEN
		UPDATE "social_counts" SET "open_reports" = "open_reports" - 1
		WHERE "character_id" = OLD."reporter_id";
	END IF;
	IF TG_OP IN ('INSERT', 'UPDATE') AND NEW."state" = 'open' THEN
		INSERT INTO "social_counts" ("character_id", "open_reports") VALUES (NEW."reporter_id", 1)
		ON CONFLICT ("character_id") DO UPDATE SET "open_reports" = "social_counts"."open_reports" + 1;
	END IF;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "friends_count" AFTER INSERT OR DELETE ON "friends"
	FOR EACH ROW EXECUTE FUNCTION "social_count"('character_id', 'friends');--> statement-breakpoint
CREATE TRIGGER "friend_requests_out_count" AFTER INSERT OR DELETE ON "friend_requests"
	FOR EACH ROW EXECUTE FUNCTION "social_count"('from_id', 'requests_out');--> statement-breakpoint
CREATE TRIGGER "friend_requests_in_count" AFTER INSERT OR DELETE ON "friend_requests"
	FOR EACH ROW EXECUTE FUNCTION "social_count"('to_id', 'requests_in');--> statement-breakpoint
CREATE TRIGGER "blocks_count" AFTER INSERT OR DELETE ON "blocks"
	FOR EACH ROW EXECUTE FUNCTION "social_count"('character_id', 'blocks');--> statement-breakpoint
CREATE TRIGGER "club_applications_applied_count" AFTER INSERT OR DELETE ON "club_applications"
	FOR EACH ROW EXECUTE FUNCTION "social_count"('character_id', 'applied');--> statement-breakpoint
CREATE TRIGGER "club_invites_held_count" AFTER INSERT OR DELETE ON "club_invites"
	FOR EACH ROW EXECUTE FUNCTION "social_count"('character_id', 'club_invites');--> statement-breakpoint
CREATE TRIGGER "club_members_count" AFTER INSERT OR DELETE ON "club_members"
	FOR EACH ROW EXECUTE FUNCTION "club_count"('member_count');--> statement-breakpoint
CREATE TRIGGER "club_applications_count" AFTER INSERT OR DELETE ON "club_applications"
	FOR EACH ROW EXECUTE FUNCTION "club_count"('application_count');--> statement-breakpoint
CREATE TRIGGER "club_invites_count" AFTER INSERT OR DELETE ON "club_invites"
	FOR EACH ROW EXECUTE FUNCTION "club_count"('invite_count');--> statement-breakpoint
CREATE TRIGGER "club_notices_count" AFTER INSERT OR DELETE ON "club_notices"
	FOR EACH ROW EXECUTE FUNCTION "club_count"('notice_count');--> statement-breakpoint
CREATE TRIGGER "reports_open_count" AFTER INSERT OR UPDATE OF "state" OR DELETE ON "reports"
	FOR EACH ROW EXECUTE FUNCTION "report_count"();

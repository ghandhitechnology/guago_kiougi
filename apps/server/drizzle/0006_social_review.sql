-- A request from a player its receiver blocked is kept, so the sender sees it waiting like any
-- unanswered one, but it is hidden and no longer counts toward the receiver's inbox cap: a
-- blocked player cannot fill an inbox the receiver has no way to clear. A request counts while
-- no block stands from its receiver to its sender, checked when the row comes and when it goes;
-- the block trigger below drops the requests a block's arrival or removal would re-classify, so
-- every row is uncounted exactly as it was counted.
CREATE FUNCTION "friend_request_in_count"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	"r" "friend_requests";
BEGIN
	IF TG_OP = 'INSERT' THEN
		"r" := NEW;
	ELSE
		"r" := OLD;
	END IF;
	IF EXISTS (
		SELECT 1 FROM "blocks" WHERE "character_id" = "r"."to_id" AND "other_id" = "r"."from_id"
	) THEN
		RETURN NULL;
	END IF;
	IF TG_OP = 'INSERT' THEN
		INSERT INTO "social_counts" ("character_id", "requests_in") VALUES ("r"."to_id", 1)
		ON CONFLICT ("character_id") DO UPDATE SET "requests_in" = "social_counts"."requests_in" + 1;
	ELSE
		UPDATE "social_counts" SET "requests_in" = "requests_in" - 1
		WHERE "character_id" = "r"."to_id";
	END IF;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
DROP TRIGGER "friend_requests_in_count" ON "friend_requests";--> statement-breakpoint
CREATE TRIGGER "friend_requests_in_count" AFTER INSERT OR DELETE ON "friend_requests"
	FOR EACH ROW EXECUTE FUNCTION "friend_request_in_count"();--> statement-breakpoint
-- Before a block row arrives, every request between the two players goes (still counted as it
-- was); before one leaves, the requests it hid go (still uncounted). A hidden request therefore
-- never turns visible later, and the blocked player sees it disappear like a declined one.
CREATE FUNCTION "block_drops_requests"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'INSERT' THEN
		DELETE FROM "friend_requests"
		WHERE ("from_id" = NEW."character_id" AND "to_id" = NEW."other_id")
			OR ("from_id" = NEW."other_id" AND "to_id" = NEW."character_id");
		RETURN NEW;
	END IF;
	DELETE FROM "friend_requests" WHERE "from_id" = OLD."other_id" AND "to_id" = OLD."character_id";
	RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "blocks_drop_requests" BEFORE INSERT OR DELETE ON "blocks"
	FOR EACH ROW EXECUTE FUNCTION "block_drops_requests"();--> statement-breakpoint
-- Every inbox counted again under the new rule.
UPDATE "social_counts" "s" SET "requests_in" = (
	SELECT count(*) FROM "friend_requests" "r"
	WHERE "r"."to_id" = "s"."character_id"
		AND NOT EXISTS (
			SELECT 1 FROM "blocks" "b" WHERE "b"."character_id" = "r"."to_id" AND "b"."other_id" = "r"."from_id"
		)
);

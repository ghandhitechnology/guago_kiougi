CREATE TABLE "account_bans" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "account_bans_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"account_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"ip_hashes" text[] DEFAULT '{}'::text[] NOT NULL,
	"admin_id" uuid NOT NULL,
	"lifted_at" timestamp with time zone,
	"lifted_by" uuid,
	"lift_reason" text,
	CONSTRAINT "account_bans_end_check" CHECK ("account_bans"."ends_at" is null or "account_bans"."ends_at" > "account_bans"."starts_at"),
	CONSTRAINT "account_bans_lift_check" CHECK (("account_bans"."lifted_at" is null) = ("account_bans"."lift_reason" is null) and ("account_bans"."lifted_by" is null or "account_bans"."lifted_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "account_ips" (
	"account_id" uuid NOT NULL,
	"ip_hash" text NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_ips_account_id_ip_hash_pk" PRIMARY KEY("account_id","ip_hash")
);
--> statement-breakpoint
CREATE TABLE "admin_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"login_id" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "admin_accounts_login_id_unique" UNIQUE("login_id"),
	CONSTRAINT "admin_accounts_role_check" CHECK ("admin_accounts"."role" in ('moderator', 'owner')),
	CONSTRAINT "admin_accounts_status_check" CHECK ("admin_accounts"."status" in ('active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "admin_actions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_actions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"admin_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"reason" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"op_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_login_failures" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_login_failures_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"login_id" text NOT NULL,
	"ip_hash" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"admin_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"idle_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_sessions_admin_id_unique" UNIQUE("admin_id")
);
--> statement-breakpoint
CREATE TABLE "filter_overrides" (
	"mode" text NOT NULL,
	"text" text NOT NULL,
	"present" boolean NOT NULL,
	"admin_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "filter_overrides_mode_text_pk" PRIMARY KEY("mode","text"),
	CONSTRAINT "filter_overrides_mode_check" CHECK ("filter_overrides"."mode" in ('part', 'word', 'jamo', 'allow'))
);
--> statement-breakpoint
CREATE TABLE "filter_strikes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "filter_strikes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"character_id" uuid NOT NULL,
	"line_id" bigint NOT NULL,
	"line_at" timestamp with time zone NOT NULL,
	"body" text NOT NULL,
	"demerits" integer NOT NULL,
	"admin_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mutes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mutes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"character_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"admin_id" uuid NOT NULL,
	"lifted_at" timestamp with time zone,
	"lifted_by" uuid,
	"lift_reason" text,
	CONSTRAINT "mutes_end_check" CHECK ("mutes"."ends_at" is null or "mutes"."ends_at" > "mutes"."starts_at"),
	CONSTRAINT "mutes_lift_check" CHECK (("mutes"."lifted_at" is null) = ("mutes"."lift_reason" is null) and ("mutes"."lifted_by" is null or "mutes"."lifted_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "report_resolutions" (
	"report_id" bigint PRIMARY KEY NOT NULL,
	"admin_id" uuid NOT NULL,
	"action" text NOT NULL,
	"note" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_resolutions_action_check" CHECK ("report_resolutions"."action" in ('none', 'mute', 'kick', 'ban'))
);
--> statement-breakpoint
ALTER TABLE "account_bans" ADD CONSTRAINT "account_bans_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_bans" ADD CONSTRAINT "account_bans_admin_id_admin_accounts_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_bans" ADD CONSTRAINT "account_bans_lifted_by_admin_accounts_id_fk" FOREIGN KEY ("lifted_by") REFERENCES "public"."admin_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_ips" ADD CONSTRAINT "account_ips_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_admin_id_admin_accounts_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_admin_accounts_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filter_overrides" ADD CONSTRAINT "filter_overrides_admin_id_admin_accounts_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filter_strikes" ADD CONSTRAINT "filter_strikes_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filter_strikes" ADD CONSTRAINT "filter_strikes_admin_id_admin_accounts_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mutes" ADD CONSTRAINT "mutes_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mutes" ADD CONSTRAINT "mutes_admin_id_admin_accounts_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mutes" ADD CONSTRAINT "mutes_lifted_by_admin_accounts_id_fk" FOREIGN KEY ("lifted_by") REFERENCES "public"."admin_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_resolutions" ADD CONSTRAINT "report_resolutions_admin_id_admin_accounts_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_bans_account_idx" ON "account_bans" USING btree ("account_id","starts_at");--> statement-breakpoint
CREATE INDEX "account_bans_ip_idx" ON "account_bans" USING gin ("ip_hashes");--> statement-breakpoint
CREATE INDEX "account_ips_ip_idx" ON "account_ips" USING btree ("ip_hash");--> statement-breakpoint
CREATE INDEX "admin_actions_at_idx" ON "admin_actions" USING btree ("at");--> statement-breakpoint
CREATE INDEX "admin_actions_target_idx" ON "admin_actions" USING btree ("target","at");--> statement-breakpoint
CREATE INDEX "admin_actions_admin_idx" ON "admin_actions" USING btree ("admin_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_actions_op_key" ON "admin_actions" USING btree ("admin_id","op_id") WHERE "admin_actions"."op_id" is not null;--> statement-breakpoint
CREATE INDEX "admin_login_failures_key_idx" ON "admin_login_failures" USING btree ("login_id","ip_hash","at");--> statement-breakpoint
CREATE INDEX "admin_login_failures_ip_idx" ON "admin_login_failures" USING btree ("ip_hash","at");--> statement-breakpoint
CREATE INDEX "admin_sessions_expires_idx" ON "admin_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "filter_strikes_line_key" ON "filter_strikes" USING btree ("line_id","line_at");--> statement-breakpoint
CREATE INDEX "filter_strikes_character_idx" ON "filter_strikes" USING btree ("character_id","at");--> statement-breakpoint
CREATE INDEX "mutes_character_idx" ON "mutes" USING btree ("character_id","starts_at");--> statement-breakpoint
-- The audit log is append-only: no row is ever changed or removed, whatever the code does.
CREATE FUNCTION admin_actions_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'admin_actions is append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER admin_actions_append_only BEFORE UPDATE OR DELETE ON "admin_actions"
	FOR EACH ROW EXECUTE FUNCTION admin_actions_append_only();
--> statement-breakpoint
CREATE TRIGGER admin_actions_no_truncate BEFORE TRUNCATE ON "admin_actions"
	FOR EACH STATEMENT EXECUTE FUNCTION admin_actions_append_only();

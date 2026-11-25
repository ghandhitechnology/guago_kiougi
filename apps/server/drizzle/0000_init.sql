CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"login_id" text NOT NULL,
	"password_hash" text NOT NULL,
	"recovery_code_hash" text,
	"status" text DEFAULT 'active' NOT NULL,
	"age_confirmed" boolean NOT NULL,
	"signup_ip_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "accounts_login_id_unique" UNIQUE("login_id"),
	CONSTRAINT "accounts_status_check" CHECK ("accounts"."status" in ('active', 'banned'))
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"major" text NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"exp" double precision DEFAULT 0 NOT NULL,
	"look" jsonb NOT NULL,
	"map_id" text NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"control_mode" text DEFAULT 'semi' NOT NULL,
	"tier" smallint DEFAULT 0 NOT NULL,
	"cohort" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "characters_account_id_unique" UNIQUE("account_id"),
	CONSTRAINT "characters_major_check" CHECK ("characters"."major" in ('math', 'physics', 'chemistry', 'biology', 'earth')),
	CONSTRAINT "characters_control_mode_check" CHECK ("characters"."control_mode" in ('auto', 'semi', 'skill', 'manual')),
	CONSTRAINT "characters_tier_check" CHECK ("characters"."tier" between 0 and 4)
);
--> statement-breakpoint
CREATE TABLE "login_failures" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "login_failures_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"login_id" text NOT NULL,
	"ip_hash" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_signup_ip_idx" ON "accounts" USING btree ("signup_ip_hash","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "characters_name_key" ON "characters" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "login_failures_key_idx" ON "login_failures" USING btree ("login_id","ip_hash","at");--> statement-breakpoint
CREATE INDEX "sessions_account_idx" ON "sessions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");
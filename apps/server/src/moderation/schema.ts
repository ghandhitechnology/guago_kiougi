/**
 * Tables for moderation and the admin tool (PLAN §12 "Moderation", §20 `admin_actions`, §22
 * "Admin: separate login"). Kept apart from `db/schema.ts`; `drizzle.config.ts` reads both.
 *
 * Admins are their own accounts, never a flag on a player account. `admin_actions` is append-only:
 * the code has no update or delete path, and a trigger (migration) refuses both.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { accounts, characters } from "../db/schema.ts";

const at = (name: string) => timestamp(name, { withTimezone: true });

export const adminAccounts = pgTable(
  "admin_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stored lower case. */
    loginId: text("login_id").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    /** `moderator` reads and moderates; `owner` also grants items and edits admins. */
    role: text("role").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: at("created_at").notNull().defaultNow(),
    lastLoginAt: at("last_login_at"),
  },
  (t) => [
    check("admin_accounts_role_check", sql`${t.role} in ('moderator', 'owner')`),
    check("admin_accounts_status_check", sql`${t.status} in ('active', 'disabled')`),
  ],
);

/** One live session per admin; a new login replaces it. Expires absolutely and when idle. */
export const adminSessions = pgTable(
  "admin_sessions",
  {
    /** SHA-256 of the cookie token, hex. */
    tokenHash: text("token_hash").primaryKey(),
    adminId: uuid("admin_id")
      .notNull()
      .unique()
      .references(() => adminAccounts.id, { onDelete: "cascade" }),
    expiresAt: at("expires_at").notNull(),
    idleUntil: at("idle_until").notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (t) => [index("admin_sessions_expires_idx").on(t.expiresAt)],
);

/** Failed admin logins, kept for the limit's window. */
export const adminLoginFailures = pgTable(
  "admin_login_failures",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    loginId: text("login_id").notNull(),
    ipHash: text("ip_hash").notNull(),
    at: at("at").notNull().defaultNow(),
  },
  (t) => [
    index("admin_login_failures_key_idx").on(t.loginId, t.ipHash, t.at),
    index("admin_login_failures_ip_idx").on(t.ipHash, t.at),
  ],
);

/**
 * The audit log (PLAN §12, §20): who, what, the target, the reason and when. `op_id` ties an
 * economy operation to its one row, so a retried grant is audited once.
 */
export const adminActions = pgTable(
  "admin_actions",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => adminAccounts.id),
    action: text("action").notNull(),
    /** `account:<id>`, `character:<id>`, `report:<id>`, `filter`, `server`, `admin:<id>`. */
    target: text("target").notNull(),
    reason: text("reason"),
    detail: jsonb("detail").notNull().default({}),
    opId: text("op_id"),
    at: at("at").notNull().defaultNow(),
  },
  (t) => [
    index("admin_actions_at_idx").on(t.at),
    index("admin_actions_target_idx").on(t.target, t.at),
    index("admin_actions_admin_idx").on(t.adminId, t.at),
    uniqueIndex("admin_actions_op_key").on(t.adminId, t.opId).where(sql`${t.opId} is not null`),
  ],
);

const adminRef = (name: string) => uuid(name).references(() => adminAccounts.id);

/**
 * Account bans, history included. A ban is in force while not lifted and before its end;
 * `accounts.status` is set to `banned` in the same transaction and is what every way in checks.
 * `ip_hashes` are the keyed hashes the auth paths already use, never addresses.
 */
export const accountBans = pgTable(
  "account_bans",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    startsAt: at("starts_at").notNull().defaultNow(),
    endsAt: at("ends_at"),
    ipHashes: text("ip_hashes").array().notNull().default(sql`'{}'::text[]`),
    adminId: adminRef("admin_id").notNull(),
    liftedAt: at("lifted_at"),
    liftedBy: adminRef("lifted_by"),
    liftReason: text("lift_reason"),
  },
  (t) => [
    index("account_bans_account_idx").on(t.accountId, t.startsAt),
    index("account_bans_ip_idx").using("gin", t.ipHashes),
    check("account_bans_end_check", sql`${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`),
    check(
      "account_bans_lift_check",
      sql`(${t.liftedAt} is null) = (${t.liftReason} is null) and (${t.liftedBy} is null or ${t.liftedAt} is not null)`,
    ),
  ],
);

/** Admin chat mutes, history included. The filter's own five-minute mutes stay in memory. */
export const mutes = pgTable(
  "mutes",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    startsAt: at("starts_at").notNull().defaultNow(),
    endsAt: at("ends_at"),
    adminId: adminRef("admin_id").notNull(),
    liftedAt: at("lifted_at"),
    liftedBy: adminRef("lifted_by"),
    liftReason: text("lift_reason"),
  },
  (t) => [
    index("mutes_character_idx").on(t.characterId, t.startsAt),
    check("mutes_end_check", sql`${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`),
    check(
      "mutes_lift_check",
      sql`(${t.liftedAt} is null) = (${t.liftReason} is null) and (${t.liftedBy} is null or ${t.liftedAt} is not null)`,
    ),
  ],
);

/** Where each account has signed up or logged in from, as IP hashes, for IP bans. */
export const accountIps = pgTable(
  "account_ips",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    ipHash: text("ip_hash").notNull(),
    firstSeen: at("first_seen").notNull().defaultNow(),
    lastSeen: at("last_seen").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.ipHash] }),
    index("account_ips_ip_idx").on(t.ipHash),
  ],
);

/** A logged chat line an admin confirmed as a filter strike (PLAN §11: +3 벌점). Once per line. */
export const filterStrikes = pgTable(
  "filter_strikes",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    lineId: bigint("line_id", { mode: "number" }).notNull(),
    lineAt: at("line_at").notNull(),
    body: text("body").notNull(),
    demerits: integer("demerits").notNull(),
    adminId: adminRef("admin_id").notNull(),
    at: at("at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("filter_strikes_line_key").on(t.lineId, t.lineAt),
    index("filter_strikes_character_idx").on(t.characterId, t.at),
  ],
);

/**
 * Run-time edits to the word list, over `chat/words.json`: an entry present here with `present`
 * true is added, false is removed. The live list is the file with these applied.
 */
export const filterOverrides = pgTable(
  "filter_overrides",
  {
    mode: text("mode").notNull(),
    text: text("text").notNull(),
    present: boolean("present").notNull(),
    adminId: adminRef("admin_id").notNull(),
    at: at("at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.mode, t.text] }),
    check("filter_overrides_mode_check", sql`${t.mode} in ('part', 'word', 'jamo', 'allow')`),
  ],
);

/** How a report was closed: the action taken and the admin's note. Never shown to players. */
export const reportResolutions = pgTable(
  "report_resolutions",
  {
    reportId: bigint("report_id", { mode: "number" }).primaryKey(),
    adminId: adminRef("admin_id").notNull(),
    action: text("action").notNull(),
    note: text("note"),
    at: at("at").notNull().defaultNow(),
  },
  (t) => [
    check("report_resolutions_action_check", sql`${t.action} in ('none', 'mute', 'kick', 'ban')`),
  ],
);

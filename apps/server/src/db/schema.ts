/** Tables shaped as PLAN §20. Only what the server uses today; later milestones add columns. */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const at = (name: string) => timestamp(name, { withTimezone: true });

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stored lower case. */
    loginId: text("login_id").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    /** Null once the code has been used. */
    recoveryCodeHash: text("recovery_code_hash"),
    status: text("status").notNull().default("active"),
    ageConfirmed: boolean("age_confirmed").notNull(),
    /** HMAC of the signup IP, never the IP itself. */
    signupIpHash: text("signup_ip_hash").notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
    lastLoginAt: at("last_login_at"),
  },
  (t) => [
    index("accounts_signup_ip_idx").on(t.signupIpHash, t.createdAt),
    check("accounts_status_check", sql`${t.status} in ('active', 'banned')`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the cookie token, hex. */
    tokenHash: text("token_hash").primaryKey(),
    /** Unique: one live session per account (PLAN §19); a new login replaces the row. */
    accountId: uuid("account_id")
      .notNull()
      .unique()
      .references(() => accounts.id, { onDelete: "cascade" }),
    expiresAt: at("expires_at").notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_expires_idx").on(t.expiresAt)],
);

export const characters = pgTable(
  "characters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** One character per account at launch (PLAN §20). */
    accountId: uuid("account_id")
      .notNull()
      .unique()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    major: text("major").notNull(),
    level: integer("level").notNull().default(1),
    exp: doublePrecision("exp").notNull().default(0),
    look: jsonb("look").notNull(),
    mapId: text("map_id").notNull(),
    x: doublePrecision("x").notNull(),
    y: doublePrecision("y").notNull(),
    controlMode: text("control_mode").notNull().default("semi"),
    /** 전직 tier: 0 신입생 through 4 연구생 (PLAN §7). */
    tier: smallint("tier").notNull().default(0),
    /** 기수: the Page that was live when the character was made. */
    cohort: integer("cohort").notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("characters_name_key").on(sql`lower(${t.name})`),
    check(
      "characters_major_check",
      sql`${t.major} in ('math', 'physics', 'chemistry', 'biology', 'earth')`,
    ),
    check(
      "characters_control_mode_check",
      sql`${t.controlMode} in ('auto', 'semi', 'skill', 'manual')`,
    ),
    check("characters_tier_check", sql`${t.tier} between 0 and 4`),
  ],
);

/**
 * Failed logins and recoveries, kept 15 minutes (PLAN §22). `source` is the counter the attempt
 * belongs to: the IP hash, or a device cookie's key; `ip_hash` is always the IP, for the per-IP
 * ceiling.
 */
export const loginFailures = pgTable(
  "login_failures",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    loginId: text("login_id").notNull(),
    source: text("source").notNull(),
    ipHash: text("ip_hash").notNull(),
    at: at("at").notNull().defaultNow(),
  },
  (t) => [
    index("login_failures_key_idx").on(t.loginId, t.source, t.at),
    index("login_failures_ip_idx").on(t.ipHash, t.at),
  ],
);

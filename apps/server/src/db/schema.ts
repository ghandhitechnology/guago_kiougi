/** Tables shaped as PLAN §20. Only what the server uses today; later milestones add columns. */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
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
    /** 부전공, chosen at the 2학년 전직 (PLAN §7). */
    minor: text("minor"),
    level: integer("level").notNull().default(1),
    exp: doublePrecision("exp").notNull().default(0),
    /** Placed stat points (PLAN §9); together never more than three per level. */
    statUnderstanding: integer("stat_understanding").notNull().default(0),
    statMemory: integer("stat_memory").notNull().default(0),
    statFocus: integer("stat_focus").notNull().default(0),
    statVitality: integer("stat_vitality").notNull().default(0),
    statAgility: integer("stat_agility").notNull().default(0),
    statLuck: integer("stat_luck").notNull().default(0),
    look: jsonb("look").notNull(),
    mapId: text("map_id").notNull(),
    x: doublePrecision("x").notNull(),
    y: doublePrecision("y").notNull(),
    controlMode: text("control_mode").notNull().default("semi"),
    /** 전직 tier, an index into `TIERS`: 0 신입생 through 5 연구생 (PLAN §7). */
    tier: smallint("tier").notNull().default(0),
    /** 기수: the Page that was live when the character was made. */
    cohort: integer("cohort").notNull(),
    /** 벌점 and lifetime 상점 (PLAN §11); spendable 상점 sits in the wallet. */
    demerits: integer("demerits").notNull().default(0),
    merits: integer("merits").notNull().default(0),
    /** The offline 자습 pool (PLAN §9): filling since logout, at rates the server measured. */
    poolStartedAt: at("pool_started_at"),
    poolRates: jsonb("pool_rates"),
    poolPlace: text("pool_place"),
    /** Whose 낱장 the pool pays: a book of the last field hunted. */
    poolSheetBook: text("pool_sheet_book"),
    /** 숙면 ends here (PLAN §11). */
    restedUntil: at("rested_until"),
    /** Bumped by every applied item or currency operation; change notices carry it. */
    rev: bigint("rev", { mode: "number" }).notNull().default(0),
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
      "characters_minor_check",
      sql`${t.minor} is null or (${t.minor} in ('math', 'physics', 'chemistry', 'biology', 'earth') and ${t.minor} <> ${t.major})`,
    ),
    check(
      "characters_control_mode_check",
      sql`${t.controlMode} in ('auto', 'semi', 'skill', 'manual')`,
    ),
    check("characters_tier_check", sql`${t.tier} between 0 and 5`),
    check("characters_level_check", sql`${t.level} >= 1`),
    // NaN sorts above every number in Postgres, so this also refuses NaN and infinity.
    check("characters_exp_check", sql`${t.exp} >= 0 and ${t.exp} < 'Infinity'`),
    check(
      "characters_stats_check",
      sql`least(${t.statUnderstanding}, ${t.statMemory}, ${t.statFocus}, ${t.statVitality}, ${t.statAgility}, ${t.statLuck}) >= 0 and ${t.statUnderstanding}::bigint + ${t.statMemory} + ${t.statFocus} + ${t.statVitality} + ${t.statAgility} + ${t.statLuck} <= 3 * ${t.level}::bigint`,
    ),
    check("characters_rules_check", sql`${t.demerits} >= 0 and ${t.merits} >= 0`),
    check(
      "characters_pool_check",
      sql`${t.poolStartedAt} is null or (${t.poolRates} is not null and ${t.poolPlace} in ('field', 'hub', 'study-hall', 'dorm'))`,
    ),
    check("characters_rev_check", sql`${t.rev} >= 0`),
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

/**
 * Every chat line, kept 90 days (PLAN §12, §20). `body` is the text as sent, before masking.
 * Partitioned by UTC day: the migration declares `PARTITION BY RANGE (at)` and the
 * `chat_log_maintain` function, which the server runs hourly to add tomorrow's partitions and
 * drop those past retention. No foreign keys: the log outlives characters.
 */
export const chatLog = pgTable(
  "chat_log",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity(),
    channel: text("channel").notNull(),
    /** Character id; null for system lines. */
    senderId: uuid("sender_id"),
    /** Whisper and system: the receiving character id. 주변: the map id. 전체: null. */
    target: text("target"),
    body: text("body").notNull(),
    masked: boolean("masked").notNull(),
    at: at("at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.id, t.at] }), index("chat_log_sender_idx").on(t.senderId, t.at)],
);

// Items and the economy (PLAN §8, §13, §20, §22) ---------------------------------------------

/**
 * Currency amounts are exact integers: `numeric(40, 0)`. Balances pass 2^53 late in Theme 1,
 * where a double stops counting single 솔방울, and the wallet must equal the sum of its ledger
 * to the unit.
 */
const amount = (name: string) => numeric(name, { precision: 40, scale: 0 });

export const wallets = pgTable(
  "wallets",
  {
    characterId: uuid("character_id")
      .primaryKey()
      .references(() => characters.id, { onDelete: "cascade" }),
    pinecones: amount("pinecones").notNull().default("0"),
    meritPoints: amount("merit_points").notNull().default("0"),
    tokens: amount("tokens").notNull().default("0"),
  },
  (t) => [
    check(
      "wallets_nonnegative_check",
      sql`${t.pinecones} >= 0 and ${t.meritPoints} >= 0 and ${t.tokens} >= 0`,
    ),
  ],
);

/** Stacks: `ink`, `binding`, `sheet:<book>`, `snack:<item>`. Counts stay exact in a JS number. */
export const materials = pgTable(
  "materials",
  {
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    defId: text("def_id").notNull(),
    qty: bigint("qty", { mode: "number" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.defId] }),
    check("materials_qty_check", sql`${t.qty} between 0 and 9007199254740991`),
    check("materials_def_check", sql`${t.defId} ~ '^(ink|binding|(sheet|snack):[a-z0-9-]{1,40})$'`),
  ],
);

/** Books and tools. Ids are made by the server; an item always has an owner. */
export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    defId: text("def_id").notNull(),
    kind: text("kind").notNull(),
    grade: smallint("grade").notNull().default(0),
    level: integer("level").notNull().default(1),
    exp: doublePrecision("exp").notNull().default(0),
    pilgi: integer("pilgi").notNull().default(0),
    pilgiFailStreak: integer("pilgi_fail_streak").notNull().default(0),
    affixes: jsonb("affixes").notNull().default([]),
    evolved: boolean("evolved").notNull().default(false),
    bound: boolean("bound").notNull().default(false),
    tradableAt: at("tradable_at"),
    /** Equipped slot among the items of its kind, null in the bag. */
    slot: smallint("slot"),
    createdAt: at("created_at").notNull().defaultNow(),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("items_owner_idx").on(t.ownerId),
    // Two items never share a slot; an item has one slot column, so it is never in two.
    uniqueIndex("items_slot_key").on(t.ownerId, t.kind, t.slot).where(sql`${t.slot} is not null`),
    check("items_kind_check", sql`${t.kind} in ('book', 'tool')`),
    check("items_grade_check", sql`${t.grade} between 0 and 4`),
    check("items_level_check", sql`${t.level} >= 1`),
    check("items_exp_check", sql`${t.exp} >= 0 and ${t.exp} < 'Infinity'`),
    check("items_pilgi_check", sql`${t.pilgi} >= 0 and ${t.pilgiFailStreak} >= 0`),
    check(
      "items_tool_check",
      sql`${t.kind} = 'book' or (${t.level} <= 5 and ${t.grade} = 0 and ${t.pilgi} = 0 and ${t.pilgiFailStreak} = 0 and not ${t.evolved})`,
    ),
    check(
      "items_affixes_check",
      sql`jsonb_typeof(${t.affixes}) = 'array' and jsonb_array_length(${t.affixes}) <= 3`,
    ),
    check("items_slot_check", sql`${t.slot} between 0 and 5`),
  ],
);

export const questProgress = pgTable(
  "quest_progress",
  {
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    questId: text("quest_id").notNull(),
    state: text("state").notNull().default("active"),
    progress: integer("progress").notNull().default(0),
    target: integer("target").notNull(),
    /** The notice as drawn (`QuestOffer`), its reward fixed when it was posted. */
    offer: jsonb("offer").notNull(),
    resetAt: at("reset_at"),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.questId] }),
    check("quest_progress_state_check", sql`${t.state} in ('active', 'done', 'claimed')`),
    check(
      "quest_progress_count_check",
      sql`${t.target} >= 1 and ${t.progress} >= 0 and (${t.state} = 'active' or ${t.progress} >= ${t.target})`,
    ),
  ],
);

export const codexUnlocks = pgTable(
  "codex_unlocks",
  {
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    entryId: text("entry_id").notNull(),
    unlockedAt: at("unlocked_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.entryId] })],
);

/**
 * Every unit that enters or leaves a character, one row per (operation, currency, source or
 * sink). Items are booked as `item:<def>`, +1 when made and -1 when used up, with their id. The
 * `economy_daily` view sums it by Korean calendar day (PLAN §13).
 */
export const economyLedger = pgTable(
  "economy_ledger",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    day: date("day").notNull().default(sql`(now() at time zone 'Asia/Seoul')::date`),
    at: at("at").notNull().defaultNow(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    operationId: text("operation_id").notNull(),
    currency: text("currency").notNull(),
    sourceOrSink: text("source_or_sink").notNull(),
    amount: amount("amount").notNull(),
    itemId: uuid("item_id"),
  },
  (t) => [
    index("economy_ledger_day_idx").on(t.day, t.currency, t.sourceOrSink),
    index("economy_ledger_character_idx").on(t.characterId, t.currency),
    index("economy_ledger_item_idx").on(t.itemId).where(sql`${t.itemId} is not null`),
    check("economy_ledger_amount_check", sql`${t.amount} <> 0`),
    check(
      "economy_ledger_item_check",
      sql`(${t.itemId} is null) = (${t.currency} not like 'item:%') and (${t.itemId} is null or ${t.amount} in (1, -1))`,
    ),
  ],
);

/**
 * One row per operation id (PLAN §19, §21): what was asked, a hash of the request so a reused id
 * with a different request is refused, and the one result every retry gets back.
 */
export const operations = pgTable(
  "operations",
  {
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    opId: text("op_id").notNull(),
    name: text("name").notNull(),
    requestHash: text("request_hash").notNull(),
    ok: boolean("ok").notNull(),
    result: jsonb("result").notNull(),
    at: at("at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.opId] }), index("operations_at_idx").on(t.at)],
);

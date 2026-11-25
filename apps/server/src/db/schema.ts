/** Tables shaped as PLAN §20. Only what the server uses today; later milestones add columns. */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
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
    // The living world (PLAN §9, §11): set by the live operations only.
    /** When the player came back online; the pool stops filling here until it is claimed. */
    poolStoppedAt: at("pool_stopped_at"),
    /** The best income rate last measured, in the last field hunted, for the next pool. */
    huntRates: jsonb("hunt_rates"),
    /** 명령퇴사: home until, then −30% EXP until `penalty_until`. */
    homeUntil: at("home_until"),
    penaltyUntil: at("penalty_until"),
    drowsy: boolean("drowsy").notNull().default(false),
    mealId: text("meal_id"),
    mealUntil: at("meal_until"),
    /** Award ids (PLAN §11 joke awards). */
    titles: jsonb("titles").notNull().default([]),
    patrolCatches: integer("patrol_catches").notNull().default(0),
    expulsions: integer("expulsions").notNull().default(0),
    /** Full daily boards in a row, ending on board day `board_streak_day` (개근상). */
    boardStreak: integer("board_streak").notNull().default(0),
    boardStreakDay: integer("board_streak_day"),
    /** The world session that logged in last; a logout from an older one starts no pool. */
    liveSession: text("live_session"),
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
    /**
     * The live 매점 게시판 listing holding it. A listed item has left the bag: no operation
     * loads it but the listing's own (buy, cancel, expiry).
     */
    listingId: uuid("listing_id").references((): AnyPgColumn => listings.id),
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
    check("items_listing_check", sql`${t.listingId} is null or ${t.slot} is null`),
    index("items_listing_idx").on(t.listingId).where(sql`${t.listingId} is not null`),
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
 * sink). Items are booked as `item:<def>`, +1 when made or received and -1 when used up or
 * given, with their id. Combat grants are `coalesced`: one row per character, Korean day,
 * currency and source, which each grant adds to (`entries` counts them), so a horde does not
 * write a row per player every five seconds. Per-operation rows older than
 * `LEDGER_RAW_DAYS` are compacted the same way (`ledger.ts`). The `economy_daily` view reads
 * closed days from `economy_daily_totals` and today from here (PLAN §13).
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
    coalesced: boolean("coalesced").notNull().default(false),
    /** Operations summed into this row: 1 unless `coalesced`. */
    entries: integer("entries").notNull().default(1),
  },
  (t) => [
    index("economy_ledger_day_idx").on(t.day, t.currency, t.sourceOrSink),
    uniqueIndex("economy_ledger_coalesced_key")
      .on(t.characterId, t.day, t.currency, t.sourceOrSink)
      .where(sql`${t.coalesced}`),
    index("economy_ledger_character_idx").on(t.characterId, t.currency),
    index("economy_ledger_item_idx").on(t.itemId).where(sql`${t.itemId} is not null`),
    // A coalesced row may net to zero (a day's escrow out and back, compacted together).
    check("economy_ledger_amount_check", sql`${t.amount} <> 0 or ${t.coalesced}`),
    check(
      "economy_ledger_coalesced_check",
      sql`${t.entries} >= 1 and (${t.coalesced} or ${t.entries} = 1) and not (${t.coalesced} and ${t.itemId} is not null)`,
    ),
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

/** Closed Korean days of `economy_ledger` summed by currency and source or sink (PLAN §13). */
export const economyDailyTotals = pgTable(
  "economy_daily_totals",
  {
    day: date("day").notNull(),
    currency: text("currency").notNull(),
    sourceOrSink: text("source_or_sink").notNull(),
    amount: amount("amount").notNull(),
    entries: bigint("entries", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.day, t.currency, t.sourceOrSink] })],
);

// Trading (PLAN §13 "Player trading") ---------------------------------------------------------

/**
 * 매점 게시판 listings. A listing holds what it sells: a unique item (`item_id`, the item row
 * pointing back through `listing_id`) or `qty` units of a stack taken out of the seller's
 * materials. `qty` is what is still for sale; it is 0 once the listing is closed, whether sold,
 * cancelled or expired, and whatever was left has gone back to the seller.
 */
export const listings = pgTable(
  "listings",
  {
    id: uuid("id").primaryKey(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    state: text("state").notNull().default("live"),
    category: text("category").notNull(),
    /** A book or tool def, or a stack id. */
    defId: text("def_id").notNull(),
    grade: smallint("grade").notNull().default(0),
    itemId: uuid("item_id"),
    /** What a unique item shows on the board (`ListedItem`); it cannot change while listed. */
    item: jsonb("item"),
    qty: bigint("qty", { mode: "number" }).notNull(),
    listedQty: bigint("listed_qty", { mode: "number" }).notNull(),
    unitPrice: amount("unit_price").notNull(),
    fee: amount("fee").notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
    expiresAt: at("expires_at").notNull(),
    closedAt: at("closed_at"),
  },
  (t) => [
    index("listings_seller_idx").on(t.sellerId, t.createdAt),
    uniqueIndex("listings_item_key").on(t.itemId).where(sql`${t.state} = 'live'`),
    index("listings_price_idx").on(t.unitPrice, t.id).where(sql`${t.state} = 'live'`),
    index("listings_category_idx")
      .on(t.category, t.unitPrice, t.id)
      .where(sql`${t.state} = 'live'`),
    index("listings_def_idx")
      .on(t.defId, t.grade, t.unitPrice, t.id)
      .where(sql`${t.state} = 'live'`),
    index("listings_expiry_idx").on(t.expiresAt).where(sql`${t.state} = 'live'`),
    index("listings_closed_idx").on(t.closedAt).where(sql`${t.state} <> 'live'`),
    check("listings_state_check", sql`${t.state} in ('live', 'sold', 'cancelled', 'expired')`),
    check(
      "listings_qty_check",
      sql`${t.listedQty} >= 1 and ${t.qty} between 0 and ${t.listedQty} and (${t.state} = 'live') = (${t.qty} > 0)`,
    ),
    check(
      "listings_item_check",
      sql`(${t.itemId} is null) = (${t.item} is null) and (${t.itemId} is null or ${t.listedQty} = 1)`,
    ),
    check("listings_price_check", sql`${t.unitPrice} > 0 and ${t.fee} >= 0`),
    check("listings_closed_check", sql`(${t.state} = 'live') = (${t.closedAt} is null)`),
  ],
);

// Social (PLAN §12, §20) ---------------------------------------------------------------------
// Caps live in the database: the `*_count` columns are kept by triggers (migration 0003) and
// checked against the caps in `@guago/shared` social.ts, so no code path can pass one.

const characterRef = (name: string) =>
  uuid(name)
    .notNull()
    .references(() => characters.id, { onDelete: "cascade" });

/** Per-character counters of the social lists others or the player can grow. */
export const socialCounts = pgTable(
  "social_counts",
  {
    characterId: characterRef("character_id").primaryKey(),
    friends: integer("friends").notNull().default(0),
    requestsOut: integer("requests_out").notNull().default(0),
    requestsIn: integer("requests_in").notNull().default(0),
    blocks: integer("blocks").notNull().default(0),
    applied: integer("applied").notNull().default(0),
    clubInvites: integer("club_invites").notNull().default(0),
    openReports: integer("open_reports").notNull().default(0),
  },
  (t) => [
    check("social_counts_friends_check", sql`${t.friends} between 0 and 100`),
    check("social_counts_requests_out_check", sql`${t.requestsOut} between 0 and 20`),
    check("social_counts_requests_in_check", sql`${t.requestsIn} between 0 and 50`),
    check("social_counts_blocks_check", sql`${t.blocks} between 0 and 200`),
    check("social_counts_applied_check", sql`${t.applied} between 0 and 3`),
    check("social_counts_club_invites_check", sql`${t.clubInvites} between 0 and 10`),
    check("social_counts_open_reports_check", sql`${t.openReports} between 0 and 20`),
  ],
);

/** One row each way per friendship. */
export const friends = pgTable(
  "friends",
  {
    characterId: characterRef("character_id"),
    otherId: characterRef("other_id"),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.otherId] }),
    index("friends_other_idx").on(t.otherId),
    check("friends_self_check", sql`${t.characterId} <> ${t.otherId}`),
  ],
);

export const friendRequests = pgTable(
  "friend_requests",
  {
    fromId: characterRef("from_id"),
    toId: characterRef("to_id"),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.fromId, t.toId] }),
    index("friend_requests_to_idx").on(t.toId, t.createdAt),
    index("friend_requests_created_idx").on(t.createdAt),
    check("friend_requests_self_check", sql`${t.fromId} <> ${t.toId}`),
  ],
);

export const blocks = pgTable(
  "blocks",
  {
    characterId: characterRef("character_id"),
    otherId: characterRef("other_id"),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.otherId] }),
    index("blocks_other_idx").on(t.otherId),
    check("blocks_self_check", sql`${t.characterId} <> ${t.otherId}`),
  ],
);

/**
 * 동아리. The 짱 is `leader_id`, always a member of the club (a deferred foreign key into
 * `club_members`). A disbanded club keeps its row, without members or leader, so the operation
 * id that founded it can never found another, and moderation can still name it.
 */
export const clubs = pgTable(
  "clubs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    leaderId: uuid("leader_id"),
    joinRule: text("join_rule").notNull(),
    level: integer("level").notNull().default(1),
    exp: doublePrecision("exp").notNull().default(0),
    jacketColor: text("jacket_color").notNull(),
    emblem: jsonb("emblem").notNull(),
    memberCount: integer("member_count").notNull().default(0),
    applicationCount: integer("application_count").notNull().default(0),
    inviteCount: integer("invite_count").notNull().default(0),
    noticeCount: integer("notice_count").notNull().default(0),
    /** Who founded it under which operation id: a retried creation finds its club here. */
    foundedBy: uuid("founded_by").notNull(),
    foundedOp: text("founded_op").notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
    disbandedAt: at("disbanded_at"),
  },
  (t) => [
    uniqueIndex("clubs_name_key").on(sql`lower(${t.name})`).where(sql`${t.disbandedAt} is null`),
    uniqueIndex("clubs_founded_key").on(t.foundedBy, t.foundedOp),
    check("clubs_join_rule_check", sql`${t.joinRule} in ('open', 'apply', 'invite')`),
    check("clubs_level_check", sql`${t.level} between 1 and 10 and ${t.exp} >= 0`),
    check("clubs_leader_check", sql`(${t.leaderId} is null) = (${t.disbandedAt} is not null)`),
    check("clubs_member_count_check", sql`${t.memberCount} between 0 and 30`),
    check("clubs_application_count_check", sql`${t.applicationCount} between 0 and 30`),
    check("clubs_invite_count_check", sql`${t.inviteCount} between 0 and 20`),
    check("clubs_notice_count_check", sql`${t.noticeCount} between 0 and 5`),
  ],
);

/** One club per character: the character id is the key. The 짱's own rank is `clubs.leader_id`. */
export const clubMembers = pgTable(
  "club_members",
  {
    characterId: characterRef("character_id").primaryKey(),
    clubId: integer("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    rank: text("rank").notNull().default("member"),
    joinedAt: at("joined_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("club_members_club_key").on(t.clubId, t.characterId),
    check("club_members_rank_check", sql`${t.rank} in ('vice', 'member')`),
  ],
);

export const clubApplications = pgTable(
  "club_applications",
  {
    clubId: integer("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    characterId: characterRef("character_id"),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.clubId, t.characterId] }),
    index("club_applications_character_idx").on(t.characterId),
  ],
);

export const clubInvites = pgTable(
  "club_invites",
  {
    clubId: integer("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    characterId: characterRef("character_id"),
    invitedBy: characterRef("invited_by"),
    createdAt: at("created_at").notNull().defaultNow(),
    expiresAt: at("expires_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.clubId, t.characterId] }),
    index("club_invites_character_idx").on(t.characterId),
    index("club_invites_expiry_idx").on(t.expiresAt),
  ],
);

export const clubNotices = pgTable(
  "club_notices",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    clubId: integer("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    authorId: characterRef("author_id"),
    body: text("body").notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (t) => [index("club_notices_club_idx").on(t.clubId, t.createdAt)],
);

/**
 * 대자보 posts. One live post per author and section: the unique key covers expired rows too,
 * and posting clears the author's own expired one first; a sweep deletes the rest. A 층장's
 * pinned notice is the `notice` section.
 */
export const boardPosts = pgTable(
  "board_posts",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    authorId: characterRef("author_id"),
    category: text("category").notNull(),
    body: text("body").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: at("created_at").notNull(),
    expiresAt: at("expires_at").notNull(),
  },
  (t) => [
    uniqueIndex("board_posts_author_key").on(t.authorId, t.category),
    index("board_posts_list_idx").on(t.category, t.id),
    index("board_posts_expiry_idx").on(t.expiresAt),
    check(
      "board_posts_category_check",
      sql`${t.category} in ('party', 'trade', 'club', 'chat', 'notice')`,
    ),
    check("board_posts_pinned_check", sql`${t.pinned} = (${t.category} = 'notice')`),
  ],
);

/**
 * Every completed direct trade and board sale (PLAN §13: kept, searchable from the admin page).
 * No foreign keys: the log outlives characters. `from_id` is the seller, or the first party of
 * a direct trade; `item_ids` and `defs` hold everything that changed hands, for search. Board
 * sales also fill the one good they sold, which the price history reads.
 */
export const tradeLog = pgTable(
  "trade_log",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    kind: text("kind").notNull(),
    opId: text("op_id").notNull(),
    /** The server clock's time of the trade (live/clock.ts). */
    at: at("at").notNull().defaultNow(),
    /** Wall-clock time it was written: what retention is counted against. */
    recordedAt: at("recorded_at").notNull().defaultNow(),
    fromId: uuid("from_id").notNull(),
    toId: uuid("to_id").notNull(),
    itemIds: uuid("item_ids").array().notNull(),
    defs: text("defs").array().notNull(),
    /** 솔방울 that left the game in tax on this trade. */
    tax: amount("tax").notNull(),
    /** Both sides in full: item views, stacks, 솔방울 sent and received. */
    payload: jsonb("payload").notNull(),
    listingId: uuid("listing_id"),
    defId: text("def_id"),
    grade: smallint("grade"),
    qty: bigint("qty", { mode: "number" }),
    unitPrice: amount("unit_price"),
  },
  (t) => [
    uniqueIndex("trade_log_op_key").on(t.kind, t.toId, t.opId),
    index("trade_log_from_idx").on(t.fromId, t.at),
    index("trade_log_to_idx").on(t.toId, t.at),
    index("trade_log_at_idx").on(t.at),
    index("trade_log_recorded_idx").on(t.recordedAt),
    index("trade_log_items_idx").using("gin", t.itemIds),
    index("trade_log_defs_idx").using("gin", t.defs),
    index("trade_log_price_idx").on(t.defId, t.grade, t.at).where(sql`${t.kind} = 'board'`),
    check("trade_log_kind_check", sql`${t.kind} in ('board', 'direct')`),
    check(
      "trade_log_board_check",
      sql`(${t.kind} = 'board') = (${t.listingId} is not null and ${t.defId} is not null and ${t.grade} is not null and ${t.qty} > 0 and ${t.unitPrice} > 0)`,
    ),
  ],
);

/**
 * The report queue (PLAN §12), read by the admin page. `context` holds the reported player's
 * last lines from `chat_log`, attached by the server. No foreign keys: reports outlive
 * characters. One open report per reporter, target and category.
 */
export const reports = pgTable(
  "reports",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    reporterId: uuid("reporter_id").notNull(),
    targetId: uuid("target_id").notNull(),
    category: text("category").notNull(),
    note: text("note"),
    context: jsonb("context").notNull(),
    state: text("state").notNull().default("open"),
    handledBy: uuid("handled_by"),
    handledAt: at("handled_at"),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("reports_open_key")
      .on(t.reporterId, t.targetId, t.category)
      .where(sql`${t.state} = 'open'`),
    index("reports_queue_idx").on(t.state, t.createdAt),
    index("reports_target_idx").on(t.targetId, t.createdAt),
    check(
      "reports_category_check",
      sql`${t.category} in ('abuse', 'sexual', 'spam', 'cheat', 'trade', 'name', 'other')`,
    ),
    check("reports_state_check", sql`${t.state} in ('open', 'resolved', 'dismissed')`),
  ],
);

// The living world (PLAN §10, §11, §15, §20) -------------------------------------------------

/**
 * Server-wide state, one row (PLAN §20 `server_state`): the live Page, when its rift opened, the
 * last milestone announced, and the server clock's anchor (`clock_*`): game time is
 * `clock_game_ms + (wall ms − clock_real_ms) × clock_rate`.
 */
export const serverState = pgTable(
  "server_state",
  {
    id: smallint("id").primaryKey().default(1),
    currentPage: integer("current_page").notNull(),
    /** Game time the live Page's rift opened. */
    pageOpenedAt: at("page_opened_at").notNull(),
    /** The last milestone whose announcement went out. */
    milestone: text("milestone").notNull(),
    clockRealMs: doublePrecision("clock_real_ms").notNull(),
    clockGameMs: doublePrecision("clock_game_ms").notNull(),
    clockRate: doublePrecision("clock_rate").notNull().default(1),
    /** Board day and week the server last turned over (announcements, 층장). */
    lastDay: integer("last_day").notNull(),
    lastWeek: integer("last_week").notNull(),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("server_state_one_row", sql`${t.id} = 1`),
    check("server_state_rate_check", sql`${t.clockRate} > 0`),
  ],
);

/** The 0조 연구노트 (PLAN §10, §20 `notebook`): one row per Page once its rift has opened. */
export const notebook = pgTable("notebook", {
  page: integer("page").primaryKey(),
  openedAt: at("opened_at").notNull(),
  sealedAt: at("sealed_at"),
});

/** Each boss freed on a Page: when, who landed the final hit, who topped the boards. */
export const notebookBosses = pgTable(
  "notebook_bosses",
  {
    page: integer("page")
      .notNull()
      .references(() => notebook.page, { onDelete: "cascade" }),
    bossId: text("boss_id").notNull(),
    freedAt: at("freed_at").notNull(),
    finalHitBy: uuid("final_hit_by").references(() => characters.id, { onDelete: "set null" }),
    /** Kept as written that day: the notebook keeps the name even if the character goes. */
    finalHitName: text("final_hit_name"),
    /** `[{ board, id, name }]`. */
    boardLeaders: jsonb("board_leaders").notNull().default([]),
  },
  (t) => [primaryKey({ columns: [t.page, t.bossId] })],
);

/** 벌점 and 상점 with their reasons (PLAN §11): `demerits` and `merits` are their sums. */
export const conductLedger = pgTable(
  "conduct_ledger",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    operationId: text("operation_id").notNull(),
    kind: text("kind").notNull(),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    at: at("at").notNull().defaultNow(),
  },
  (t) => [
    index("conduct_ledger_character_idx").on(t.characterId, t.kind),
    check("conduct_ledger_kind_check", sql`${t.kind} in ('demerit', 'merit')`),
    check("conduct_ledger_amount_check", sql`${t.amount} <> 0`),
  ],
);

/** Per board week counts: `merit` picks the 층장, `meal` the 다 먹었상. */
export const weeklyTally = pgTable(
  "weekly_tally",
  {
    week: integer("week").notNull(),
    kind: text("kind").notNull(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    n: integer("n").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.week, t.kind, t.characterId] }),
    index("weekly_tally_rank_idx").on(t.week, t.kind, t.n),
    check("weekly_tally_kind_check", sql`${t.kind} in ('merit', 'meal')`),
  ],
);

/**
 * Per board day counts against the anti-farming caps: 상점 counted toward the 층장 tally by
 * reason (`revive`, `help`, …), and 도움 notices paid per poster (`help:<poster id>`).
 */
export const meritDaily = pgTable(
  "merit_daily",
  {
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    day: integer("day").notNull(),
    key: text("key").notNull(),
    n: integer("n").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.day, t.key] }),
    check("merit_daily_n_check", sql`${t.n} >= 0`),
  ],
);

/** The week's five 층장 (PLAN §11), chosen from the week before. */
export const floorLeaders = pgTable(
  "floor_leaders",
  {
    week: integer("week").notNull(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    rank: smallint("rank").notNull(),
    /** The +5 상점 went out: the turnover pays each row once, whatever it was doing on a crash. */
    paid: boolean("paid").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.week, t.characterId] })],
);

/** Lifetime kills by monster, for the 오개념 entries (PLAN §15). Written by batched progress. */
export const killCounts = pgTable(
  "kill_counts",
  {
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    monsterId: text("monster_id").notNull(),
    kills: bigint("kills", { mode: "number" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.monsterId] }),
    check("kill_counts_check", sql`${t.kills} >= 0`),
  ],
);

/**
 * 도움 notices (PLAN §15): posted by a player below the frontier, taken by one helper whose
 * `help:<id>` quest row carries the progress.
 */
export const helpNotices = pgTable(
  "help_notices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    posterId: uuid("poster_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    posterLevel: integer("poster_level").notNull(),
    template: text("template").notNull(),
    slots: jsonb("slots").notNull(),
    count: integer("count").notNull(),
    /** `help-finish`: the poster's quest row the helper helps finish. */
    questId: text("quest_id"),
    state: text("state").notNull().default("open"),
    helperId: uuid("helper_id").references(() => characters.id, { onDelete: "set null" }),
    postedAt: at("posted_at").notNull(),
    expiresAt: at("expires_at").notNull(),
  },
  (t) => [
    index("help_notices_open_idx").on(t.state, t.expiresAt),
    uniqueIndex("help_notices_poster_key")
      .on(t.posterId)
      .where(sql`${t.state} in ('open', 'taken')`),
    uniqueIndex("help_notices_helper_key").on(t.helperId).where(sql`${t.state} = 'taken'`),
    check("help_notices_state_check", sql`${t.state} in ('open', 'taken', 'done', 'cancelled')`),
    check("help_notices_count_check", sql`${t.count} >= 1`),
  ],
);

/**
 * Trades past the trade log's retention, summed per Korean day and pair of players (`a` < `b`),
 * so a real-money-trading case can still see who traded with whom, how often and how much
 * 솔방울 went each way (`tradePartners`) after the rows themselves are gone.
 */
export const tradePairs = pgTable(
  "trade_pairs",
  {
    day: date("day").notNull(),
    a: uuid("a").notNull(),
    b: uuid("b").notNull(),
    kind: text("kind").notNull(),
    trades: integer("trades").notNull(),
    /** 솔방울 sent from `a` to `b`, and from `b` to `a`. */
    aSent: amount("a_sent").notNull(),
    bSent: amount("b_sent").notNull(),
    items: integer("items").notNull(),
    tax: amount("tax").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.day, t.a, t.b, t.kind] }),
    index("trade_pairs_a_idx").on(t.a, t.day),
    index("trade_pairs_b_idx").on(t.b, t.day),
    check("trade_pairs_order_check", sql`${t.a} < ${t.b}`),
  ],
);

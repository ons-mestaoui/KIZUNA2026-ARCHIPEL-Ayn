import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const now = () => new Date();
const ts = (name: string) => integer(name, { mode: "timestamp_ms" });

// ─── Better Auth core tables (shape taken from @better-auth/core get-tables) ───────────────
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
  image: text("image"),
  createdAt: ts("created_at").$defaultFn(now).notNull(),
  updatedAt: ts("updated_at").$defaultFn(now).$onUpdate(now).notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: ts("created_at").$defaultFn(now).notNull(),
    updatedAt: ts("updated_at").$defaultFn(now).$onUpdate(now).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: ts("created_at").$defaultFn(now).notNull(),
    updatedAt: ts("updated_at").$defaultFn(now).$onUpdate(now).notNull(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").$defaultFn(now).notNull(),
    updatedAt: ts("updated_at").$defaultFn(now).$onUpdate(now).notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ─── App tables ─────────────────────────────────────────────────────────────────────────────
const uid = () => crypto.randomUUID();

/** One or more farms (plots) per farmer. userId comes from the session — never from the client. */
export const farm = sqliteTable(
  "farm",
  {
    id: text("id").primaryKey().$defaultFn(uid),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    lat: real("lat").notNull(),
    lon: real("lon").notNull(),
    placeName: text("place_name"),
    crop: text("crop").notNull(), // CropId
    plantingDate: text("planting_date"), // YYYY-MM-DD (annual crops)
    areaHa: real("area_ha").notNull(), // from the outline when there is one
    /** The outline the farmer drew: [lon, lat] corners, not closed. Null = only a pin on the map. */
    polygon: text("polygon", { mode: "json" }).$type<[number, number][]>(),
    soilTexture: text("soil_texture").notNull(), // SoilTexture
    irrigationMethod: text("irrigation_method").notNull(), // drip | sprinkler | surface
    waterSource: text("water_source").notNull(), // solar_basin | solar_direct | grid | diesel | network
    basinM3: real("basin_m3").notNull().default(0),
    pvKWp: real("pv_kwp").notNull().default(0),
    pumpHeadM: real("pump_head_m").notNull().default(15),
    wellSafeYieldM3h: real("well_safe_yield_m3h").notNull().default(20),
    lastIrrigated: text("last_irrigated").notNull().default("unknown"), // today | 1-2d | 3-5d | week+ | unknown
    lang: text("lang").notNull().default("en"),
    createdAt: ts("created_at").$defaultFn(now).notNull(),
    updatedAt: ts("updated_at").$defaultFn(now).$onUpdate(now).notNull(),
  },
  (t) => [index("farm_user_id_idx").on(t.userId)],
);

export const irrigationLog = sqliteTable(
  "irrigation_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD, farm-local
    m3: real("m3").notNull(),
    source: text("source").notNull().default("manual"), // plan | manual
    createdAt: ts("created_at").$defaultFn(now).notNull(),
  },
  (t) => [index("irrigation_farm_date_idx").on(t.farmId, t.date)],
);

export const soilCheck = sqliteTable(
  "soil_check",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    feel: text("feel").notNull(), // dry | moist | wet
    createdAt: ts("created_at").$defaultFn(now).notNull(),
  },
  (t) => [index("soil_check_farm_date_idx").on(t.farmId, t.date)],
);

export const diagnosis = sqliteTable(
  "diagnosis",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    thumb: text("thumb"), // small JPEG data-URL (≤ ~40 KB)
    lang: text("lang").notNull(),
    resultJson: text("result_json").notNull(),
    createdAt: ts("created_at").$defaultFn(now).notNull(),
  },
  (t) => [index("diagnosis_farm_idx").on(t.farmId, t.createdAt)],
);

export const chatMessage = sqliteTable(
  "chat_message",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    farmId: text("farm_id")
      .notNull()
      .references(() => farm.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant
    content: text("content").notNull(),
    createdAt: ts("created_at").$defaultFn(now).notNull(),
  },
  (t) => [index("chat_farm_idx").on(t.farmId, t.createdAt)],
);

/** Per-user daily AI usage (protects the shared free Gemini quota). */
export const usage = sqliteTable(
  "usage",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    day: text("day").notNull(), // YYYY-MM-DD (UTC)
    chats: integer("chats").notNull().default(0),
    photos: integer("photos").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

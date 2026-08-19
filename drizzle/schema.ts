import { decimal, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const portfolios = mysqlTable(
  "portfolios",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    baseCurrency: varchar("baseCurrency", { length: 3 }).notNull().default("USD"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("portfolios_user_name_unique").on(table.userId, table.name)],
);

export const portfolioTransactions = mysqlTable(
  "portfolioTransactions",
  {
    id: int("id").autoincrement().primaryKey(),
    portfolioId: int("portfolioId").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
    symbol: varchar("symbol", { length: 20 }).notNull(),
    assetName: varchar("assetName", { length: 255 }),
    assetType: mysqlEnum("assetType", ["stock", "etf", "mutual_fund"]).notNull(),
    side: mysqlEnum("side", ["buy", "sell"]).notNull(),
    quantity: decimal("quantity", { precision: 24, scale: 8 }).notNull(),
    price: decimal("price", { precision: 22, scale: 6 }).notNull(),
    transactionDate: timestamp("transactionDate").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("portfolio_transactions_portfolio_index").on(table.portfolioId), index("portfolio_transactions_symbol_index").on(table.symbol)],
);

export const watchlistItems = mysqlTable(
  "watchlistItems",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    symbol: varchar("symbol", { length: 20 }).notNull(),
    assetName: varchar("assetName", { length: 255 }),
    assetType: mysqlEnum("assetType", ["stock", "etf", "mutual_fund"]).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("watchlist_items_user_symbol_unique").on(table.userId, table.symbol)],
);

export const aiAnalysisRecords = mysqlTable(
  "aiAnalysisRecords",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    analysisType: mysqlEnum("analysisType", ["recommendation", "news", "chat"]).notNull(),
    symbol: varchar("symbol", { length: 20 }),
    requestContext: text("requestContext").notNull(),
    responseText: text("responseText").notNull(),
    dataAsOf: timestamp("dataAsOf"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("ai_analysis_records_user_created_index").on(table.userId, table.createdAt), index("ai_analysis_records_symbol_index").on(table.symbol)],
);

export type Portfolio = typeof portfolios.$inferSelect;
export type PortfolioTransaction = typeof portfolioTransactions.$inferSelect;
export type WatchlistItem = typeof watchlistItems.$inferSelect;
export type AIAnalysisRecord = typeof aiAnalysisRecords.$inferSelect;

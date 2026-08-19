import { eq } from "drizzle-orm";
import { and, asc, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { aiAnalysisRecords, InsertUser, portfolioTransactions, portfolios, users, watchlistItems } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getOrCreateDefaultPortfolio(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("The database is not available.");
  const existing = await db.select().from(portfolios).where(eq(portfolios.userId, userId)).orderBy(asc(portfolios.id)).limit(1);
  if (existing[0]) return existing[0];

  await db.insert(portfolios).values({ userId, name: "Primary Portfolio", baseCurrency: "USD" });
  const created = await db.select().from(portfolios).where(and(eq(portfolios.userId, userId), eq(portfolios.name, "Primary Portfolio"))).limit(1);
  if (!created[0]) throw new Error("Could not create a portfolio.");
  return created[0];
}

export async function listUserTransactions(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("The database is not available.");
  return db
    .select({ transaction: portfolioTransactions, portfolio: portfolios })
    .from(portfolioTransactions)
    .innerJoin(portfolios, eq(portfolioTransactions.portfolioId, portfolios.id))
    .where(eq(portfolios.userId, userId))
    .orderBy(asc(portfolioTransactions.transactionDate), asc(portfolioTransactions.id));
}

export async function createPortfolioTransaction(input: {
  userId: number;
  symbol: string;
  assetName?: string | null;
  assetType: "stock" | "etf" | "mutual_fund";
  side: "buy" | "sell";
  quantity: string;
  price: string;
  transactionDate: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("The database is not available.");
  const portfolio = await getOrCreateDefaultPortfolio(input.userId);
  await db.insert(portfolioTransactions).values({
    portfolioId: portfolio.id,
    symbol: input.symbol,
    assetName: input.assetName ?? null,
    assetType: input.assetType,
    side: input.side,
    quantity: input.quantity,
    price: input.price,
    transactionDate: input.transactionDate,
  });
}

export async function deletePortfolioTransaction(userId: number, transactionId: number) {
  const db = await getDb();
  if (!db) throw new Error("The database is not available.");
  const owned = await db
    .select({ id: portfolioTransactions.id })
    .from(portfolioTransactions)
    .innerJoin(portfolios, eq(portfolioTransactions.portfolioId, portfolios.id))
    .where(and(eq(portfolios.userId, userId), eq(portfolioTransactions.id, transactionId)))
    .limit(1);
  if (!owned[0]) throw new Error("Transaction not found.");
  await db.delete(portfolioTransactions).where(eq(portfolioTransactions.id, transactionId));
}

export async function listWatchlistItems(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("The database is not available.");
  return db.select().from(watchlistItems).where(eq(watchlistItems.userId, userId)).orderBy(asc(watchlistItems.symbol));
}

export async function upsertWatchlistItem(input: {
  userId: number;
  symbol: string;
  assetName?: string | null;
  assetType: "stock" | "etf" | "mutual_fund";
}) {
  const db = await getDb();
  if (!db) throw new Error("The database is not available.");
  await db
    .insert(watchlistItems)
    .values({ userId: input.userId, symbol: input.symbol, assetName: input.assetName ?? null, assetType: input.assetType })
    .onDuplicateKeyUpdate({ set: { assetName: input.assetName ?? null, assetType: input.assetType } });
}

export async function deleteWatchlistItem(userId: number, itemId: number) {
  const db = await getDb();
  if (!db) throw new Error("The database is not available.");
  await db.delete(watchlistItems).where(and(eq(watchlistItems.id, itemId), eq(watchlistItems.userId, userId)));
}

export async function createAIAnalysisRecord(input: {
  userId: number;
  analysisType: "recommendation" | "news" | "chat";
  symbol?: string | null;
  requestContext: string;
  responseText: string;
  dataAsOf?: Date | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("The database is not available.");
  await db.insert(aiAnalysisRecords).values({
    userId: input.userId,
    analysisType: input.analysisType,
    symbol: input.symbol ?? null,
    requestContext: input.requestContext,
    responseText: input.responseText,
    dataAsOf: input.dataAsOf ?? null,
  });
}

export async function listRecentAIAnalysisRecords(userId: number, limit = 20) {
  const db = await getDb();
  if (!db) throw new Error("The database is not available.");
  return db.select().from(aiAnalysisRecords).where(eq(aiAnalysisRecords.userId, userId)).orderBy(desc(aiAnalysisRecords.createdAt)).limit(limit);
}

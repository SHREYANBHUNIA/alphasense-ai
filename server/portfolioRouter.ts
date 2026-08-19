import { z } from "zod";
import {
  createPortfolioTransaction,
  deletePortfolioTransaction,
  deleteWatchlistItem,
  listUserTransactions,
  listWatchlistItems,
  upsertWatchlistItem,
} from "./db";
import { getChartSeries, getMarketOverview } from "./marketData";
import { calculatePortfolioVolatilityScore, calculateRiskMetrics } from "./quantAnalytics";
import { buildPositionAnalytics, summarizePortfolio } from "./portfolioMath";
import { protectedProcedure, router } from "./_core/trpc";

const symbolSchema = z.string().trim().toUpperCase().min(1).max(20).regex(/^[A-Z0-9.^=-]+$/, "Use a valid market ticker.");
const assetTypeSchema = z.enum(["stock", "etf", "mutual_fund"]);

export const portfolioRouter = router({
  transactions: protectedProcedure.query(({ ctx }) => listUserTransactions(ctx.user.id)),
  watchlist: protectedProcedure.query(({ ctx }) => listWatchlistItems(ctx.user.id)),
  addTransaction: protectedProcedure
    .input(
      z.object({
        symbol: symbolSchema,
        assetName: z.string().trim().max(255).optional(),
        assetType: assetTypeSchema,
        side: z.enum(["buy", "sell"]),
        quantity: z.number().positive().max(1_000_000_000),
        price: z.number().nonnegative().max(10_000_000),
        transactionDate: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await createPortfolioTransaction({ ...input, userId: ctx.user.id, quantity: String(input.quantity), price: String(input.price), transactionDate: new Date(input.transactionDate) });
      return { success: true } as const;
    }),
  deleteTransaction: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await deletePortfolioTransaction(ctx.user.id, input.id);
    return { success: true } as const;
  }),
  addWatchlistItem: protectedProcedure
    .input(z.object({ symbol: symbolSchema, assetName: z.string().trim().max(255).optional(), assetType: assetTypeSchema }))
    .mutation(async ({ ctx, input }) => {
      await upsertWatchlistItem({ ...input, userId: ctx.user.id });
      return { success: true } as const;
    }),
  deleteWatchlistItem: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await deleteWatchlistItem(ctx.user.id, input.id);
    return { success: true } as const;
  }),
  analytics: protectedProcedure.input(z.object({ taxRatePercent: z.number().min(0).max(100).optional() }).optional()).query(async ({ ctx, input }) => {
    const rows = await listUserTransactions(ctx.user.id);
    const transactions = rows.map(row => row.transaction);
    const symbols = Array.from(new Set(transactions.map(transaction => transaction.symbol)));
    const snapshots = symbols.length ? (await getMarketOverview(symbols)).snapshots : [];
    const prices = Object.fromEntries(snapshots.map(snapshot => [snapshot.symbol, snapshot.price]));
    const dayChanges = Object.fromEntries(snapshots.map(snapshot => [snapshot.symbol, snapshot.dayChange]));
    const dayChangePercents = Object.fromEntries(snapshots.map(snapshot => [snapshot.symbol, snapshot.dayChangePercent]));
    const positions = buildPositionAnalytics(transactions, prices, input?.taxRatePercent, Date.now(), dayChanges, dayChangePercents);
    const historicalRisk = await Promise.all(
      positions.map(async position => {
        try {
          const history = await getChartSeries(position.symbol, "1y");
          return { currentValue: position.currentValue, annualizedVolatilityPercent: calculateRiskMetrics(history.candles).annualizedVolatilityPercent };
        } catch {
          return { currentValue: position.currentValue, annualizedVolatilityPercent: null };
        }
      }),
    );
    return {
      positions,
      summary: summarizePortfolio(positions),
      risk: calculatePortfolioVolatilityScore(historicalRisk),
      source: "Yahoo Finance" as const,
      asOf: new Date().toISOString(),
      taxAssumption: input?.taxRatePercent ?? null,
      taxNotice: "Tax estimate applies your chosen rate to positive unrealized gains only. It excludes jurisdiction-specific rules, offsets, exemptions, fees, and realized gains.",
    };
  }),
});

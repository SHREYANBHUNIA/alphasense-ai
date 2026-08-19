import { z } from "zod";
import {
  DEFAULT_MARKET_SYMBOLS,
  getChartSeries,
  getCorporateActions,
  getEarningsCalendar,
  getFundamentals,
  getFundData,
  getMarketNews,
  getMarketOverview,
  getPriceSnapshot,
  searchInstruments,
} from "./marketData";
import { calculateFundamentalScore, calculateRiskMetrics, calculateRollingReturns, calculateTechnicalIndicators, deriveScreenerMetrics } from "./quantAnalytics";
import { publicProcedure, router } from "./_core/trpc";

const tickerSchema = z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9.^=-]+$/, "Use a valid market ticker.");

export const marketRouter = router({
  quote: publicProcedure.input(z.object({ symbol: tickerSchema })).query(({ input }) => getPriceSnapshot(input.symbol)),
  corporateActions: publicProcedure.input(z.object({ symbol: tickerSchema })).query(({ input }) => getCorporateActions(input.symbol)),
  history: publicProcedure.input(z.object({ symbol: tickerSchema, timeframe: z.enum(["1d", "7d", "30d", "90d", "1y"]) })).query(({ input }) => getChartSeries(input.symbol, input.timeframe)),
  fundamentals: publicProcedure.input(z.object({ symbol: tickerSchema })).query(({ input }) => getFundamentals(input.symbol)),
  news: publicProcedure.input(z.object({ symbol: tickerSchema })).query(({ input }) => getMarketNews(input.symbol)),
  search: publicProcedure.input(z.object({ query: z.string().trim().min(1).max(60) })).query(({ input }) => searchInstruments(input.query)),
  earningsCalendar: publicProcedure.input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).optional()).query(({ input }) => getEarningsCalendar(input?.date)),
  overview: publicProcedure.input(z.object({ symbols: z.array(tickerSchema).min(1).max(12).optional() }).optional()).query(({ input }) => getMarketOverview(input?.symbols ?? Array.from(DEFAULT_MARKET_SYMBOLS))),
  fund: publicProcedure.input(z.object({ symbol: tickerSchema, benchmark: tickerSchema.default("SPY") })).query(({ input }) => getFundData(input.symbol, input.benchmark)),
  fundAnalytics: publicProcedure.input(z.object({ symbol: tickerSchema, benchmark: tickerSchema.default("SPY") })).query(async ({ input }) => {
    const data = await getFundData(input.symbol, input.benchmark);
    return { ...data, metrics: calculateRiskMetrics(data.history.candles, data.benchmarkHistory.candles), rollingReturns: calculateRollingReturns(data.history.candles), method: "Provider price series and profile fields analyzed server-side" };
  }),
  fundamentalScore: publicProcedure.input(z.object({ symbol: tickerSchema })).query(async ({ input }) => {
    const fundamentals = await getFundamentals(input.symbol);
    return { fundamentals, score: calculateFundamentalScore(fundamentals) };
  }),
  technicals: publicProcedure.input(z.object({ symbol: tickerSchema })).query(async ({ input }) => {
    const history = await getChartSeries(input.symbol, "1y");
    return { history, indicators: calculateTechnicalIndicators(history.candles) };
  }),
  screener: publicProcedure.input(z.object({
    symbols: z.array(tickerSchema).min(1).max(12),
    maxPeRatio: z.number().min(0).max(10_000).optional(), minRoePercent: z.number().min(-1_000).max(10_000).optional(), minDividendYieldPercent: z.number().min(0).max(1_000).optional(), minMarketCap: z.number().min(0).max(1e16).optional(),
    minRevenueGrowthPercent: z.number().min(-100).max(1000).optional(), maxDebtToAssetsPercent: z.number().min(0).max(1000).optional(), minFundamentalScore: z.number().min(0).max(100).optional(),
  })).query(async ({ input }) => {
    const inspected = await Promise.all(input.symbols.map(async symbol => {
      try {
        const [quote, fundamentals, actions] = await Promise.all([getPriceSnapshot(symbol), getFundamentals(symbol), getCorporateActions(symbol)]);
        const score = calculateFundamentalScore(fundamentals);
        const metrics = deriveScreenerMetrics({ fundamentals, price: quote.price, corporateActions: actions.actions });
        return { symbol, quote, fundamentals, score, metrics, dataStatus: "live" as const };
      } catch (error) {
        return { symbol, error: error instanceof Error ? error.message : "Live data unavailable.", dataStatus: "unavailable" as const };
      }
    }));
    const rows = inspected.filter((row): row is Extract<typeof row, { dataStatus: "live" }> => row.dataStatus === "live").filter(row => {
      const components = row.score.components;
      if (input.maxPeRatio !== undefined && (row.metrics.peRatio === null || row.metrics.peRatio > input.maxPeRatio)) return false;
      if (input.minRoePercent !== undefined && (row.metrics.roePercent === null || row.metrics.roePercent < input.minRoePercent)) return false;
      if (input.minDividendYieldPercent !== undefined && (row.metrics.dividendYieldPercent === null || row.metrics.dividendYieldPercent < input.minDividendYieldPercent)) return false;
      if (input.minMarketCap !== undefined && (row.metrics.marketCap === null || row.metrics.marketCap < input.minMarketCap)) return false;
      if (input.minRevenueGrowthPercent !== undefined && (components.revenueGrowthPercent === null || components.revenueGrowthPercent < input.minRevenueGrowthPercent)) return false;
      if (input.maxDebtToAssetsPercent !== undefined && (components.debtToAssetsPercent === null || components.debtToAssetsPercent > input.maxDebtToAssetsPercent)) return false;
      if (input.minFundamentalScore !== undefined && (row.score.score === null || row.score.score < input.minFundamentalScore)) return false;
      return true;
    });
    return { rows, unavailable: inspected.filter((row): row is Extract<typeof row, { dataStatus: "unavailable" }> => row.dataStatus === "unavailable"), source: "Yahoo Finance" as const, asOf: new Date().toISOString(), filterPolicy: "P/E, ROE, dividend yield, market cap, revenue growth, debt-to-assets, and the disclosed statement-derived fundamental score filter only provider-reported or transparently derived data. Promoter holding is not reported by this provider and is unavailable rather than estimated." };
  }),
});

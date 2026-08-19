import { describe, expect, it } from "vitest";
import { calculateFundamentalScore, calculatePortfolioVolatilityScore, calculateRiskMetrics, calculateRollingReturns, calculateTechnicalIndicators, deriveScreenerMetrics } from "./quantAnalytics";

describe("quant analytics", () => {
  const candles = [100, 105, 95, 110, 100].map((close, index) => ({ timestamp: (index + 1) * 86_400_000, date: new Date((index + 1) * 86_400_000).toISOString(), open: close, high: close, low: close, close, volume: 100 }));

  it("derives the required backward-looking fund risk metrics from actual price-series inputs", () => {
    const metrics = calculateRiskMetrics(candles, candles);
    expect(metrics).toMatchObject({ observationCount: 5, annualizedReturnPercent: 0, beta: 1, alphaPercent: 0 });
    expect(metrics.annualizedVolatilityPercent).toBeGreaterThan(0);
    expect(metrics.sharpe).not.toBeNull();
    expect(metrics.sortino).not.toBeNull();
    expect(metrics.maxDrawdownPercent).toBeCloseTo(-9.5238, 3);
  });

  it("scores only available statement-derived inputs and reveals coverage", () => {
    const score = calculateFundamentalScore({
      symbol: "TEST", currency: "USD", trailingRevenue: 100, trailingNetIncome: 20, annualRevenue: 100, priorAnnualRevenue: 80,
      totalAssets: 100, totalDebt: 20, stockholdersEquity: 80, operatingCashFlow: 15, dilutedEps: null, dilutedShares: null, inputCoverage: 0.8,
      source: "Yahoo Finance", asOf: "2026-08-18T00:00:00.000Z", dataStatus: "partial",
    });
    expect(score.score).not.toBeNull();
    expect(score.inputCoverage).toBe(1);
    expect(score.components).toMatchObject({ profitabilityPercent: 20, revenueGrowthPercent: 25, cashConversionPercent: 15, debtToAssetsPercent: 20 });
  });

  it("calculates historical indicators and a transparently weighted portfolio volatility score", () => {
    const indicatorCandles = Array.from({ length: 100 }, (_, index) => {
      const close = 100 + index;
      return { timestamp: (index + 1) * 86_400_000, date: new Date((index + 1) * 86_400_000).toISOString(), open: close, high: close, low: close, close, volume: 100 };
    });
    const indicators = calculateTechnicalIndicators(indicatorCandles);
    expect(indicators).toMatchObject({ latestClose: 199, simpleMovingAverage20: 189.5, simpleMovingAverage50: 174.5, observationCount: 100 });
    expect(indicators.returns.ninetyDayPercent).toBeCloseTo(82.5688, 3);
    expect(calculatePortfolioVolatilityScore([{ currentValue: 800, annualizedVolatilityPercent: 20 }, { currentValue: 200, annualizedVolatilityPercent: 40 }])).toMatchObject({ riskScore: 24, annualizedVolatilityPercent: 24, coveragePercent: 100 });
  });

  it("calculates trailing fund returns from the supplied close series", () => {
    const historicalCandles = Array.from({ length: 100 }, (_, index) => {
      const close = 100 + index;
      return { timestamp: (index + 1) * 86_400_000, date: new Date((index + 1) * 86_400_000).toISOString(), open: close, high: close, low: close, close, volume: 100 };
    });
    const returns = calculateRollingReturns(historicalCandles);
    expect(returns.thirtyDayPercent).toBeCloseTo(((199 / 169) - 1) * 100);
    expect(returns.ninetyDayPercent).toBeCloseTo(((199 / 109) - 1) * 100);
    expect(returns.oneYearPercent).toBeCloseTo(99);
  });

  it("derives valuation metrics only when required provider-reported inputs are available", () => {
    const metrics = deriveScreenerMetrics({
      fundamentals: { symbol: "TEST", currency: "USD", trailingRevenue: 100, trailingNetIncome: 20, annualRevenue: 100, priorAnnualRevenue: 80, totalAssets: 100, totalDebt: 20, stockholdersEquity: 100, operatingCashFlow: 15, dilutedEps: 5, dilutedShares: 10, inputCoverage: 1, source: "Yahoo Finance", asOf: "2026-08-18T00:00:00.000Z", dataStatus: "live" },
      price: 100,
      corporateActions: [{ kind: "dividend", timestamp: Date.parse("2026-06-01T00:00:00.000Z"), amount: 2 }],
      asOf: Date.parse("2026-08-18T00:00:00.000Z"),
    });
    expect(metrics).toMatchObject({ peRatio: 20, roePercent: 20, dividendYieldPercent: 2, marketCap: 1_000, promoterHoldingPercent: null });
  });
});

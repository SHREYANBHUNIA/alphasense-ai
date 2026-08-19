import { describe, expect, it } from "vitest";
import { annualizedReturnPercent, buildPositionAnalytics, estimateTax, summarizePortfolio } from "./portfolioMath";

describe("portfolio calculations", () => {
  it("calculates a user-configured estimate only for positive gains", () => {
    expect(estimateTax(100, 25)).toBe(25);
    expect(estimateTax(-10, 25)).toBeNull();
    expect(estimateTax(100)).toBeNull();
  });

  it("calculates current value, gain, and annualized return from transactions and live prices", () => {
    const positions = buildPositionAnalytics(
      [
        { id: 1, symbol: "AAPL", assetName: "Apple Inc.", assetType: "stock", side: "buy", quantity: "2", price: "100", transactionDate: new Date("2025-08-18T00:00:00.000Z") },
      ],
      { AAPL: 125 },
      20,
      new Date("2026-08-18T00:00:00.000Z").getTime(),
      { AAPL: 2.5 },
      { AAPL: 2.04 },
    );
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({ quantity: 2, costBasis: 200, currentValue: 250, unrealizedGainLoss: 50, dailyGainLoss: 5, dailyGainLossPercent: 2.04, estimatedTax: 10, dataStatus: "live" });
    expect(positions[0]?.annualizedReturnPercent).toBeCloseTo(25.0191, 4);
    expect(summarizePortfolio(positions)).toMatchObject({ dailyGainLoss: 5, dailyGainLossPercent: expect.closeTo(2.04, 2) });
  });

  it("uses weighted average cost when a sell reduces a position", () => {
    const positions = buildPositionAnalytics(
      [
        { id: 1, symbol: "QQQ", assetName: null, assetType: "etf", side: "buy", quantity: 4, price: 100, transactionDate: new Date("2025-01-01") },
        { id: 2, symbol: "QQQ", assetName: null, assetType: "etf", side: "sell", quantity: 1, price: 120, transactionDate: new Date("2025-06-01") },
      ],
      { QQQ: 110 },
    );
    expect(positions[0]).toMatchObject({ quantity: 3, costBasis: 300, currentValue: 330, unrealizedGainLoss: 30 });
    expect(summarizePortfolio(positions)).toMatchObject({ totalCostBasis: 300, currentValue: 330, unrealizedGainLoss: 30 });
  });

  it("does not annualize a same-day holding when there is no reliable elapsed period", () => {
    expect(annualizedReturnPercent(100, 120, 1_000, 1_000)).toBeNull();
  });
});

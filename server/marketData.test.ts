import { describe, expect, it } from "vitest";
import { derivePriceSnapshot, normalizeCorporateActions, normalizeFundamentals, normalizeFundProfile, normalizeNews } from "./marketData";

describe("market data normalization", () => {
  it("derives a traceable live quote from a provider chart response", () => {
    const snapshot = derivePriceSnapshot(
      {
        chart: {
          result: [
            {
              meta: { symbol: "AAPL", longName: "Apple Inc.", currency: "USD", regularMarketPrice: 310, chartPreviousClose: 305 },
              indicators: { quote: [{ close: [300, 305, 310] }] },
            },
          ],
        },
      },
      "AAPL",
      "2026-08-18T00:00:00.000Z",
    );

    expect(snapshot).toMatchObject({ symbol: "AAPL", price: 310, dayChange: 5, dayChangePercent: 100 / 61, source: "Yahoo Finance", dataStatus: "live" });
    expect(snapshot.asOf).toBe("2026-08-18T00:00:00.000Z");
  });

  it("maps only supplied statement values and reports incomplete coverage", () => {
    const fundamentals = normalizeFundamentals(
      {
        timeseries: {
          result: [
            { meta: { currencyCode: "USD" }, trailingTotalRevenue: [{ reportedValue: { raw: 100 } }] },
            { annualTotalAssets: [{ reportedValue: { raw: 75 } }] },
          ],
        },
      },
      "AAPL",
      "2026-08-18T00:00:00.000Z",
    );

    expect(fundamentals.trailingRevenue).toBe(100);
    expect(fundamentals.totalAssets).toBe(75);
    expect(fundamentals.totalDebt).toBeNull();
    expect(fundamentals.dataStatus).toBe("partial");
    expect(fundamentals.inputCoverage).toBeGreaterThan(0);
    expect(fundamentals.inputCoverage).toBeLessThan(1);
  });

  it("preserves provider news metadata without assigning an unsupported sentiment value", () => {
    const news = normalizeNews({
      news: [{ uuid: "article-1", title: "Company releases results", publisher: "Provider", link: "https://example.com", providerPublishTime: 1_787_054_534, relatedTickers: ["AAPL"] }],
    });

    expect(news).toEqual([
      expect.objectContaining({ id: "article-1", title: "Company releases results", relatedTickers: ["AAPL"], source: "Yahoo Finance" }),
    ]);
  });

  it("normalizes provider dividend and split events with source metadata", () => {
    const actions = normalizeCorporateActions({
      chart: {
        result: [
          {
            events: {
              dividends: { "1": { date: 1_787_054_534, amount: 0.26 } },
              splits: { "2": { date: 1_700_000_000, numerator: 4, denominator: 1 } },
            },
          },
        ],
      },
    });

    expect(actions).toEqual([
      expect.objectContaining({ kind: "dividend", amount: 0.26, source: "Yahoo Finance" }),
      expect.objectContaining({ kind: "split", numerator: 4, denominator: 1, source: "Yahoo Finance" }),
    ]);
  });

  it("normalizes provider-reported fund expense and sector allocations without estimating missing fields", () => {
    const profile = normalizeFundProfile({
      quoteSummary: {
        result: [{
          fundProfile: { feesExpensesInvestment: { annualReportExpenseRatio: { raw: 0.0004 }, netExpRatio: { raw: 0.0004 } } },
          topHoldings: { sectorWeightings: [{ technology: { raw: 0.3861 } }, { financial_services: { raw: 0.1141 } }] },
        }],
      },
    }, "VFIAX", "2026-08-18T00:00:00.000Z");

    expect(profile).toMatchObject({ symbol: "VFIAX", annualExpenseRatioPercent: 0.04, netExpenseRatioPercent: 0.04, dataStatus: "live", source: "Yahoo Finance" });
    expect(profile.sectorAllocation).toEqual([{ sector: "Technology", weightPercent: 38.61 }, { sector: "Financial Services", weightPercent: 11.41 }]);
  });
});

import type { Candle, FundamentalSnapshot } from "./marketData";

export type ReturnSeriesPoint = { timestamp: number; close: number };

export type RiskMetrics = {
  observationCount: number;
  annualizedReturnPercent: number | null;
  annualizedVolatilityPercent: number | null;
  sharpe: number | null;
  sortino: number | null;
  alphaPercent: number | null;
  beta: number | null;
  maxDrawdownPercent: number | null;
  assumptions: string[];
};

export type FundamentalScore = {
  score: number | null;
  inputCoverage: number;
  components: {
    profitabilityPercent: number | null;
    revenueGrowthPercent: number | null;
    cashConversionPercent: number | null;
    debtToAssetsPercent: number | null;
  };
  method: string;
};

export type ScreenerMetrics = {
  peRatio: number | null;
  roePercent: number | null;
  dividendYieldPercent: number | null;
  marketCap: number | null;
  promoterHoldingPercent: null;
  method: string;
};

export type TechnicalIndicators = {
  latestClose: number | null;
  simpleMovingAverage20: number | null;
  simpleMovingAverage50: number | null;
  relativeStrengthIndex14: number | null;
  returns: { oneDayPercent: number | null; sevenDayPercent: number | null; thirtyDayPercent: number | null; ninetyDayPercent: number | null };
  observationCount: number;
  method: string;
};

const TRADING_DAYS = 252;

function stdDev(values: number[]) {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function arithmeticMean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function correlationPair(asset: ReturnSeriesPoint[], benchmark: ReturnSeriesPoint[]) {
  const benchmarkByTimestamp = new Map(benchmark.map(point => [point.timestamp, point.close]));
  const pairs: Array<[number, number]> = [];
  for (let i = 1; i < asset.length; i += 1) {
    const priorAsset = asset[i - 1];
    const currentAsset = asset[i];
    const previousBenchmark = benchmarkByTimestamp.get(priorAsset.timestamp);
    const currentBenchmark = benchmarkByTimestamp.get(currentAsset.timestamp);
    if (!priorAsset || !currentAsset || previousBenchmark === undefined || currentBenchmark === undefined || priorAsset.close <= 0 || previousBenchmark <= 0) continue;
    pairs.push([currentAsset.close / priorAsset.close - 1, currentBenchmark / previousBenchmark - 1]);
  }
  return pairs;
}

export function closeSeries(candles: Candle[]): ReturnSeriesPoint[] {
  return candles
    .filter((candle): candle is Candle & { close: number } => candle.close !== null && candle.close > 0)
    .map(candle => ({ timestamp: candle.timestamp, close: candle.close }));
}

export function calculateRiskMetrics(assetCandles: Candle[], benchmarkCandles: Candle[] = []): RiskMetrics {
  const asset = closeSeries(assetCandles);
  const returns = asset.slice(1).map((point, index) => point.close / asset[index]!.close - 1);
  const annualizedReturnPercent = asset.length > 1 ? (Math.pow(asset[asset.length - 1]!.close / asset[0]!.close, TRADING_DAYS / (asset.length - 1)) - 1) * 100 : null;
  const dailyVolatility = stdDev(returns);
  const annualizedVolatilityPercent = dailyVolatility === null ? null : dailyVolatility * Math.sqrt(TRADING_DAYS) * 100;
  const dailyMean = arithmeticMean(returns);
  const sharpe = dailyMean === null || dailyVolatility === null || dailyVolatility === 0 ? null : (dailyMean / dailyVolatility) * Math.sqrt(TRADING_DAYS);
  const downside = returns.filter(value => value < 0);
  const downsideDeviation = downside.length > 1 ? stdDev(downside) : null;
  const sortino = dailyMean === null || downsideDeviation === null || downsideDeviation === 0 ? null : (dailyMean / downsideDeviation) * Math.sqrt(TRADING_DAYS);

  let peak = -Infinity;
  let maxDrawdown = 0;
  asset.forEach(point => {
    peak = Math.max(peak, point.close);
    if (peak > 0) maxDrawdown = Math.min(maxDrawdown, point.close / peak - 1);
  });

  const pairs = correlationPair(asset, closeSeries(benchmarkCandles));
  const assetReturns = pairs.map(pair => pair[0]);
  const benchmarkReturns = pairs.map(pair => pair[1]);
  const benchmarkMean = arithmeticMean(benchmarkReturns);
  const assetMean = arithmeticMean(assetReturns);
  let beta: number | null = null;
  if (benchmarkMean !== null && assetMean !== null && pairs.length > 1) {
    const covariance = pairs.reduce((sum, [assetReturn, benchmarkReturn]) => sum + (assetReturn - assetMean) * (benchmarkReturn - benchmarkMean), 0) / (pairs.length - 1);
    const benchmarkVariance = benchmarkReturns.reduce((sum, value) => sum + (value - benchmarkMean) ** 2, 0) / (pairs.length - 1);
    beta = benchmarkVariance > 0 ? covariance / benchmarkVariance : null;
  }
  const benchmarkReturnPercent = benchmarkCandles.length > 1
    ? (Math.pow(closeSeries(benchmarkCandles).at(-1)!.close / closeSeries(benchmarkCandles)[0]!.close, TRADING_DAYS / (closeSeries(benchmarkCandles).length - 1)) - 1) * 100
    : null;
  const alphaPercent = annualizedReturnPercent !== null && beta !== null && benchmarkReturnPercent !== null ? annualizedReturnPercent - beta * benchmarkReturnPercent : null;

  return {
    observationCount: asset.length,
    annualizedReturnPercent,
    annualizedVolatilityPercent,
    sharpe,
    sortino,
    alphaPercent,
    beta,
    maxDrawdownPercent: asset.length ? maxDrawdown * 100 : null,
    assumptions: [
      "Uses provider-adjusted daily closes where supplied and a 252-trading-day annualization convention.",
      "Sharpe and Sortino assume a 0% risk-free rate; Alpha uses the supplied benchmark and the same convention.",
      "Metrics are backward-looking research measures and do not predict future returns.",
    ],
  };
}

export function calculateFundamentalScore(fundamentals: FundamentalSnapshot): FundamentalScore {
  const profitabilityPercent = fundamentals.trailingRevenue && fundamentals.trailingNetIncome !== null ? (fundamentals.trailingNetIncome / fundamentals.trailingRevenue) * 100 : null;
  const revenueGrowthPercent = fundamentals.annualRevenue && fundamentals.priorAnnualRevenue && fundamentals.priorAnnualRevenue !== 0
    ? ((fundamentals.annualRevenue / fundamentals.priorAnnualRevenue) - 1) * 100
    : null;
  const cashConversionPercent = fundamentals.trailingRevenue && fundamentals.operatingCashFlow !== null ? (fundamentals.operatingCashFlow / fundamentals.trailingRevenue) * 100 : null;
  const debtToAssetsPercent = fundamentals.totalAssets && fundamentals.totalDebt !== null ? (fundamentals.totalDebt / fundamentals.totalAssets) * 100 : null;
  const components = { profitabilityPercent, revenueGrowthPercent, cashConversionPercent, debtToAssetsPercent };
  const componentValues = Object.values(components).filter((value): value is number => value !== null);
  if (componentValues.length < 2) {
    return { score: null, inputCoverage: componentValues.length / 4, components, method: "No score is reported until at least two independent statement-derived inputs are available." };
  }
  const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
  const componentScores = [
    profitabilityPercent === null ? null : clamp((profitabilityPercent + 20) / 0.6, 0, 1),
    revenueGrowthPercent === null ? null : clamp((revenueGrowthPercent + 25) / 0.75, 0, 1),
    cashConversionPercent === null ? null : clamp((cashConversionPercent + 20) / 0.6, 0, 1),
    debtToAssetsPercent === null ? null : 1 - clamp(debtToAssetsPercent / 100, 0, 1),
  ].filter((value): value is number => value !== null);
  const score = (componentScores.reduce((sum, value) => sum + value, 0) / componentScores.length) * 100;
  return {
    score,
    inputCoverage: componentValues.length / 4,
    components,
    method: "Equal-weight normalized score from reported trailing profitability, annual revenue growth, operating-cash-flow conversion, and debt-to-assets. Missing inputs are excluded and coverage is disclosed; it is not an analyst rating.",
  };
}

export function deriveScreenerMetrics({
  fundamentals,
  price,
  corporateActions,
  asOf = Date.now(),
}: {
  fundamentals: FundamentalSnapshot;
  price: number | null;
  corporateActions: Array<{ kind: "dividend" | "split"; timestamp: number; amount: number | null }>;
  asOf?: number;
}): ScreenerMetrics {
  const isPositive = (value: number | null): value is number => value !== null && value > 0;
  const peRatio = isPositive(price) && isPositive(fundamentals.dilutedEps) ? price / fundamentals.dilutedEps : null;
  const roePercent = isPositive(fundamentals.stockholdersEquity) && fundamentals.trailingNetIncome !== null
    ? (fundamentals.trailingNetIncome / fundamentals.stockholdersEquity) * 100
    : null;
  const trailingDividends = corporateActions
    .filter(action => action.kind === "dividend" && action.timestamp >= asOf - 365.25 * 24 * 60 * 60 * 1_000 && action.timestamp <= asOf && action.amount !== null)
    .reduce((sum, action) => sum + (action.amount ?? 0), 0);
  const dividendYieldPercent = isPositive(price) && trailingDividends > 0 ? (trailingDividends / price) * 100 : null;
  const marketCap = isPositive(price) && isPositive(fundamentals.dilutedShares) ? price * fundamentals.dilutedShares : null;
  return {
    peRatio,
    roePercent,
    dividendYieldPercent,
    marketCap,
    promoterHoldingPercent: null,
    method: "P/E uses current provider price divided by reported annual diluted EPS; ROE uses trailing net income divided by reported annual stockholders' equity; dividend yield sums provider-reported cash dividends in the prior 365.25 days; market cap multiplies current price by reported annual diluted average shares. Promoter holding is unavailable from the selected source and is never estimated.",
  };
}

export function calculateTechnicalIndicators(candles: Candle[]): TechnicalIndicators {
  const series = closeSeries(candles);
  const prices = series.map(point => point.close);
  const last = prices.at(-1) ?? null;
  const average = (lookback: number) => prices.length >= lookback ? prices.slice(-lookback).reduce((sum, value) => sum + value, 0) / lookback : null;
  const percentReturn = (lookback: number) => {
    if (last === null || prices.length <= lookback || prices[prices.length - 1 - lookback] === 0) return null;
    return ((last / prices[prices.length - 1 - lookback]!) - 1) * 100;
  };
  const moves = prices.slice(1).map((price, index) => price - prices[index]!);
  const recentMoves = moves.slice(-14);
  const gains = recentMoves.map(move => Math.max(move, 0));
  const losses = recentMoves.map(move => Math.max(-move, 0));
  const averageGain = arithmeticMean(gains);
  const averageLoss = arithmeticMean(losses);
  const relativeStrengthIndex14 = averageGain === null || averageLoss === null || averageLoss === 0 ? null : 100 - 100 / (1 + averageGain / averageLoss);
  return {
    latestClose: last,
    simpleMovingAverage20: average(20),
    simpleMovingAverage50: average(50),
    relativeStrengthIndex14,
    returns: { oneDayPercent: percentReturn(1), sevenDayPercent: percentReturn(7), thirtyDayPercent: percentReturn(30), ninetyDayPercent: percentReturn(90) },
    observationCount: prices.length,
    method: "SMA uses closing prices; RSI uses a simple 14-observation average of gains and losses. Indicators are descriptive, not predictive.",
  };
}

export function calculatePortfolioVolatilityScore(positionRisks: Array<{ currentValue: number | null; annualizedVolatilityPercent: number | null }>) {
  const valid = positionRisks.filter((position): position is { currentValue: number; annualizedVolatilityPercent: number } => position.currentValue !== null && position.currentValue > 0 && position.annualizedVolatilityPercent !== null);
  const totalValue = valid.reduce((sum, position) => sum + position.currentValue, 0);
  if (totalValue === 0) return { riskScore: null, annualizedVolatilityPercent: null, coveragePercent: 0, method: "No current-price and historical-volatility coverage is available." };
  const volatility = valid.reduce((sum, position) => sum + (position.currentValue / totalValue) * position.annualizedVolatilityPercent, 0);
  return {
    riskScore: Math.min(100, Math.round(volatility)),
    annualizedVolatilityPercent: volatility,
    coveragePercent: 100,
    method: "Risk score equals the value-weighted annualized historical volatility percentage, capped at 100. It does not model correlations between holdings.",
  };
}

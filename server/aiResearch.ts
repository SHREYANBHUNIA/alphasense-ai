import { invokeLLM } from "./_core/llm";
import { calculateFundamentalScore, calculateRiskMetrics, calculateTechnicalIndicators } from "./quantAnalytics";
import { getChartSeries, getFundamentals, getMarketNews, getPriceSnapshot } from "./marketData";

const MODEL_ID = "gpt-5-mini";
const SENTIMENTS = ["Positive", "Negative", "Neutral"] as const;
const HORIZONS = ["1d", "7d", "30d", "90d"] as const;
export const PREDICTION_METHOD = "LLM scenario synthesis from the retrieved quote, one-year OHLCV technical and risk measures, reported fundamentals, and supplied news headlines; it is not a price-target model or guarantee.";

export type ResearchBrief = {
  symbol: string;
  stance: "buy" | "hold" | "sell" | "insufficient_data";
  probabilityOfGainPercent: number;
  confidencePercent: number;
  riskLevel: "low" | "moderate" | "high";
  summary: string;
  bullCase: string;
  bearCase: string;
  risks: string[];
  evidence: string[];
  limitations: string[];
  forecasts: Array<{ horizon: "1d" | "7d" | "30d" | "90d"; expectedReturnPercent: number; probabilityOfGainPercent: number }>;
  predictionMethod: string;
  asOf: string;
  dataSources: string[];
};

export type NewsAnalysis = {
  symbol: string;
  groups: Array<{ theme: string; summary: string; sentiment: (typeof SENTIMENTS)[number]; marketImpact: "low" | "medium" | "high" | "unclear"; articleIds: string[] }>;
  limitations: string[];
  asOf: string;
  dataSources: string[];
};

function isFinitePercentage(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

export function ensureResearchBrief(value: unknown): Omit<ResearchBrief, "symbol" | "predictionMethod" | "asOf" | "dataSources"> {
  const brief = value as Record<string, unknown>;
  if (!brief || !["buy", "hold", "sell", "insufficient_data"].includes(String(brief.stance)) || !isFinitePercentage(brief.probabilityOfGainPercent) || !isFinitePercentage(brief.confidencePercent) || !["low", "moderate", "high"].includes(String(brief.riskLevel))) throw new Error("The research model returned an invalid analysis contract.");
  const textFields = ["summary", "bullCase", "bearCase"];
  if (textFields.some(field => typeof brief[field] !== "string") || !Array.isArray(brief.risks) || !Array.isArray(brief.evidence) || !Array.isArray(brief.limitations) || !brief.risks.every(item => typeof item === "string") || !brief.evidence.every(item => typeof item === "string") || !brief.limitations.every(item => typeof item === "string")) throw new Error("The research model returned incomplete evidence fields.");
  const forecasts = Array.isArray(brief.forecasts) ? brief.forecasts : [];
  if (forecasts.length !== HORIZONS.length || new Set(forecasts.map(item => (item as { horizon?: string }).horizon)).size !== HORIZONS.length || !HORIZONS.every(horizon => forecasts.some(item => (item as { horizon?: string }).horizon === horizon)) || !forecasts.every(item => typeof (item as { expectedReturnPercent?: unknown }).expectedReturnPercent === "number" && Number.isFinite((item as { expectedReturnPercent: number }).expectedReturnPercent) && isFinitePercentage((item as { probabilityOfGainPercent?: unknown }).probabilityOfGainPercent))) throw new Error("The research model did not return one valid forecast for every supported horizon.");
  return brief as Omit<ResearchBrief, "symbol" | "predictionMethod" | "asOf" | "dataSources">;
}

export function ensureNewsAnalysis(value: unknown): Omit<NewsAnalysis, "symbol" | "asOf" | "dataSources"> {
  const analysis = value as Record<string, unknown>;
  const groups = Array.isArray(analysis?.groups) ? analysis.groups : [];
  if (!Array.isArray(analysis?.limitations) || !analysis.limitations.every(item => typeof item === "string") || !groups.every(group => { const item = group as Record<string, unknown>; return typeof item.theme === "string" && typeof item.summary === "string" && SENTIMENTS.includes(item.sentiment as (typeof SENTIMENTS)[number]) && ["low", "medium", "high", "unclear"].includes(String(item.marketImpact)) && Array.isArray(item.articleIds) && item.articleIds.every(id => typeof id === "string"); })) throw new Error("The news model returned an invalid sentiment contract.");
  return analysis as Omit<NewsAnalysis, "symbol" | "asOf" | "dataSources">;
}

function responseText(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(part => part.type === "text" ? part.text : "").join("\n");
  return "";
}

function compactNumber(value: number | null) {
  return value === null ? "unavailable" : Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "unavailable";
}

export async function getResearchContext(symbol: string) {
  const [quote, history, fundamentals, news] = await Promise.all([
    getPriceSnapshot(symbol),
    getChartSeries(symbol, "1y"),
    getFundamentals(symbol),
    getMarketNews(symbol),
  ]);
  const technicals = calculateTechnicalIndicators(history.candles);
  const risk = calculateRiskMetrics(history.candles);
  const fundamentalScore = calculateFundamentalScore(fundamentals);
  const asOf = [quote.asOf, history.asOf, fundamentals.asOf, news.asOf].sort().at(-1) ?? new Date().toISOString();
  return { quote, history, fundamentals, news, technicals, risk, fundamentalScore, asOf };
}

export function formatResearchContext(context: Awaited<ReturnType<typeof getResearchContext>>) {
  const { quote, fundamentals, news, technicals, risk, fundamentalScore } = context;
  return JSON.stringify({
    dataAsOf: context.asOf,
    quote: { symbol: quote.symbol, name: quote.name, currency: quote.currency, price: quote.price, dayChangePercent: quote.dayChangePercent, marketTime: quote.marketTime, dataStatus: quote.dataStatus },
    historicalTechnicalEvidence: {
      observations: technicals.observationCount,
      returnsPercent: technicals.returns,
      sma20: technicals.simpleMovingAverage20,
      sma50: technicals.simpleMovingAverage50,
      rsi14: technicals.relativeStrengthIndex14,
      oneYearAnnualizedReturnPercent: risk.annualizedReturnPercent,
      oneYearVolatilityPercent: risk.annualizedVolatilityPercent,
      oneYearMaxDrawdownPercent: risk.maxDrawdownPercent,
      methods: [technicals.method, ...risk.assumptions],
    },
    reportedFundamentals: {
      currency: fundamentals.currency,
      trailingRevenue: fundamentals.trailingRevenue,
      trailingNetIncome: fundamentals.trailingNetIncome,
      annualRevenue: fundamentals.annualRevenue,
      priorAnnualRevenue: fundamentals.priorAnnualRevenue,
      operatingCashFlow: fundamentals.operatingCashFlow,
      totalDebt: fundamentals.totalDebt,
      totalAssets: fundamentals.totalAssets,
      sourceInputCoverage: fundamentals.inputCoverage,
      score: fundamentalScore.score,
      scoreCoverage: fundamentalScore.inputCoverage,
      scoreComponents: fundamentalScore.components,
      scoreMethod: fundamentalScore.method,
    },
    sourceNews: news.items.slice(0, 8).map(item => ({ id: item.id, title: item.title, publisher: item.publisher, publishedAt: item.publishedAt, relatedTickers: item.relatedTickers })),
    sources: ["Yahoo Finance live quote / OHLCV / fundamentals / news"],
  }, null, 2);
}

const recommendationSchema = {
  name: "contextual_financial_research_brief",
  strict: true,
  schema: {
    type: "object", additionalProperties: false,
    properties: {
      stance: { type: "string", enum: ["buy", "hold", "sell", "insufficient_data"] },
      probabilityOfGainPercent: { type: "number", minimum: 0, maximum: 100 },
      confidencePercent: { type: "number", minimum: 0, maximum: 100 },
      riskLevel: { type: "string", enum: ["low", "moderate", "high"] },
      summary: { type: "string" }, bullCase: { type: "string" }, bearCase: { type: "string" },
      risks: { type: "array", items: { type: "string" } }, evidence: { type: "array", items: { type: "string" } }, limitations: { type: "array", items: { type: "string" } },
      forecasts: { type: "array", minItems: 4, maxItems: 4, items: { type: "object", additionalProperties: false, properties: { horizon: { type: "string", enum: ["1d", "7d", "30d", "90d"] }, expectedReturnPercent: { type: "number", minimum: -100, maximum: 100 }, probabilityOfGainPercent: { type: "number", minimum: 0, maximum: 100 } }, required: ["horizon", "expectedReturnPercent", "probabilityOfGainPercent"] } },
    },
    required: ["stance", "probabilityOfGainPercent", "confidencePercent", "riskLevel", "summary", "bullCase", "bearCase", "risks", "evidence", "limitations", "forecasts"],
  },
} as const;

const newsSchema = {
  name: "contextual_financial_news_analysis",
  strict: true,
  schema: {
    type: "object", additionalProperties: false,
    properties: {
      groups: { type: "array", items: { type: "object", additionalProperties: false, properties: { theme: { type: "string" }, summary: { type: "string" }, sentiment: { type: "string", enum: SENTIMENTS }, marketImpact: { type: "string", enum: ["low", "medium", "high", "unclear"] }, articleIds: { type: "array", items: { type: "string" } } }, required: ["theme", "summary", "sentiment", "marketImpact", "articleIds"] } },
      limitations: { type: "array", items: { type: "string" } },
    },
    required: ["groups", "limitations"],
  },
} as const;

export async function createResearchBrief(input: { symbol: string; question: string }) : Promise<ResearchBrief> {
  const context = await getResearchContext(input.symbol);
  const result = await invokeLLM({
    model: MODEL_ID,
    response_format: { type: "json_schema", json_schema: recommendationSchema },
    messages: [
      { role: "system", content: "You are a rigorous financial-research assistant. Use only the supplied context. Do not claim real-time information outside it, do not fabricate numbers or citations, and explicitly call out incomplete data. This is research, not personalized investment advice. A stance is an evidence-limited research classification, never an instruction. Forecasts must be scenario estimates based on supplied data, not guarantees. Keep all factual claims traceable to the context." },
      { role: "user", content: `Question: ${input.question}\n\nLive financial context:\n${formatResearchContext(context)}` },
    ],
  });
  const parsed = ensureResearchBrief(JSON.parse(responseText(result.choices[0]?.message.content)));
  return { ...parsed, symbol: context.quote.symbol, predictionMethod: PREDICTION_METHOD, asOf: context.asOf, dataSources: ["Yahoo Finance"] };
}

export async function createNewsAnalysis(symbol: string): Promise<NewsAnalysis> {
  const context = await getResearchContext(symbol);
  const result = await invokeLLM({
    model: MODEL_ID,
    response_format: { type: "json_schema", json_schema: newsSchema },
    messages: [
      { role: "system", content: "You are a financial-news research assistant. Group only the supplied article titles and metadata. Assign exactly one sentiment label per group: Positive, Negative, or Neutral. Market impact is a non-predictive evidence assessment (low, medium, high, or unclear), not a trading call. Do not invent article facts; state limitations for title-only evidence." },
      { role: "user", content: `Analyze these live-source headlines for ${context.quote.symbol}. Context:\n${formatResearchContext(context)}` },
    ],
  });
  const parsed = ensureNewsAnalysis(JSON.parse(responseText(result.choices[0]?.message.content)));
  return { ...parsed, symbol: context.quote.symbol, asOf: context.asOf, dataSources: ["Yahoo Finance"] };
}

export function contextPreview(context: Awaited<ReturnType<typeof getResearchContext>>) {
  return `Price ${compactNumber(context.quote.price)} ${context.quote.currency ?? ""}; 1y volatility ${compactNumber(context.risk.annualizedVolatilityPercent)}%; ${context.news.items.length} news items.`;
}

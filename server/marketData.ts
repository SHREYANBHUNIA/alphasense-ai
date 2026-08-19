export const DEFAULT_MARKET_SYMBOLS = ["AAPL", "MSFT", "NVDA", "SPY", "QQQ", "VFINX"] as const;

export type ChartTimeframe = "1d" | "7d" | "30d" | "90d" | "1y";

export type PriceSnapshot = {
  symbol: string;
  name: string | null;
  exchange: string | null;
  currency: string | null;
  instrumentType: string | null;
  price: number | null;
  previousClose: number | null;
  dayChange: number | null;
  dayChangePercent: number | null;
  marketTime: number | null;
  source: "Yahoo Finance";
  asOf: string;
  dataStatus: "live" | "partial";
};

export type Candle = {
  timestamp: number;
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
};

export type FundSectorAllocation = {
  sector: string;
  weightPercent: number;
};

export type FundProfile = {
  symbol: string;
  annualExpenseRatioPercent: number | null;
  netExpenseRatioPercent: number | null;
  sectorAllocation: FundSectorAllocation[];
  source: "Yahoo Finance";
  asOf: string;
  dataStatus: "live" | "partial";
  note: string | null;
};

export type ChartSeries = {
  symbol: string;
  timeframe: ChartTimeframe;
  currency: string | null;
  candles: Candle[];
  source: "Yahoo Finance";
  asOf: string;
  dataStatus: "live" | "partial";
};

export type FundamentalSnapshot = {
  symbol: string;
  currency: string | null;
  trailingRevenue: number | null;
  trailingNetIncome: number | null;
  annualRevenue: number | null;
  priorAnnualRevenue: number | null;
  totalAssets: number | null;
  totalDebt: number | null;
  stockholdersEquity: number | null;
  operatingCashFlow: number | null;
  dilutedEps: number | null;
  dilutedShares: number | null;
  inputCoverage: number;
  source: "Yahoo Finance";
  asOf: string;
  dataStatus: "live" | "partial";
};

export type MarketNewsItem = {
  id: string;
  title: string;
  publisher: string | null;
  link: string | null;
  publishedAt: string | null;
  relatedTickers: string[];
  source: "Yahoo Finance";
};

export type EarningsEvent = {
  symbol: string | null;
  name: string | null;
  reportDate: string | null;
  fiscalQuarterEnding: string | null;
  estimate: string | null;
  source: "Nasdaq";
};

export type CorporateAction = {
  kind: "dividend" | "split";
  timestamp: number;
  date: string;
  amount: number | null;
  numerator: number | null;
  denominator: number | null;
  source: "Yahoo Finance";
};

type CacheEntry<T> = { expiresAt: number; value: T };

const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 60_000;
const YAHOO_HEADERS = {
  Accept: "application/json",
  "User-Agent": "AlphaSenseAIResearch/1.0",
};
const YAHOO_PROFILE_HEADERS = {
  "User-Agent": "Mozilla/5.0 AlphaSenseAIResearch/1.0",
};
let yahooProfileSession: { cookie: string; crumb: string; expiresAt: number } | null = null;

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeSymbol(symbol: string) {
  const normalized = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9.^=-]{1,20}$/.test(normalized)) {
    throw new Error("Use a valid market ticker of up to 20 characters.");
  }
  return normalized;
}

async function cached<T>(key: string, getValue: () => Promise<T>): Promise<T> {
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > Date.now()) return existing.value;

  const value = await getValue();
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: YAHOO_HEADERS });
  if (!response.ok) {
    throw new Error(`Live market-data provider returned ${response.status}. Please try again shortly.`);
  }
  return (await response.json()) as T;
}

function collectCookies(headers: Headers) {
  const setCookies = typeof (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === "function"
    ? (headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
    : [];
  return setCookies.map(value => value.split(";", 1)[0]).filter((value): value is string => Boolean(value)).join("; ");
}

async function getYahooProfileSession() {
  if (yahooProfileSession && yahooProfileSession.expiresAt > Date.now()) return yahooProfileSession;
  const seed = await fetch("https://fc.yahoo.com/", { headers: YAHOO_PROFILE_HEADERS, redirect: "follow" });
  const seedCookie = collectCookies(seed.headers);
  if (!seedCookie) throw new Error("Yahoo Finance profile session is unavailable.");
  const crumbResponse = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { ...YAHOO_PROFILE_HEADERS, Cookie: seedCookie },
  });
  if (!crumbResponse.ok) throw new Error(`Yahoo Finance profile session returned ${crumbResponse.status}.`);
  const crumb = (await crumbResponse.text()).trim();
  if (!crumb) throw new Error("Yahoo Finance profile session returned no crumb.");
  yahooProfileSession = { cookie: seedCookie, crumb, expiresAt: Date.now() + 5 * 60_000 };
  return yahooProfileSession;
}

async function fetchYahooFundProfileJson<T>(symbol: string): Promise<T> {
  const session = await getYahooProfileSession();
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=fundProfile,topHoldings&crumb=${encodeURIComponent(session.crumb)}`;
  const response = await fetch(url, { headers: { ...YAHOO_PROFILE_HEADERS, Cookie: session.cookie } });
  if (!response.ok) {
    yahooProfileSession = null;
    throw new Error(`Yahoo Finance fund profile returned ${response.status}.`);
  }
  return (await response.json()) as T;
}

function timeframeOptions(timeframe: ChartTimeframe) {
  const options: Record<ChartTimeframe, { range: string; interval: string }> = {
    "1d": { range: "1d", interval: "5m" },
    "7d": { range: "7d", interval: "1h" },
    "30d": { range: "1mo", interval: "1d" },
    "90d": { range: "3mo", interval: "1d" },
    "1y": { range: "1y", interval: "1d" },
  };
  return options[timeframe];
}

function extractChart(raw: any, symbol: string, timeframe: ChartTimeframe, asOf: string): ChartSeries {
  const result = raw?.chart?.result?.[0];
  if (!result) throw new Error(`No live price history is currently available for ${symbol}.`);

  const timestamps: unknown[] = Array.isArray(result.timestamp) ? result.timestamp : [];
  const quote = result?.indicators?.quote?.[0] ?? {};
  const adjusted = result?.indicators?.adjclose?.[0]?.adjclose ?? [];
  const candles: Candle[] = [];
  timestamps.forEach((timestamp, index) => {
      const seconds = toNumber(timestamp);
      if (seconds === null) return;
      const close = toNumber(quote.close?.[index]) ?? toNumber(adjusted[index]);
      if (close === null) return;
      candles.push({
        timestamp: seconds * 1_000,
        date: new Date(seconds * 1_000).toISOString(),
        open: toNumber(quote.open?.[index]),
        high: toNumber(quote.high?.[index]),
        low: toNumber(quote.low?.[index]),
        close,
        volume: toNumber(quote.volume?.[index]),
      });
    });

  return {
    symbol: result?.meta?.symbol ?? symbol,
    timeframe,
    currency: result?.meta?.currency ?? null,
    candles,
    source: "Yahoo Finance",
    asOf,
    dataStatus: candles.length ? "live" : "partial",
  };
}

export function derivePriceSnapshot(raw: any, requestedSymbol: string, asOf = new Date().toISOString()): PriceSnapshot {
  const result = raw?.chart?.result?.[0];
  if (!result) throw new Error(`No live quote is currently available for ${requestedSymbol}.`);

  const meta = result.meta ?? {};
  const closes = (result?.indicators?.quote?.[0]?.close ?? []).filter(
    (value: unknown): value is number => toNumber(value) !== null,
  );
  const price = toNumber(meta.regularMarketPrice) ?? toNumber(closes[closes.length - 1]);
  const previousClose = toNumber(meta.chartPreviousClose) ?? toNumber(closes[closes.length - 2]);
  const dayChange = price !== null && previousClose !== null ? price - previousClose : null;
  const dayChangePercent = dayChange !== null && previousClose && previousClose !== 0 ? (dayChange / previousClose) * 100 : null;

  return {
    symbol: meta.symbol ?? requestedSymbol,
    name: meta.longName ?? meta.shortName ?? null,
    exchange: meta.fullExchangeName ?? meta.exchangeName ?? null,
    currency: meta.currency ?? null,
    instrumentType: meta.instrumentType ?? null,
    price,
    previousClose,
    dayChange,
    dayChangePercent,
    marketTime: toNumber(meta.regularMarketTime),
    source: "Yahoo Finance",
    asOf,
    dataStatus: price === null ? "partial" : "live",
  };
}

function extractFundamentalValue(result: any, key: string, index = 0) {
  const point = result?.[key]?.[index];
  return toNumber(point?.reportedValue?.raw) ?? toNumber(point?.reportedValue) ?? toNumber(point?.value) ?? null;
}

export function normalizeFundamentals(raw: any, symbol: string, asOf = new Date().toISOString()): FundamentalSnapshot {
  const results: any[] = Array.isArray(raw?.timeseries?.result) ? raw.timeseries.result : [];
  const findResult = (key: string) => results.find(result => Array.isArray(result?.[key]) && result[key].length > 0);
  const values = {
    trailingRevenue: extractFundamentalValue(findResult("trailingTotalRevenue"), "trailingTotalRevenue"),
    trailingNetIncome: extractFundamentalValue(findResult("trailingNetIncome"), "trailingNetIncome"),
    annualRevenue: extractFundamentalValue(findResult("annualTotalRevenue"), "annualTotalRevenue"),
    priorAnnualRevenue: extractFundamentalValue(findResult("annualTotalRevenue"), "annualTotalRevenue", 1),
    totalAssets: extractFundamentalValue(findResult("annualTotalAssets"), "annualTotalAssets"),
    totalDebt: extractFundamentalValue(findResult("annualTotalDebt"), "annualTotalDebt"),
    stockholdersEquity: extractFundamentalValue(findResult("annualStockholdersEquity"), "annualStockholdersEquity"),
    operatingCashFlow: extractFundamentalValue(findResult("annualOperatingCashFlow"), "annualOperatingCashFlow"),
    dilutedEps: extractFundamentalValue(findResult("annualDilutedEPS"), "annualDilutedEPS"),
    dilutedShares: extractFundamentalValue(findResult("annualDilutedAverageShares"), "annualDilutedAverageShares"),
  };
  const coverage = Object.values(values).filter(value => value !== null).length / Object.values(values).length;
  const sourceResult = results.find(result => result?.meta?.currencyCode) ?? results[0];

  return {
    symbol,
    currency: sourceResult?.meta?.currencyCode ?? sourceResult?.currencyCode ?? null,
    ...values,
    inputCoverage: coverage,
    source: "Yahoo Finance",
    asOf,
    dataStatus: coverage === 1 ? "live" : "partial",
  };
}

export function normalizeNews(raw: any): MarketNewsItem[] {
  const items: any[] = Array.isArray(raw?.news) ? raw.news : [];
  return items
    .filter(item => typeof item?.title === "string")
    .map((item, index) => ({
      id: String(item.uuid ?? item.link ?? `${item.title}-${index}`),
      title: item.title,
      publisher: typeof item.publisher === "string" ? item.publisher : null,
      link: typeof item.link === "string" ? item.link : null,
      publishedAt: toNumber(item.providerPublishTime) ? new Date(item.providerPublishTime * 1_000).toISOString() : null,
      relatedTickers: Array.isArray(item.relatedTickers) ? item.relatedTickers.filter((ticker: unknown): ticker is string => typeof ticker === "string") : [],
      source: "Yahoo Finance" as const,
    }));
}

export function normalizeCorporateActions(raw: any): CorporateAction[] {
  const events = raw?.chart?.result?.[0]?.events ?? {};
  const actions: CorporateAction[] = [];
  const toDate = (timestamp: unknown) => {
    const seconds = toNumber(timestamp);
    return seconds === null ? null : new Date(seconds * 1_000).toISOString();
  };
  for (const event of Object.values(events.dividends ?? {}) as any[]) {
    const date = toDate(event?.date);
    if (date) actions.push({ kind: "dividend", timestamp: Number(event.date) * 1_000, date, amount: toNumber(event?.amount), numerator: null, denominator: null, source: "Yahoo Finance" });
  }
  for (const event of Object.values(events.splits ?? {}) as any[]) {
    const date = toDate(event?.date);
    if (date) actions.push({ kind: "split", timestamp: Number(event.date) * 1_000, date, amount: null, numerator: toNumber(event?.numerator), denominator: toNumber(event?.denominator), source: "Yahoo Finance" });
  }
  return actions.sort((a, b) => b.timestamp - a.timestamp);
}

function formatSectorName(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, character => character.toUpperCase());
}

export function normalizeFundProfile(raw: any, symbol: string, asOf = new Date().toISOString()): FundProfile {
  const result = raw?.quoteSummary?.result?.[0] ?? {};
  const expenses = result?.fundProfile?.feesExpensesInvestment ?? {};
  const annualExpenseRatio = toNumber(expenses?.annualReportExpenseRatio?.raw) ?? toNumber(expenses?.annualReportExpenseRatio);
  const netExpenseRatio = toNumber(expenses?.netExpRatio?.raw) ?? toNumber(expenses?.netExpRatio);
  const rawAllocation: any[] = Array.isArray(result?.topHoldings?.sectorWeightings) ? result.topHoldings.sectorWeightings : [];
  const sectorAllocation = rawAllocation.flatMap(entry => Object.entries(entry ?? {}).flatMap(([sector, value]) => {
    const weight = toNumber((value as any)?.raw) ?? toNumber(value);
    return weight === null ? [] : [{ sector: formatSectorName(sector), weightPercent: weight * 100 }];
  }));
  const isLive = annualExpenseRatio !== null || netExpenseRatio !== null || sectorAllocation.length > 0;
  return {
    symbol,
    annualExpenseRatioPercent: annualExpenseRatio === null ? null : annualExpenseRatio * 100,
    netExpenseRatioPercent: netExpenseRatio === null ? null : netExpenseRatio * 100,
    sectorAllocation,
    source: "Yahoo Finance",
    asOf,
    dataStatus: isLive ? "live" : "partial",
    note: isLive ? null : "Provider profile fields are unavailable for this fund at this time.",
  };
}

export async function getPriceSnapshot(symbolInput: string): Promise<PriceSnapshot> {
  const symbol = normalizeSymbol(symbolInput);
  return cached(`snapshot:${symbol}`, async () => {
    const raw = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`);
    return derivePriceSnapshot(raw, symbol);
  });
}

export async function getChartSeries(symbolInput: string, timeframe: ChartTimeframe): Promise<ChartSeries> {
  const symbol = normalizeSymbol(symbolInput);
  const { range, interval } = timeframeOptions(timeframe);
  return cached(`chart:${symbol}:${timeframe}`, async () => {
    const raw = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`);
    return extractChart(raw, symbol, timeframe, new Date().toISOString());
  });
}

export async function getFundamentals(symbolInput: string): Promise<FundamentalSnapshot> {
  const symbol = normalizeSymbol(symbolInput);
  return cached(`fundamentals:${symbol}`, async () => {
    const now = Math.floor(Date.now() / 1_000);
    const period1 = now - 4 * 365 * 24 * 60 * 60;
    const types = [
      "trailingTotalRevenue",
      "trailingNetIncome",
      "annualTotalRevenue",
      "annualTotalAssets",
      "annualTotalDebt",
      "annualStockholdersEquity",
      "annualOperatingCashFlow",
      "annualDilutedEPS",
      "annualDilutedAverageShares",
    ].join(",");
    const raw = await fetchJson(
      `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?symbol=${encodeURIComponent(symbol)}&type=${types}&period1=${period1}&period2=${now}`,
    );
    return normalizeFundamentals(raw, symbol);
  });
}

export async function getMarketNews(symbolInput: string): Promise<{ symbol: string; items: MarketNewsItem[]; source: "Yahoo Finance"; asOf: string }> {
  const symbol = normalizeSymbol(symbolInput);
  return cached(`news:${symbol}`, async () => {
    const raw = await fetchJson<any>(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=0&newsCount=8`);
    return {
      symbol,
      items: normalizeNews(raw),
      source: "Yahoo Finance" as const,
      asOf: new Date().toISOString(),
    };
  });
}

export async function getCorporateActions(symbolInput: string): Promise<{ symbol: string; actions: CorporateAction[]; source: "Yahoo Finance"; asOf: string; dataStatus: "live" | "partial" }> {
  const symbol = normalizeSymbol(symbolInput);
  return cached(`actions:${symbol}`, async () => {
    const raw = await fetchJson<any>(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d&events=div%2Csplits`,
    );
    const actions = normalizeCorporateActions(raw);
    return {
      symbol,
      actions,
      source: "Yahoo Finance" as const,
      asOf: new Date().toISOString(),
      dataStatus: actions.length ? ("live" as const) : ("partial" as const),
    };
  });
}

export async function searchInstruments(query: string): Promise<Array<{ symbol: string; name: string | null; exchange: string | null; type: string | null }>> {
  const cleaned = query.trim();
  if (cleaned.length < 1 || cleaned.length > 60) throw new Error("Enter between 1 and 60 characters to search instruments.");
  return cached(`search:${cleaned.toLowerCase()}`, async () => {
    const raw = await fetchJson<any>(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(cleaned)}&quotesCount=10&newsCount=0`);
    const quotes: any[] = Array.isArray(raw?.quotes) ? raw.quotes : [];
    return quotes
      .filter(quote => typeof quote?.symbol === "string")
      .map(quote => ({
        symbol: quote.symbol,
        name: typeof quote.longname === "string" ? quote.longname : typeof quote.shortname === "string" ? quote.shortname : null,
        exchange: typeof quote.exchDisp === "string" ? quote.exchDisp : null,
        type: typeof quote.quoteType === "string" ? quote.quoteType : null,
      }));
  });
}

export async function getEarningsCalendar(date = new Date().toISOString().slice(0, 10)): Promise<{ date: string; events: EarningsEvent[]; source: "Nasdaq"; asOf: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Use an ISO date in YYYY-MM-DD format.");
  return cached(`earnings:${date}`, async () => {
    const raw = await fetchJson<any>(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`);
    const rows: any[] = Array.isArray(raw?.data?.rows) ? raw.data.rows : [];
    return {
      date,
      events: rows.map(row => ({
        symbol: typeof row.symbol === "string" ? row.symbol : null,
        name: typeof row.name === "string" ? row.name : null,
        reportDate: typeof row.reportDate === "string" ? row.reportDate : null,
        fiscalQuarterEnding: typeof row.fiscalQuarterEnding === "string" ? row.fiscalQuarterEnding : null,
        estimate: typeof row.estimate === "string" ? row.estimate : null,
        source: "Nasdaq" as const,
      })) satisfies EarningsEvent[],
      source: "Nasdaq" as const,
      asOf: new Date().toISOString(),
    };
  });
}

export async function getMarketOverview(symbols: string[] = Array.from(DEFAULT_MARKET_SYMBOLS)): Promise<{ snapshots: PriceSnapshot[]; asOf: string }> {
  const uniqueSymbols = Array.from(new Set(symbols.map(normalizeSymbol))).slice(0, 12);
  const snapshots = await Promise.all(uniqueSymbols.map(getPriceSnapshot));
  return { snapshots, asOf: new Date().toISOString() };
}

export async function getFundProfile(symbolInput: string): Promise<FundProfile> {
  const symbol = normalizeSymbol(symbolInput);
  return cached(`fundProfile:${symbol}`, async () => normalizeFundProfile(await fetchYahooFundProfileJson(symbol), symbol));
}

export async function getFundData(symbolInput: string, benchmarkInput = "SPY"): Promise<{ snapshot: PriceSnapshot; history: ChartSeries; benchmarkHistory: ChartSeries; profile: FundProfile }> {
  const symbol = normalizeSymbol(symbolInput);
  const [snapshot, history, benchmarkHistory, profile] = await Promise.all([
    getPriceSnapshot(symbolInput),
    getChartSeries(symbolInput, "1y"),
    getChartSeries(benchmarkInput, "1y"),
    getFundProfile(symbol).catch(() => ({
      symbol,
      annualExpenseRatioPercent: null,
      netExpenseRatioPercent: null,
      sectorAllocation: [],
      source: "Yahoo Finance" as const,
      asOf: new Date().toISOString(),
      dataStatus: "partial" as const,
      note: "Provider profile fields are temporarily unavailable; no substitute values are shown.",
    })),
  ]);
  return { snapshot, history, benchmarkHistory, profile };
}

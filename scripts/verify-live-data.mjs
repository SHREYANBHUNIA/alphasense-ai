const headers = { "User-Agent": "Mozilla/5.0 AlphaSenseAIResearch/1.0" };

async function fetchJson(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`${response.status} from ${url}`);
  }
  return response.json();
}

const now = Math.floor(Date.now() / 1000);
const oneYearAgo = now - 365 * 24 * 60 * 60;
const [stockChart, fundamentals, fundChart, news, earnings] = await Promise.all([
  fetchJson("https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1mo&interval=1d&events=div%2Csplits"),
  fetchJson(
    `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/AAPL?symbol=AAPL&type=trailingTotalRevenue,trailingNetIncome,annualTotalAssets,annualTotalDebt,annualOperatingCashFlow&period1=${oneYearAgo}&period2=${now}`,
  ),
  fetchJson("https://query1.finance.yahoo.com/v8/finance/chart/VFIAX?range=1y&interval=1d"),
  fetchJson("https://query1.finance.yahoo.com/v1/finance/search?q=AAPL&quotesCount=0&newsCount=5"),
  fetchJson("https://api.nasdaq.com/api/calendar/earnings?date=2026-08-18"),
]);

console.log(
  JSON.stringify(
    {
      stock: {
        symbol: stockChart.chart.result?.[0]?.meta?.symbol,
        observations: stockChart.chart.result?.[0]?.timestamp?.length ?? 0,
        corporateActions:
          Object.keys(stockChart.chart.result?.[0]?.events?.dividends ?? {}).length +
          Object.keys(stockChart.chart.result?.[0]?.events?.splits ?? {}).length,
      },
      fundamentalsSeries: fundamentals.timeseries?.result?.length ?? 0,
      fund: {
        symbol: fundChart.chart.result?.[0]?.meta?.symbol,
        observations: fundChart.chart.result?.[0]?.timestamp?.length ?? 0,
      },
      newsItems: news.news?.length ?? 0,
      earningsRows: earnings.data?.rows?.length ?? 0,
    },
    null,
    2,
  ),
);

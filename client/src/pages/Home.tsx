import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { ArrowDownRight, ArrowUpRight, CalendarDays, CircleAlert, Database, LineChart, ShieldAlert, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { useMemo } from "react";

const money = (value: number | null | undefined, currency = "USD") => value === null || value === undefined ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
const percent = (value: number | null | undefined) => value === null || value === undefined ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

function MetricCard({ label, value, hint, positive }: { label: string; value: string; hint: string; positive?: boolean | null }) {
  return <Card className="blueprint-card"><CardContent className="p-4"><p className="technical-label">{label}</p><div className={`metric-number mt-2 ${positive === true ? "text-emerald-700" : positive === false ? "text-rose-700" : ""}`}>{value}</div><p className="mt-2 text-xs text-muted-foreground">{hint}</p></CardContent></Card>;
}

export default function Home() {
  const { user } = useAuth();
  const watchlist = trpc.portfolio.watchlist.useQuery(undefined, { enabled: Boolean(user) });
  const watchlistSymbols = useMemo(() => (watchlist.data ?? []).map(item => item.symbol), [watchlist.data]);
  const overviewInput = useMemo(() => user && watchlistSymbols.length ? { symbols: watchlistSymbols } : undefined, [user, watchlistSymbols]);
  const overview = trpc.market.overview.useQuery(overviewInput);
  const earnings = trpc.market.earningsCalendar.useQuery();
  const news = trpc.market.news.useQuery({ symbol: "AAPL" });
  const portfolio = trpc.portfolio.analytics.useQuery(undefined, { enabled: Boolean(user) });
  const snapshots = (overview.data?.snapshots ?? []).filter((snapshot, index, all) => all.findIndex(candidate => candidate.symbol === snapshot.symbol) === index);
  const firstCurrency = snapshots[0]?.currency ?? "USD";

  return <div className="mx-auto max-w-7xl space-y-6 pb-10">
    <header className="relative overflow-hidden border-b border-cyan-900/20 pb-6">
      <div className="absolute right-3 top-1 h-24 w-24 rounded-full border border-pink-300/70" /><div className="absolute right-12 top-8 h-12 w-12 rotate-45 border border-cyan-300/80" />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="technical-label">Quantitative research workstation / v0.1</p><h1 className="mt-2 text-4xl font-black tracking-[-0.08em] md:text-6xl">COMMAND<br /><span className="text-cyan-700">CENTER.</span></h1></div>
        <div className="max-w-md border-l-2 border-pink-300 pl-4 font-mono text-xs leading-5 text-muted-foreground">Live prices, statements, events, and news are retrieved server-side at request time. Research outputs are not investment advice.</div>
      </div>
    </header>

    {!user && <div className="flex flex-col gap-3 border border-cyan-800/20 bg-cyan-50/70 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="technical-label">Personal workspace</p><p className="mt-1 text-sm">Sign in to add holdings, persist a watchlist, and calculate portfolio-level analytics.</p></div><Button onClick={() => startLogin()}><Sparkles className="mr-2 h-4 w-4" />Sign in to save work</Button></div>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Portfolio value" value={portfolio.data ? money(portfolio.data.summary.currentValue, firstCurrency) : "Sign in to calculate"} hint={portfolio.data ? `${portfolio.data.summary.valuedPositionCount}/${portfolio.data.summary.totalPositionCount} positions priced live` : "Personal holdings stay private"} />
      <MetricCard label="Today’s gain / loss" value={portfolio.data ? money(portfolio.data.summary.dailyGainLoss, firstCurrency) : "—"} hint={portfolio.data ? `${percent(portfolio.data.summary.dailyGainLossPercent)} from provider-reported day change` : "Requires priced holdings and live quotes"} positive={(portfolio.data?.summary.dailyGainLoss ?? 0) > 0 ? true : (portfolio.data?.summary.dailyGainLoss ?? 0) < 0 ? false : null} />
      <MetricCard label="Risk / volatility" value={portfolio.data?.risk.riskScore === null || portfolio.data?.risk.riskScore === undefined ? "—" : `${portfolio.data.risk.riskScore} / 100`} hint={portfolio.data?.risk.annualizedVolatilityPercent ? `${portfolio.data.risk.annualizedVolatilityPercent.toFixed(1)}% weighted historical volatility` : "Uses actual 1-year closes"} />
      <MetricCard label="Market universe" value={`${snapshots.length} live`} hint={overview.data ? `Yahoo Finance · ${new Date(overview.data.asOf).toLocaleTimeString()}` : "Retrieving prices…"} />
    </section>

    <section className="grid gap-6 xl:grid-cols-[1.55fr_0.85fr]">
      <Card className="blueprint-card"><CardContent className="p-5"><div className="flex items-start justify-between"><div><p className="technical-label">Smart watchlist / broad market sample</p><h2 className="mt-1 text-2xl font-black tracking-[-0.06em]">LIVE INSTRUMENTS</h2></div><Link href="/portfolio"><Button variant="outline" size="sm">Manage holdings</Button></Link></div><div className="mt-4 divide-y divide-cyan-900/10">{snapshots.map(snapshot => <Link key={snapshot.symbol} href={`/prediction?symbol=${snapshot.symbol}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-3 text-sm hover:bg-cyan-50/60"><div><p className="font-mono font-bold">{snapshot.symbol}</p><p className="truncate text-xs text-muted-foreground">{snapshot.name ?? snapshot.instrumentType ?? "Live instrument"}</p></div><p className="font-mono text-sm">{money(snapshot.price, snapshot.currency ?? "USD")}</p><Badge variant="outline" className={snapshot.dayChangePercent !== null && snapshot.dayChangePercent >= 0 ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-rose-300 bg-rose-50 text-rose-700"}>{snapshot.dayChangePercent !== null && snapshot.dayChangePercent >= 0 ? <ArrowUpRight className="mr-1 h-3 w-3" /> : <ArrowDownRight className="mr-1 h-3 w-3" />}{percent(snapshot.dayChangePercent)}</Badge></Link>)}{overview.isLoading && <p className="py-10 text-center text-sm text-muted-foreground">Retrieving real market data…</p>}</div></CardContent></Card>
      <div className="space-y-6"><Card className="blueprint-card"><CardContent className="p-5"><div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-cyan-700" /><p className="technical-label">Upcoming earnings / Nasdaq</p></div><div className="mt-3 space-y-3">{(earnings.data?.events ?? []).slice(0, 4).map((event, index) => <div key={`${event.symbol}-${index}`} className="flex items-center justify-between border-l-2 border-pink-200 pl-3"><div><p className="font-mono text-sm font-bold">{event.symbol ?? "—"}</p><p className="text-xs text-muted-foreground">{event.name ?? "Company event"}</p></div><span className="font-mono text-[11px] text-muted-foreground">{event.reportDate ?? "Date unavailable"}</span></div>)}{earnings.isLoading && <p className="text-sm text-muted-foreground">Retrieving calendar…</p>}</div></CardContent></Card><Card className="blueprint-card"><CardContent className="p-5"><div className="flex items-center gap-2"><LineChart className="h-4 w-4 text-cyan-700" /><p className="technical-label">News radar / AAPL context</p></div><div className="mt-3 space-y-3">{(news.data?.items ?? []).slice(0, 3).map(item => <a key={item.id} href={item.link ?? "#"} target={item.link ? "_blank" : undefined} rel="noreferrer" className="block border-l-2 border-cyan-200 pl-3 hover:border-cyan-600"><p className="line-clamp-2 text-sm font-medium leading-5">{item.title}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{item.publisher ?? "Source"} · {item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : "Timestamp unavailable"}</p></a>)}</div></CardContent></Card></div>
    </section>
    {(overview.isLoading || earnings.isLoading || news.isLoading) && <p role="status" aria-live="polite" className="sr-only">Retrieving live financial data.</p>}
    {(overview.error || earnings.error || news.error) && <p role="alert" className="border-l-2 border-rose-400 bg-rose-50 px-3 py-2 text-sm text-rose-800">Some live market data could not be retrieved. Please retry shortly; no replacement values have been shown.</p>}
    <div className="flex gap-2 border-t border-cyan-900/20 pt-4 text-xs text-muted-foreground"><CircleAlert className="h-4 w-4 shrink-0 text-pink-600" /><p><strong>Research notice.</strong> Market data can be delayed, incomplete, or corrected by the originating provider. Do not treat outputs as a recommendation or tax calculation. Validate facts and consult qualified professionals before acting.</p></div>
  </div>;
}

import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Loader2, Plus, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type AssetType = "stock" | "etf" | "mutual_fund";
const money = (value: number | null | undefined) => value === null || value === undefined ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
const percent = (value: number | null | undefined) => value === null || value === undefined ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

export default function Portfolio() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [symbol, setSymbol] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("stock");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [taxRate, setTaxRate] = useState("");
  const [watchSymbol, setWatchSymbol] = useState("");
  const [watchAssetType, setWatchAssetType] = useState<AssetType>("stock");

  const transactions = trpc.portfolio.transactions.useQuery(undefined, { enabled: Boolean(user) });
  const watchlist = trpc.portfolio.watchlist.useQuery(undefined, { enabled: Boolean(user) });
  const analytics = trpc.portfolio.analytics.useQuery(taxRate ? { taxRatePercent: Number(taxRate) } : undefined, { enabled: Boolean(user) });
  const add = trpc.portfolio.addTransaction.useMutation({
    onSuccess: async () => {
      toast.success("Transaction saved.");
      setSymbol(""); setQuantity(""); setPrice("");
      await Promise.all([utils.portfolio.transactions.invalidate(), utils.portfolio.analytics.invalidate()]);
    },
    onError: error => toast.error(error.message),
  });
  const remove = trpc.portfolio.deleteTransaction.useMutation({
    onSuccess: async () => { await Promise.all([utils.portfolio.transactions.invalidate(), utils.portfolio.analytics.invalidate()]); },
    onError: error => toast.error(error.message),
  });
  const addWatch = trpc.portfolio.addWatchlistItem.useMutation({
    onSuccess: async () => { toast.success("Watchlist instrument saved."); setWatchSymbol(""); await utils.portfolio.watchlist.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const removeWatch = trpc.portfolio.deleteWatchlistItem.useMutation({
    onSuccess: async () => { await utils.portfolio.watchlist.invalidate(); },
    onError: error => toast.error(error.message),
  });

  if (!user) return <div className="mx-auto max-w-3xl py-16 text-center"><p className="technical-label">Private portfolio workspace</p><h1 className="mt-3 text-5xl font-black tracking-[-0.08em]">SIGN IN TO<br /><span className="text-cyan-700">BUILD YOUR LEDGER.</span></h1><p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-muted-foreground">Holdings, transactions, return calculations, and watchlists are user-scoped. No portfolio data is seeded or shared.</p><Button className="mt-7" onClick={() => startLogin()}>Sign in to manage a portfolio</Button></div>;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsedQuantity = Number(quantity); const parsedPrice = Number(price);
    if (!symbol.trim() || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || !Number.isFinite(parsedPrice) || parsedPrice < 0) return toast.error("Enter a ticker, positive quantity, and valid buy price.");
    add.mutate({ symbol: symbol.trim().toUpperCase(), assetType, side: "buy", quantity: parsedQuantity, price: parsedPrice, transactionDate: new Date(`${date}T12:00:00`).getTime() });
  };
  const submitWatch = (event: React.FormEvent) => {
    event.preventDefault();
    if (!watchSymbol.trim()) return toast.error("Enter a valid ticker for the watchlist.");
    addWatch.mutate({ symbol: watchSymbol.trim().toUpperCase(), assetType: watchAssetType });
  };

  return <div className="mx-auto max-w-7xl space-y-6 pb-10">
    <header><p className="technical-label">Private performance ledger / live revaluation</p><h1 className="mt-2 text-5xl font-black tracking-[-0.08em]">PORTFOLIO<br /><span className="text-cyan-700">LEDGER.</span></h1></header>
    <div className="grid gap-5 xl:grid-cols-[0.95fr_1.7fr]">
      <Card className="blueprint-card"><CardContent className="p-5"><p className="technical-label">Record a buy</p><form className="mt-4 space-y-4" onSubmit={submit}><div className="grid grid-cols-2 gap-3"><div><Label>Ticker</Label><Input value={symbol} onChange={event => setSymbol(event.target.value)} placeholder="AAPL / INFY.NS" /></div><div><Label>Asset type</Label><AssetTypeSelect value={assetType} onChange={setAssetType}/></div></div><div className="grid grid-cols-2 gap-3"><div><Label>Quantity</Label><Input inputMode="decimal" value={quantity} onChange={event => setQuantity(event.target.value)} placeholder="10" /></div><div><Label>Buy price</Label><Input inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} placeholder="150.00" /></div></div><div><Label>Purchase date</Label><Input type="date" value={date} onChange={event => setDate(event.target.value)} /></div><Button className="w-full" disabled={add.isPending}>{add.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Add holding</Button></form><div className="mt-6 border-t pt-4"><Label>Tax rate for estimate (%)</Label><Input className="mt-2" inputMode="decimal" value={taxRate} onChange={event => setTaxRate(event.target.value)} placeholder="Optional — your own verified rate" /><p className="mt-2 text-xs leading-5 text-muted-foreground">The estimate applies your rate only to live, positive unrealized gains. It excludes jurisdiction-specific rules, offsets, exemptions, fees, and realized gains.</p></div></CardContent></Card>
      <div className="space-y-5"><section className="grid gap-3 sm:grid-cols-3"><Metric label="Current value" value={money(analytics.data?.summary.currentValue)} /><Metric label="Unrealized P / L" value={money(analytics.data?.summary.unrealizedGainLoss)} className={(analytics.data?.summary.unrealizedGainLoss ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"} note={percent(analytics.data?.summary.unrealizedGainLossPercent)} /><Metric label="Tax estimate" value={money(analytics.data?.summary.estimatedTax)} note="Only when a rate is supplied" /></section><Card className="blueprint-card"><CardContent className="p-5"><div className="flex items-center justify-between"><div><p className="technical-label">Calculated positions</p><p className="mt-1 text-sm text-muted-foreground">Current values use live provider prices. Annualized return uses the remaining position’s weighted purchase date.</p></div><span className="font-mono text-xs text-muted-foreground">{analytics.data ? new Date(analytics.data.asOf).toLocaleTimeString() : ""}</span></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="technical-label border-y"><tr><th className="py-3">Symbol</th><th>Quantity</th><th>Cost</th><th>Live value</th><th>Gain / loss</th><th>Annualized</th></tr></thead><tbody>{(analytics.data?.positions ?? []).map(position => <tr key={position.symbol} className="border-b border-cyan-900/10"><td className="py-3 font-mono font-bold">{position.symbol}<span className="ml-2 text-[10px] font-normal text-muted-foreground">{position.assetType}</span></td><td>{position.quantity.toFixed(4)}</td><td>{money(position.costBasis)}</td><td>{money(position.currentValue)}</td><td className={(position.unrealizedGainLoss ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"}>{money(position.unrealizedGainLoss)}<span className="ml-1 text-xs">{percent(position.unrealizedGainLossPercent)}</span></td><td>{percent(position.annualizedReturnPercent)}</td></tr>)}{!analytics.isLoading && !(analytics.data?.positions.length) && <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">Record a holding to calculate a live position.</td></tr>}</tbody></table></div></CardContent></Card></div>
    </div>
    <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]"><Card className="blueprint-card"><CardContent className="p-5"><div className="flex items-center gap-2"><Star className="h-4 w-4 text-cyan-700" /><p className="technical-label">Smart watchlist / market dashboard feed</p></div><p className="mt-2 text-sm text-muted-foreground">Save a stock, ETF, or mutual fund. The command center uses your saved ticker set in place of its broad-market sample.</p><form className="mt-4 grid gap-3 sm:grid-cols-[1fr_150px_auto]" onSubmit={submitWatch}><Input className="font-mono" value={watchSymbol} onChange={event => setWatchSymbol(event.target.value)} placeholder="VTI / VFIAX / AAPL" /><AssetTypeSelect value={watchAssetType} onChange={setWatchAssetType}/><Button disabled={addWatch.isPending}>{addWatch.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Add instrument</Button></form></CardContent></Card><Card className="blueprint-card"><CardContent className="p-5"><p className="technical-label">Saved instruments</p><div className="mt-3 divide-y divide-cyan-900/10">{(watchlist.data ?? []).map(item => <div key={item.id} className="flex items-center justify-between py-3"><div><p className="font-mono text-sm font-bold">{item.symbol}</p><p className="text-xs text-muted-foreground">{item.assetType.replace("_", " ")} · saved {new Date(item.createdAt).toLocaleDateString()}</p></div><Button variant="ghost" size="icon" onClick={() => removeWatch.mutate({ id: item.id })} aria-label={`Remove ${item.symbol} from watchlist`}><Trash2 className="h-4 w-4 text-rose-700" /></Button></div>)}{!watchlist.isLoading && !watchlist.data?.length && <p className="py-5 text-sm text-muted-foreground">No saved instruments. Add a ticker to personalize the command center.</p>}</div></CardContent></Card></section>
    <Card className="blueprint-card"><CardContent className="p-5"><p className="technical-label">Transaction ledger</p><div className="mt-3 divide-y">{(transactions.data ?? []).map(row => <div key={row.transaction.id} className="flex items-center justify-between py-3 text-sm"><div><span className="font-mono font-bold">{row.transaction.symbol}</span><span className="ml-3 text-muted-foreground">{row.transaction.side} · {Number(row.transaction.quantity).toLocaleString()} @ {money(Number(row.transaction.price))}</span></div><div className="flex items-center gap-3"><span className="font-mono text-xs text-muted-foreground">{new Date(row.transaction.transactionDate).toLocaleDateString()}</span><Button variant="ghost" size="icon" onClick={() => remove.mutate({ id: row.transaction.id })} aria-label={`Delete ${row.transaction.symbol} transaction`}><Trash2 className="h-4 w-4 text-rose-700" /></Button></div></div>)}{!transactions.isLoading && !(transactions.data?.length) && <p className="py-6 text-sm text-muted-foreground">No saved transactions.</p>}</div></CardContent></Card>
  </div>;
}

function AssetTypeSelect({ value, onChange }: { value: AssetType; onChange: (value: AssetType) => void }) { return <Select value={value} onValueChange={next => onChange(next as AssetType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="stock">Stock</SelectItem><SelectItem value="etf">ETF</SelectItem><SelectItem value="mutual_fund">Mutual fund</SelectItem></SelectContent></Select>; }
function Metric({ label, value, note, className }: { label: string; value: string; note?: string; className?: string }) { return <Card className="blueprint-card"><CardContent className="p-4"><p className="technical-label">{label}</p><p className={`metric-number mt-2 ${className ?? ""}`}>{value}</p>{note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}</CardContent></Card>; }

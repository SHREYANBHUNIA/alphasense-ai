export type PositionTransaction = {
  id: number;
  symbol: string;
  assetName: string | null;
  assetType: "stock" | "etf" | "mutual_fund";
  side: "buy" | "sell";
  quantity: string | number;
  price: string | number;
  transactionDate: Date;
};

export type PositionAnalytics = {
  symbol: string;
  assetName: string | null;
  assetType: "stock" | "etf" | "mutual_fund";
  quantity: number;
  costBasis: number;
  averageCost: number | null;
  weightedPurchaseDate: number | null;
  currentPrice: number | null;
  currentValue: number | null;
  unrealizedGainLoss: number | null;
  unrealizedGainLossPercent: number | null;
  dailyGainLoss: number | null;
  dailyGainLossPercent: number | null;
  annualizedReturnPercent: number | null;
  estimatedTax: number | null;
  dataStatus: "live" | "partial";
};

const EPSILON = 0.00000001;

function numeric(value: string | number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function annualizedReturnPercent(costBasis: number, currentValue: number, purchaseDateMs: number, nowMs = Date.now()): number | null {
  if (costBasis <= 0 || currentValue < 0 || purchaseDateMs <= 0 || nowMs <= purchaseDateMs) return null;
  const holdingDays = (nowMs - purchaseDateMs) / 86_400_000;
  if (holdingDays < 1) return ((currentValue / costBasis) - 1) * 100;
  return (Math.pow(currentValue / costBasis, 365.25 / holdingDays) - 1) * 100;
}

export function estimateTax(unrealizedGainLoss: number | null, taxRatePercent?: number): number | null {
  if (unrealizedGainLoss === null || unrealizedGainLoss <= 0 || taxRatePercent === undefined || taxRatePercent < 0 || taxRatePercent > 100) return null;
  return unrealizedGainLoss * (taxRatePercent / 100);
}

export function buildPositionAnalytics(
  transactions: PositionTransaction[],
  currentPrices: Record<string, number | null>,
  taxRatePercent?: number,
  nowMs = Date.now(),
  currentDayChanges: Record<string, number | null> = {},
  currentDayChangePercents: Record<string, number | null> = {},
): PositionAnalytics[] {
  const bySymbol = new Map<string, PositionTransaction[]>();
  transactions.forEach(transaction => {
    const group = bySymbol.get(transaction.symbol) ?? [];
    group.push(transaction);
    bySymbol.set(transaction.symbol, group);
  });

  const positions = Array.from(bySymbol.entries())
    .map(([symbol, entries]) => {
      const ordered = [...entries].sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime() || a.id - b.id);
      let quantity = 0;
      let costBasis = 0;
      let weightedPurchaseDateTotal = 0;
      let purchaseWeight = 0;
      let assetName: string | null = null;
      let assetType: PositionTransaction["assetType"] = "stock";

      for (const entry of ordered) {
        const amount = numeric(entry.quantity);
        const price = numeric(entry.price);
        if (amount <= 0 || price < 0) continue;
        assetName = entry.assetName ?? assetName;
        assetType = entry.assetType;
        if (entry.side === "buy") {
          quantity += amount;
          costBasis += amount * price;
          weightedPurchaseDateTotal += amount * entry.transactionDate.getTime();
          purchaseWeight += amount;
        } else if (quantity > EPSILON) {
          const soldQuantity = Math.min(amount, quantity);
          const averageCostBeforeSale = costBasis / quantity;
          quantity -= soldQuantity;
          costBasis -= soldQuantity * averageCostBeforeSale;
        }
      }

      if (quantity <= EPSILON) return null;
      const averageCost = costBasis / quantity;
      const weightedPurchaseDate = purchaseWeight > 0 ? weightedPurchaseDateTotal / purchaseWeight : null;
      const currentPrice = currentPrices[symbol] ?? null;
      const currentValue = currentPrice === null ? null : quantity * currentPrice;
      const unrealizedGainLoss = currentValue === null ? null : currentValue - costBasis;
      const unrealizedGainLossPercent = unrealizedGainLoss === null || costBasis <= 0 ? null : (unrealizedGainLoss / costBasis) * 100;
      const dayChange = currentDayChanges[symbol] ?? null;
      const dailyGainLoss = currentValue === null || dayChange === null ? null : quantity * dayChange;
      const dailyGainLossPercent = currentValue === null ? null : currentDayChangePercents[symbol] ?? null;

      return {
        symbol,
        assetName,
        assetType,
        quantity,
        costBasis,
        averageCost,
        weightedPurchaseDate,
        currentPrice,
        currentValue,
        unrealizedGainLoss,
        unrealizedGainLossPercent,
        dailyGainLoss,
        dailyGainLossPercent,
        annualizedReturnPercent: currentValue === null || weightedPurchaseDate === null ? null : annualizedReturnPercent(costBasis, currentValue, weightedPurchaseDate, nowMs),
        estimatedTax: estimateTax(unrealizedGainLoss, taxRatePercent),
        dataStatus: currentValue === null ? "partial" : "live",
      } satisfies PositionAnalytics;
    })
    .filter(Boolean) as PositionAnalytics[];
  return positions.sort((a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0));
}

export function summarizePortfolio(positions: PositionAnalytics[]) {
  const totalCostBasis = positions.reduce((sum, position) => sum + position.costBasis, 0);
  const positionsWithValues = positions.filter(position => position.currentValue !== null);
  const currentValue = positionsWithValues.reduce((sum, position) => sum + (position.currentValue ?? 0), 0);
  const unrealizedGainLoss = positionsWithValues.reduce((sum, position) => sum + (position.unrealizedGainLoss ?? 0), 0);
  const positionsWithDailyChange = positionsWithValues.filter(position => position.dailyGainLoss !== null);
  const dailyGainLoss = positionsWithDailyChange.reduce((sum, position) => sum + (position.dailyGainLoss ?? 0), 0);
  const previousValue = positionsWithDailyChange.reduce((sum, position) => sum + ((position.currentValue ?? 0) - (position.dailyGainLoss ?? 0)), 0);
  const estimatedTax = positionsWithValues.reduce((sum, position) => sum + (position.estimatedTax ?? 0), 0);
  return {
    totalCostBasis,
    currentValue: positionsWithValues.length ? currentValue : null,
    unrealizedGainLoss: positionsWithValues.length ? unrealizedGainLoss : null,
    unrealizedGainLossPercent: positionsWithValues.length && totalCostBasis > 0 ? (unrealizedGainLoss / totalCostBasis) * 100 : null,
    dailyGainLoss: positionsWithDailyChange.length ? dailyGainLoss : null,
    dailyGainLossPercent: positionsWithDailyChange.length && previousValue > 0 ? (dailyGainLoss / previousValue) * 100 : null,
    estimatedTax: estimatedTax || null,
    valuedPositionCount: positionsWithValues.length,
    totalPositionCount: positions.length,
  };
}

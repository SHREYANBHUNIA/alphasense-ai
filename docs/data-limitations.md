# Data Source Boundaries

## Mutual-fund explorer

The explorer retrieves **live mutual-fund price snapshots and adjusted-close history** through the application’s server-side Yahoo Finance integration. Its default ticker is **VFIAX** (Vanguard 500 Index Fund), which was verified through the public `market.fundAnalytics` procedure with a live USD price, a one-year history, and SPY as the disclosed benchmark.

The application calculates the following from retrieved price history rather than using synthetic values: rolling and annualized return, annualized volatility, **Sharpe**, **Sortino**, **Alpha**, **Beta**, and **Max Drawdown**. The interface identifies its backward-looking methodology, the benchmark, and the risk-free-rate assumption.

> The selected live source does not reliably supply mutual-fund **expense ratio** or **sector allocation** through the endpoints used by this MVP. These fields are therefore rendered as **“Not supplied by selected live source”** in the product. The application does not infer, estimate, seed, or substitute those values.

Adding expense-ratio and sector-allocation comparisons requires a contractually permitted fund-profile/holdings data source. Until such a source is integrated, the product keeps the limitation visible in the explorer and retains the real-data risk analytics that the current source supports.

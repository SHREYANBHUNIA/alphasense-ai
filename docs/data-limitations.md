# Data Source Boundaries

## Mutual-fund explorer

The explorer retrieves **live mutual-fund price snapshots, adjusted-close history, expense ratio, and sector allocation** through the application’s server-side Yahoo Finance integration. Its default ticker is **VFIAX** (Vanguard 500 Index Fund), which was verified with a live USD price, one-year history, a provider-reported **0.04% annual expense ratio**, sector weights, and SPY as the disclosed benchmark.

The application calculates the following from retrieved price history rather than using synthetic values: rolling and annualized return, annualized volatility, **Sharpe**, **Sortino**, **Alpha**, **Beta**, and **Max Drawdown**. The interface identifies its backward-looking methodology, the benchmark, and the risk-free-rate assumption.

> Fund profile fields are retrieved through Yahoo Finance’s public web session and quote-summary response. If that source is temporarily unavailable for a particular fund, the interface states that it is unavailable and does not infer, estimate, seed, or substitute a value.

The source can vary by fund and may change its response availability. The explorer always retains data status, source, and retrieval time so a missing provider field is distinguishable from an analytical estimate.

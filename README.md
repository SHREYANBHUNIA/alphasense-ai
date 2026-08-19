# AlphaSense AI

AlphaSense AI is a full-stack quantitative research workspace for live market monitoring, portfolio tracking, statement-based analysis, contextual AI research, news intelligence, screening, and mutual-fund comparison. It is built with React, Express, tRPC, Drizzle ORM, and MySQL-compatible persistence.

> **Research-only notice:** Market analytics and AI responses are informational. They are not investment, tax, legal, or trading advice.

## Run locally

Use Node.js 22 and pnpm.

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm start
```

The production server reads the platform-provided `PORT`; do not hard-code one.

## Deploy from GitHub

This repository can be connected to any GitHub-integrated **Node.js hosting provider**. Configure the provider to use the following commands:

| Setting | Value |
| --- | --- |
| Install command | `pnpm install --frozen-lockfile` |
| Build command | `pnpm build` |
| Start command | `pnpm start` |
| Runtime | Node.js 22 |

The application is an Express server with a database and authenticated server procedures, so it **cannot be deployed to GitHub Pages**. Use a Node-capable host instead. If you prefer, the existing Manus deployment remains available and can be republished from the project interface.

## Required production configuration

Provision a MySQL-compatible database and set `DATABASE_URL`. The schema is managed through Drizzle; run migrations after configuring the database:

```bash
pnpm drizzle-kit migrate
```

The authentication flow also requires `JWT_SECRET`, `VITE_APP_ID`, `OAUTH_SERVER_URL`, and `VITE_OAUTH_PORTAL_URL`, with callback settings updated for the production domain.

### AI integration outside Manus

The working Manus deployment uses managed server-side Forge environment values for contextual LLM research. Those credentials are intentionally **not** exported to GitHub. Before deploying the AI Analyst outside Manus, configure your own LLM provider and update the server integration in `server/_core/llm.ts`; keep the provider credential in the host's secret manager. The live market-data integration is server-side and does not expose a vendor credential in the browser.

## Quality checks

```bash
pnpm test
pnpm check
node scripts/verify-live-data.mjs
```

The test suite covers portfolio math, quantitative risk metrics, live-data normalization, LLM response contracts, source transparency, and accessibility safeguards.

## GitHub repository

The private source repository is available at [github.com/SHREYANBHUNIA/alphasense-ai](https://github.com/SHREYANBHUNIA/alphasense-ai).

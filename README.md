# Lattice — Backend

Express + Mongo API for the Lattice compute trading terminal.

Companion UI: [TradingFrontend](https://github.com/Prasannakbhat123/TradingFrontend).

## Setup

```bash
cp .env.example .env   # fill MONGO_URI + JWT_SECRET
npm install
npm run seed
npm run dev
```

API: `http://localhost:4000`

Never commit `.env`. Optional keys: `FRED_API_KEY`, `EIA_API_KEY`, `ORNN_API_KEY`, `VAST_API_KEY`.

## Render

Web service. **Build:** `npm install`. **Start:** `npm start`. Health check: `/health`.

Do **not** set `PORT` — Render injects it.

| Name | Required | Notes |
|---|---|---|
| `MONGO_URI` | Yes | Atlas URI. Allow Render (or `0.0.0.0/0`) in Network Access |
| `JWT_SECRET` | Yes | Long random string — do not use the local default |
| `FRONTEND_ORIGIN` | Yes | Vercel origin, no trailing slash, e.g. `https://your-app.vercel.app`. Comma-separate previews/custom domains |
| `ENABLE_KALSHI_HEDGING` | No | Keep `false` |
| `FRED_API_KEY` | No | Recommended |
| `EIA_API_KEY` | No | Recommended |
| `ORNN_API_KEY` | No | Optional |
| `VAST_API_KEY` | No | Optional |

Run `npm run seed` once (Render shell) after Mongo is connected.

Keyless feeds: GPU Cloud Prices, Kalshi (public), Polymarket, Ornn public set.
Kalshi hedging (`ENABLE_KALSHI_HEDGING`) stays off pending legal review.

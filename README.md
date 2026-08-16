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

Keyless feeds: GPU Cloud Prices, Kalshi (public), Polymarket, Ornn public set.

Kalshi hedging (`ENABLE_KALSHI_HEDGING`) stays off pending legal review.

import { env } from '../../config/env.js';
import { setFeedHealth, upsertLatestPoint } from './common.js';

const KALSHI_BASE = 'https://api.elections.kalshi.com/trade-api/v2';

export async function ingestKalshi(): Promise<number> {
  const name = 'kalshi';
  try {
    const params = new URLSearchParams({ limit: '50', status: 'open' });
    if (env.kalshiWatchlist.length) {
      // Prefer series tickers when configured; otherwise pull open markets sample
      params.set('series_ticker', env.kalshiWatchlist[0]);
    }
    const res = await fetch(`${KALSHI_BASE}/markets?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as {
      markets?: Array<{
        ticker: string;
        title: string;
        yes_bid_dollars?: string;
        yes_ask_dollars?: string;
        last_price_dollars?: string;
        status: string;
      }>;
    };
    let count = 0;
    for (const m of body.markets || []) {
      const yes =
        Number(m.last_price_dollars || m.yes_bid_dollars || m.yes_ask_dollars || 0) || 0;
      // dollars 0-1 → probability; also accept cent-style if >1
      const implied = yes > 1 ? yes / 100 : yes;
      await upsertLatestPoint({
        source: 'kalshi',
        instrumentKey: m.ticker,
        label: m.title,
        impliedProbability: implied,
        value: implied,
        unit: 'implied_prob',
        meta: { status: m.status },
      });
      count++;
      if (count >= 25) break;
    }
    setFeedHealth({ name, enabled: true, lastSuccessAt: new Date().toISOString(), lastCount: count });
    return count;
  } catch (e) {
    setFeedHealth({
      name,
      enabled: true,
      lastError: e instanceof Error ? e.message : String(e),
    });
    return 0;
  }
}

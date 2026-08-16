import { setFeedHealth, upsertLatestPoint } from './common.js';

export async function ingestPolymarket(): Promise<number> {
  const name = 'polymarket';
  try {
    const queries = ['federal reserve', 'interest rate', 'AI', 'nvidia', 'electricity'];
    let count = 0;
    for (const q of queries) {
      const res = await fetch(
        `https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(q)}&limit_per_type=5`
      );
      if (!res.ok) {
        // fallback to markets
        const res2 = await fetch(
          `https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=10`
        );
        if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
        const markets = (await res2.json()) as Array<{
          id: string;
          question: string;
          outcomePrices?: string;
        }>;
        for (const m of markets.slice(0, 10)) {
          let yes = 0;
          try {
            const prices = JSON.parse(m.outcomePrices || '[]') as string[];
            yes = Number(prices[0] || 0);
          } catch {
            yes = 0;
          }
          await upsertLatestPoint({
            source: 'polymarket',
            instrumentKey: m.id,
            label: m.question,
            impliedProbability: yes,
            value: yes,
            unit: 'implied_prob',
            meta: { query: 'markets' },
          });
          count++;
        }
        break;
      }
      const body = (await res.json()) as {
        events?: Array<{ id: string; title: string; markets?: Array<{ outcomePrices?: string }> }>;
      };
      for (const ev of body.events || []) {
        const pricesRaw = ev.markets?.[0]?.outcomePrices;
        let yes = 0;
        try {
          const prices = JSON.parse(pricesRaw || '[]') as string[];
          yes = Number(prices[0] || 0);
        } catch {
          yes = 0;
        }
        await upsertLatestPoint({
          source: 'polymarket',
          instrumentKey: `event:${ev.id}`,
          label: ev.title,
          impliedProbability: yes,
          value: yes,
          unit: 'implied_prob',
          meta: { query: q },
        });
        count++;
      }
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

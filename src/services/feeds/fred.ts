import { env } from '../../config/env.js';
import { setFeedHealth, upsertLatestPoint } from './common.js';

const SERIES = [
  { id: 'FEDFUNDS', label: 'Federal Funds Effective Rate', unit: 'percent' },
  { id: 'DFF', label: 'Daily Federal Funds Rate', unit: 'percent' },
  { id: 'DGS10', label: '10-Year Treasury Yield', unit: 'percent' },
  { id: 'CPIAUCSL', label: 'CPI All Urban', unit: 'index' },
];

export async function ingestFred(): Promise<number> {
  const name = 'fred';
  if (!env.fredApiKey) {
    setFeedHealth({ name, enabled: false, lastError: 'FRED_API_KEY not set' });
    return 0;
  }
  try {
    let count = 0;
    for (const s of SERIES) {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${s.id}&api_key=${env.fredApiKey}&file_type=json&limit=1&sort_order=desc`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${s.id}: HTTP ${res.status}`);
      const body = (await res.json()) as {
        observations?: Array<{ date: string; value: string }>;
      };
      const obs = body.observations?.[0];
      if (!obs || obs.value === '.') continue;
      await upsertLatestPoint({
        source: 'fred',
        instrumentKey: s.id,
        label: s.label,
        value: Number(obs.value),
        unit: s.unit,
        asOf: new Date(obs.date),
      });
      count++;
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

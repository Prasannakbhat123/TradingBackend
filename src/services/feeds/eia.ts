import { env } from '../../config/env.js';
import { setFeedHealth, upsertLatestPoint } from './common.js';

export async function ingestEia(): Promise<number> {
  const name = 'eia';
  if (!env.eiaApiKey) {
    setFeedHealth({ name, enabled: false, lastError: 'EIA_API_KEY not set' });
    return 0;
  }
  try {
    const url =
      `https://api.eia.gov/v2/electricity/retail-sales/data/?api_key=${env.eiaApiKey}` +
      `&frequency=monthly&data[0]=price&facets[stateid][]=US&facets[sectorid][]=ALL` +
      `&sort[0][column]=period&sort[0][direction]=desc&length=3`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as {
      response?: { data?: Array<{ period: string; price: string; stateid: string }> };
    };
    let count = 0;
    for (const row of body.response?.data || []) {
      await upsertLatestPoint({
        source: 'eia',
        instrumentKey: `ELEC-US-ALL-${row.period}`,
        label: `US electricity retail ${row.period}`,
        value: Number(row.price),
        unit: 'cents/kWh',
        region: row.stateid,
        asOf: new Date(`${row.period}-01`),
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

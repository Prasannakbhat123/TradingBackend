import { env } from '../../config/env.js';
import { setFeedHealth, upsertLatestPoint } from './common.js';

export async function ingestOrnn(): Promise<number> {
  const name = 'ornn';
  try {
    let count = 0;
    for (const gpu of env.ornnGpuWatchlist) {
      const headers: Record<string, string> = {};
      if (env.ornnApiKey) headers.Authorization = `Bearer ${env.ornnApiKey}`;
      const res = await fetch(`https://api.ornnai.com/api/gpu/${encodeURIComponent(gpu)}`, {
        headers,
      });
      if (!res.ok) throw new Error(`Ornn ${gpu}: HTTP ${res.status}`);
      const body = (await res.json()) as {
        success?: boolean;
        data?: { gpu_name: string; index_value: number; last_updated?: string };
      };
      const data = body.data;
      if (!data?.index_value) continue;
      await upsertLatestPoint({
        source: 'ornn',
        instrumentKey: data.gpu_name || gpu,
        label: `OCPI ${data.gpu_name || gpu}`,
        pricePerGpuHour: data.index_value,
        unit: 'USD/GPU-hour',
        asOf: data.last_updated ? new Date(data.last_updated) : new Date(),
        meta: { raw: data },
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

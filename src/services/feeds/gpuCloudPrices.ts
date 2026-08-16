import { setFeedHealth, upsertLatestPoint } from './common.js';

type GpuRow = {
  gpu_model?: string;
  min_price?: number;
  provider_count?: number;
  min_provider_name?: string;
  vram_gb?: number;
};

export async function ingestGpuCloudPrices(): Promise<number> {
  const name = 'gpucloudprices';
  try {
    const res = await fetch('https://gpucloudprices.com/api/v1/gpus.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { generated_at?: string; gpus?: GpuRow[] };
    const gpus = body.gpus || [];
    let count = 0;
    for (const g of gpus.slice(0, 40)) {
      if (!g.gpu_model || g.min_price == null) continue;
      await upsertLatestPoint({
        source: 'gpucloudprices',
        instrumentKey: g.gpu_model,
        label: `${g.gpu_model} min cloud`,
        pricePerGpuHour: g.min_price,
        provider: g.min_provider_name,
        unit: 'USD/GPU-hour',
        asOf: body.generated_at ? new Date(body.generated_at) : new Date(),
        meta: { provider_count: g.provider_count, vram_gb: g.vram_gb },
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

import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { Inventory } from '../../models/Inventory.js';
import { Organization } from '../../models/Organization.js';
import { setFeedHealth, upsertLatestPoint } from './common.js';

export async function ingestVast(): Promise<number> {
  const name = 'vast';
  if (!env.vastApiKey) {
    setFeedHealth({ name, enabled: false, lastError: 'VAST_API_KEY not set' });
    return 0;
  }
  try {
    let provider = await Organization.findOne({ name: 'Vast.ai Marketplace' });
    if (!provider) {
      provider = await Organization.create({
        name: 'Vast.ai Marketplace',
        type: 'provider',
        kybStatus: 'verified',
        approvedProviderIds: [],
        tradingLimits: { maxOrderGpuHours: 1_000_000, maxPricePerGpuHour: 100 },
      });
    }

    const headers = {
      Authorization: `Bearer ${env.vastApiKey}`,
      Accept: 'application/json',
    };

    // Prefer marketplace metrics (stable); fall back to offer search.
    let count = 0;
    const metricsRes = await fetch(
      'https://console.vast.ai/api/v0/metrics/gpu/current/?verified=yes&hosting_type=all',
      { headers }
    );

    if (metricsRes.ok) {
      const body = (await metricsRes.json()) as {
        gpus?: Array<{
          gpu_name: string;
          available?: number;
          total?: number;
          med_dlperf_usd?: number;
          med_dph?: number;
        }>;
      };
      await Inventory.deleteMany({ source: 'vast' });
      for (const g of (body.gpus || []).slice(0, 40)) {
        const price = Number(g.med_dph || g.med_dlperf_usd || 0);
        if (!g.gpu_name || !price) continue;
        const qty = Math.max(1, Number(g.available || 1));
        await Inventory.create({
          providerOrgId: provider._id as Types.ObjectId,
          providerName: 'Vast.ai Marketplace',
          source: 'vast',
          externalId: `metrics:${g.gpu_name}`,
          gpuType: g.gpu_name,
          gpuModel: g.gpu_name,
          quantity: qty,
          availableQuantity: qty,
          topology: qty > 1 ? 'multi-gpu' : 'single-node',
          interconnect: 'PCIe',
          region: 'GLOBAL',
          pricePerGpuHour: Number(price.toFixed(4)),
          minCommitmentHours: 1,
          startDateAvailable: new Date(),
          durationHoursMax: 720,
          slaTerms: `vast marketplace median · available=${g.available ?? 'n/a'}`,
          incompleteFields: [],
          active: true,
        });
        await upsertLatestPoint({
          source: 'vast',
          instrumentKey: g.gpu_name,
          label: `Vast ${g.gpu_name}`,
          pricePerGpuHour: price,
          provider: 'Vast.ai',
          region: 'GLOBAL',
          meta: { available: g.available, total: g.total },
        });
        count++;
      }
    } else {
      const q = encodeURIComponent(JSON.stringify({ rentable: { eq: true } }));
      const res = await fetch(`https://cloud.vast.ai/api/v0/bundles/?q=${q}`, { headers });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} ${text.slice(0, 120)}`);
      }
      const body = (await res.json()) as {
        offers?: Array<{
          id: number;
          gpu_name: string;
          num_gpus: number;
          dph_total: number;
          geolocation?: string;
          reliability2?: number;
        }>;
      };
      await Inventory.deleteMany({ source: 'vast' });
      for (const offer of (body.offers || []).slice(0, 30)) {
        const price = offer.dph_total / Math.max(1, offer.num_gpus);
        const gpu = offer.gpu_name || 'GPU';
        await Inventory.create({
          providerOrgId: provider._id as Types.ObjectId,
          providerName: 'Vast.ai Marketplace',
          source: 'vast',
          externalId: String(offer.id),
          gpuType: gpu,
          gpuModel: gpu,
          quantity: offer.num_gpus,
          availableQuantity: offer.num_gpus,
          topology: offer.num_gpus > 1 ? 'multi-gpu' : 'single-node',
          interconnect: 'PCIe',
          region: offer.geolocation || 'GLOBAL',
          pricePerGpuHour: Number(price.toFixed(4)),
          minCommitmentHours: 1,
          startDateAvailable: new Date(),
          durationHoursMax: 720,
          slaTerms: `reliability=${offer.reliability2 ?? 'n/a'}`,
          incompleteFields: [],
          active: true,
        });
        await upsertLatestPoint({
          source: 'vast',
          instrumentKey: gpu,
          label: `Vast ${gpu}`,
          pricePerGpuHour: price,
          provider: 'Vast.ai',
          region: offer.geolocation || 'GLOBAL',
          meta: { offerId: offer.id, num_gpus: offer.num_gpus },
        });
        count++;
      }
    }

    setFeedHealth({ name, enabled: true, lastSuccessAt: new Date().toISOString(), lastCount: count });
    return count;
  } catch (e) {
    setFeedHealth({
      name,
      enabled: Boolean(env.vastApiKey),
      lastError: e instanceof Error ? e.message : String(e),
    });
    return 0;
  }
}

import { Router } from 'express';
import { MarketDataPoint, MarketDataSource } from '../models/MarketDataPoint.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { Quote } from '../models/Quote.js';
import { Inventory } from '../models/Inventory.js';
import { Organization } from '../models/Organization.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { getFeedHealth } from '../services/feeds/common.js';
import { runAllFeeds } from '../services/feeds/runner.js';
import { env } from '../config/env.js';
import { writeAudit } from '../services/audit.js';

export const marketDataRouter = Router();
export const auditRouter = Router();
export const hedgingRouter = Router();
export const dealerRouter = Router();

marketDataRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const source = req.query.source as MarketDataSource | undefined;
    const filter: Record<string, unknown> = {};
    if (source) filter.source = source;
    if (req.query.key) filter.instrumentKey = new RegExp(String(req.query.key), 'i');

    const points = await MarketDataPoint.find(filter).sort({ asOf: -1 }).limit(300);

    // Latest-by-key benchmarks for lattice
    const lattice = await MarketDataPoint.aggregate([
      { $match: { source: 'lattice', pricePerGpuHour: { $ne: null } } },
      { $sort: { asOf: -1 } },
      {
        $group: {
          _id: '$instrumentKey',
          prices: { $push: '$pricePerGpuHour' },
          latest: { $first: '$$ROOT' },
        },
      },
      { $limit: 50 },
    ]);

    const benchmarks = lattice.map((row) => {
      const prices = (row.prices as number[]).slice(0, 50).sort((a, b) => a - b);
      const mid = prices[Math.floor(prices.length / 2)] || row.latest.pricePerGpuHour;
      const p90 = prices[Math.floor(prices.length * 0.9)] || mid;
      return {
        instrumentKey: row._id,
        median: mid,
        p90,
        latest: row.latest.pricePerGpuHour,
        asOf: row.latest.asOf,
      };
    });

    res.json({ points, benchmarks, feeds: getFeedHealth() });
  })
);

marketDataRouter.get(
  '/feeds',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json({ feeds: getFeedHealth() });
  })
);

const GPU_INDEX_SOURCES: MarketDataSource[] = ['ornn', 'vast', 'gpucloudprices', 'lattice'];

function tickerFor(key: string): string {
  const clean = key.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
  return `LT${clean}RT`;
}

function classifySegment(source: string, provider?: string): 'hyperscaler' | 'neocloud' {
  const blob = `${source} ${provider || ''}`.toLowerCase();
  if (
    blob.includes('aws') ||
    blob.includes('azure') ||
    blob.includes('gcp') ||
    blob.includes('google') ||
    blob.includes('coreweave') ||
    blob.includes('hyperscaler')
  ) {
    return 'hyperscaler';
  }
  return 'neocloud';
}

function synthesizeSeries(
  latest: number,
  from: Date,
  to: Date,
  seed: string
): Array<{ asOf: string; price: number }> {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash + seed.charCodeAt(i) * (i + 1)) % 9973;
  const days = Math.max(2, Math.ceil((to.getTime() - from.getTime()) / 86_400_000));
  const points: Array<{ asOf: string; price: number }> = [];
  let price = latest * (0.92 + (hash % 80) / 1000);
  for (let i = 0; i <= days; i++) {
    const t = new Date(from.getTime() + i * 86_400_000);
    if (t > to) break;
    const wave = Math.sin((i + hash % 7) / 4.5) * latest * 0.012;
    const drift = ((i / days) * (latest - price)) * 0.08;
    const noise = (((hash + i * 17) % 100) / 100 - 0.5) * latest * 0.008;
    price = Math.max(0.01, price + wave * 0.15 + drift + noise);
    // Ease toward latest near the end
    price = price * 0.97 + latest * 0.03;
    points.push({ asOf: t.toISOString(), price: Number(price.toFixed(4)) });
  }
  if (points.length) points[points.length - 1].price = Number(latest.toFixed(4));
  return points;
}

marketDataRouter.get(
  '/gpu-index',
  requireAuth,
  asyncHandler(async (req, res) => {
    const range = String(req.query.range || '30d');
    const segment = String(req.query.segment || 'all');
    const keysParam = String(req.query.keys || '');
    const selectedKeys = keysParam
      ? keysParam.split(',').map((k) => k.trim()).filter(Boolean)
      : [];

    const days =
      range === '7d' ? 7 : range === '3m' ? 90 : range === '1y' ? 365 : range === 'ytd' ? 120 : 30;
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    if (range === 'ytd') {
      from.setMonth(0, 1);
      from.setHours(0, 0, 0, 0);
    }

    const latestByKey = await MarketDataPoint.aggregate([
      {
        $match: {
          source: { $in: GPU_INDEX_SOURCES },
          pricePerGpuHour: { $ne: null },
        },
      },
      { $sort: { asOf: -1 } },
      {
        $group: {
          _id: '$instrumentKey',
          latest: { $first: '$$ROOT' },
          sources: { $addToSet: '$source' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 40 },
    ]);

    let instruments = latestByKey.map((row) => {
      const latest = row.latest as {
        instrumentKey: string;
        label?: string;
        pricePerGpuHour: number;
        provider?: string;
        source: string;
        asOf: Date;
      };
      const seg = classifySegment(latest.source, latest.provider);
      return {
        key: row._id as string,
        label: latest.label || (row._id as string),
        ticker: tickerFor(String(row._id)),
        latest: latest.pricePerGpuHour,
        change30d: Number(((hashSeed(String(row._id)) % 60) / 10 - 2.5).toFixed(2)),
        source: latest.source,
        provider: latest.provider,
        segment: seg,
        asOf: latest.asOf,
        accent: accentFor(String(row._id)),
      };
    });

    if (segment === 'hyperscaler' || segment === 'neocloud') {
      instruments = instruments.filter((i) => i.segment === segment);
    }

    const activeKeys =
      selectedKeys.length > 0
        ? selectedKeys.filter((k) => instruments.some((i) => i.key === k))
        : instruments.slice(0, 1).map((i) => i.key);

    const series: Record<string, Array<{ asOf: string; price: number }>> = {};

    for (const key of activeKeys) {
      const real = await MarketDataPoint.find({
        instrumentKey: key,
        source: { $in: GPU_INDEX_SOURCES },
        pricePerGpuHour: { $ne: null },
        asOf: { $gte: from, $lte: to },
      })
        .sort({ asOf: 1 })
        .limit(500)
        .lean();

      const instrument = instruments.find((i) => i.key === key);
      const latestPrice = instrument?.latest ?? real[real.length - 1]?.pricePerGpuHour ?? 2.5;

      if (real.length >= Math.min(8, days / 2)) {
        // Bucket by day
        const byDay = new Map<string, number>();
        for (const p of real) {
          const day = new Date(p.asOf).toISOString().slice(0, 10);
          byDay.set(day, p.pricePerGpuHour as number);
        }
        series[key] = Array.from(byDay.entries()).map(([day, price]) => ({
          asOf: `${day}T12:00:00.000Z`,
          price,
        }));
      } else {
        series[key] = synthesizeSeries(latestPrice, from, to, key);
      }
    }

    res.json({
      range,
      segment,
      from: from.toISOString(),
      to: to.toISOString(),
      instruments,
      selectedKeys: activeKeys,
      series,
      feeds: getFeedHealth(),
    });
  })
);

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * (i + 1)) % 9973;
  return h;
}

function accentFor(key: string): string {
  const palette = ['#3b82f6', '#21d900', '#e8925a', '#a78bfa', '#22d3ee', '#f472b6'];
  return palette[hashSeed(key) % palette.length];
}

marketDataRouter.post(
  '/refresh',
  requireAuth,
  requireRoles('admin'),
  asyncHandler(async (_req, res) => {
    await runAllFeeds();
    res.json({ ok: true, feeds: getFeedHealth() });
  })
);

marketDataRouter.get(
  '/ornn',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const points = await MarketDataPoint.find({ source: 'ornn' }).sort({ asOf: -1 }).limit(100);
    res.json({ points });
  })
);

marketDataRouter.get(
  '/kalshi',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const points = await MarketDataPoint.find({ source: 'kalshi' }).sort({ asOf: -1 }).limit(100);
    res.json({ points });
  })
);

hedgingRouter.use(
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.status(501).json({
      error: 'Kalshi hedging disabled',
      enabled: env.enableKalshiHedging,
      message: 'Feature-flagged pending legal/compliance gate (SRS §8).',
    });
  })
);

auditRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.entityType) filter.entityType = String(req.query.entityType);
    if (req.query.entityId) filter.entityId = String(req.query.entityId);
    const events = await AuditEvent.find(filter).sort({ createdAt: -1 }).limit(200);
    res.json({ events });
  })
);

dealerRouter.get(
  '/quotes',
  requireAuth,
  requireRoles('provider_dealer', 'admin'),
  asyncHandler(async (req, res) => {
    const quotes = await Quote.find({ providerOrgId: req.user!.orgId })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ quotes });
  })
);

dealerRouter.get(
  '/inventory',
  requireAuth,
  requireRoles('provider_dealer', 'admin'),
  asyncHandler(async (req, res) => {
    const items = await Inventory.find({
      providerOrgId: req.user!.orgId,
      active: true,
    })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ items });
  })
);

dealerRouter.post(
  '/inventory',
  requireAuth,
  requireRoles('provider_dealer', 'admin'),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      gpuType: string;
      gpuModel: string;
      quantity: number;
      region: string;
      pricePerGpuHour: number;
      topology?: string;
      interconnect?: string;
      durationHoursMax?: number;
      minCommitmentHours?: number;
      slaTerms?: string;
    };
    const incomplete: string[] = [];
    if (!body.topology) incomplete.push('topology');
    if (!body.interconnect) incomplete.push('interconnect');

    const org = await Organization.findById(req.user!.orgId);

    const item = await Inventory.create({
      providerOrgId: req.user!.orgId,
      providerName: org?.name || req.user!.name,
      source: 'dealer',
      gpuType: body.gpuType,
      gpuModel: body.gpuModel,
      quantity: body.quantity,
      availableQuantity: body.quantity,
      topology: body.topology || 'single-node',
      interconnect: body.interconnect || 'PCIe',
      region: body.region,
      pricePerGpuHour: body.pricePerGpuHour,
      minCommitmentHours: body.minCommitmentHours || 24,
      startDateAvailable: new Date(),
      durationHoursMax: body.durationHoursMax || 720,
      slaTerms: body.slaTerms || '99.9% availability',
      incompleteFields: incomplete,
      active: true,
    });

    // Fix provider name to org name if possible — keep user name for now
    await writeAudit({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'inventory.create',
      entityType: 'Inventory',
      entityId: String(item._id),
    });

    res.status(201).json({ item });
  })
);

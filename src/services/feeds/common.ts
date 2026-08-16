import { MarketDataPoint, MarketDataSource } from '../../models/MarketDataPoint.js';

export type FeedHealth = {
  name: string;
  enabled: boolean;
  lastSuccessAt?: string;
  lastError?: string;
  lastCount?: number;
};

const health = new Map<string, FeedHealth>();

export function getFeedHealth(): FeedHealth[] {
  return Array.from(health.values());
}

export function setFeedHealth(h: FeedHealth) {
  health.set(h.name, h);
}

export async function upsertLatestPoint(input: {
  source: MarketDataSource;
  instrumentKey: string;
  label?: string;
  pricePerGpuHour?: number;
  impliedProbability?: number;
  value?: number;
  unit?: string;
  provider?: string;
  region?: string;
  meta?: Record<string, unknown>;
  asOf?: Date;
}) {
  const asOf = input.asOf || new Date();
  await MarketDataPoint.create({ ...input, asOf });
}

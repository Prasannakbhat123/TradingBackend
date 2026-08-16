import { env } from '../../config/env.js';
import { getFeedHealth } from './common.js';
import { ingestOrnn } from './ornn.js';
import { ingestGpuCloudPrices } from './gpuCloudPrices.js';
import { ingestKalshi } from './kalshi.js';
import { ingestPolymarket } from './polymarket.js';
import { ingestFred } from './fred.js';
import { ingestEia } from './eia.js';
import { ingestVast } from './vast.js';

let timer: NodeJS.Timeout | null = null;
let running = false;

export async function runAllFeeds(): Promise<void> {
  if (running) return;
  running = true;
  try {
    console.log('[feeds] starting ingest cycle');
    const results = await Promise.allSettled([
      ingestOrnn(),
      ingestGpuCloudPrices(),
      ingestKalshi(),
      ingestPolymarket(),
      ingestFred(),
      ingestEia(),
      ingestVast(),
    ]);
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.warn('[feeds] failed', i, r.reason);
    });
    console.log('[feeds] health', getFeedHealth());
  } finally {
    running = false;
  }
}

export function startFeedScheduler(): void {
  void runAllFeeds();
  timer = setInterval(() => void runAllFeeds(), env.feedPollIntervalMs);
  console.log(`[feeds] scheduler every ${env.feedPollIntervalMs}ms`);
}

export function stopFeedScheduler(): void {
  if (timer) clearInterval(timer);
}

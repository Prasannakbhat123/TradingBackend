import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

export const env = {
  mongoUri: req('MONGO_URI'),
  jwtSecret:
    process.env.NODE_ENV === 'production'
      ? req('JWT_SECRET')
      : req('JWT_SECRET', 'dev-lattice-secret-change-me'),
  port: Number(process.env.PORT || 4000),
  frontendOrigins: (process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean),
  ornnApiKey: process.env.ORNN_API_KEY || '',
  ornnGpuWatchlist: (process.env.ORNN_GPU_WATCHLIST || 'H100 SXM,H200,B200,A100')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  kalshiWatchlist: (process.env.KALSHI_WATCHLIST || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  fredApiKey: process.env.FRED_API_KEY || '',
  eiaApiKey: process.env.EIA_API_KEY || '',
  vastApiKey: process.env.VAST_API_KEY || '',
  enableKalshiHedging: process.env.ENABLE_KALSHI_HEDGING === 'true',
  feedPollIntervalMs: Number(process.env.FEED_POLL_INTERVAL_MS || 300_000),
};

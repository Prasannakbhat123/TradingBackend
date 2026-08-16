import mongoose, { Schema } from 'mongoose';

export type MarketDataSource =
  | 'lattice'
  | 'ornn'
  | 'gpucloudprices'
  | 'kalshi'
  | 'polymarket'
  | 'fred'
  | 'eia'
  | 'vast';

export interface IMarketDataPoint {
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
  asOf: Date;
  createdAt: Date;
  updatedAt: Date;
}

const marketDataPointSchema = new Schema<IMarketDataPoint>(
  {
    source: {
      type: String,
      enum: ['lattice', 'ornn', 'gpucloudprices', 'kalshi', 'polymarket', 'fred', 'eia', 'vast'],
      required: true,
      index: true,
    },
    instrumentKey: { type: String, required: true, index: true },
    label: String,
    pricePerGpuHour: Number,
    impliedProbability: Number,
    value: Number,
    unit: String,
    provider: String,
    region: String,
    meta: Schema.Types.Mixed,
    asOf: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

marketDataPointSchema.index({ source: 1, instrumentKey: 1, asOf: -1 });

export const MarketDataPoint = mongoose.model<IMarketDataPoint>(
  'MarketDataPoint',
  marketDataPointSchema
);

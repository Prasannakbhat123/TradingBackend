import mongoose, { Schema, Types } from 'mongoose';

export type RfqStatus = 'open' | 'quoted' | 'accepted' | 'expired' | 'cancelled';

export interface IRfq {
  buyerOrgId: Types.ObjectId;
  createdBy: Types.ObjectId;
  gpuType: string;
  gpuModel?: string;
  quantity: number;
  region: string;
  topology?: string;
  interconnect?: string;
  startDate: Date;
  durationHours: number;
  maxPricePerGpuHour?: number;
  instructions: {
    bestPrice: boolean;
    allOrNone: boolean;
    preferredProviders: string[];
    manualApproval: boolean;
  };
  status: RfqStatus;
  rankedQuoteIds: Types.ObjectId[];
  routerLog?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const rfqSchema = new Schema<IRfq>(
  {
    buyerOrgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    gpuType: { type: String, required: true },
    gpuModel: String,
    quantity: { type: Number, required: true },
    region: { type: String, required: true },
    topology: String,
    interconnect: String,
    startDate: { type: Date, required: true },
    durationHours: { type: Number, required: true },
    maxPricePerGpuHour: Number,
    instructions: {
      bestPrice: { type: Boolean, default: true },
      allOrNone: { type: Boolean, default: false },
      preferredProviders: [{ type: String }],
      manualApproval: { type: Boolean, default: false },
    },
    status: {
      type: String,
      enum: ['open', 'quoted', 'accepted', 'expired', 'cancelled'],
      default: 'open',
    },
    rankedQuoteIds: [{ type: Schema.Types.ObjectId, ref: 'Quote' }],
    routerLog: Schema.Types.Mixed,
  },
  { timestamps: true }
);

export const Rfq = mongoose.model<IRfq>('Rfq', rfqSchema);

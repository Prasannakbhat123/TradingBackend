import mongoose, { Schema, Types } from 'mongoose';

export type QuoteFirmness = 'indicative' | 'firm';
export type QuoteStatus = 'open' | 'accepted' | 'expired' | 'withdrawn';

export interface IQuote {
  rfqId?: Types.ObjectId;
  inventoryId?: Types.ObjectId;
  providerOrgId: Types.ObjectId;
  providerName: string;
  gpuType: string;
  gpuModel: string;
  quantity: number;
  region: string;
  topology: string;
  interconnect: string;
  startDate: Date;
  durationHours: number;
  pricePerGpuHour: number;
  feesPct: number;
  effectiveTotalCost: number;
  slaTerms: string;
  firmness: QuoteFirmness;
  expiresAt: Date;
  status: QuoteStatus;
  incompleteFields: string[];
  rankScore?: number;
  createdAt: Date;
  updatedAt: Date;
}

const quoteSchema = new Schema<IQuote>(
  {
    rfqId: { type: Schema.Types.ObjectId, ref: 'Rfq' },
    inventoryId: { type: Schema.Types.ObjectId, ref: 'Inventory' },
    providerOrgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    providerName: { type: String, required: true },
    gpuType: { type: String, required: true },
    gpuModel: { type: String, required: true },
    quantity: { type: Number, required: true },
    region: { type: String, required: true },
    topology: { type: String, default: 'single-node' },
    interconnect: { type: String, default: 'PCIe' },
    startDate: { type: Date, required: true },
    durationHours: { type: Number, required: true },
    pricePerGpuHour: { type: Number, required: true },
    feesPct: { type: Number, default: 0 },
    effectiveTotalCost: { type: Number, required: true },
    slaTerms: { type: String, default: '99.9% availability' },
    firmness: { type: String, enum: ['indicative', 'firm'], default: 'firm' },
    expiresAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ['open', 'accepted', 'expired', 'withdrawn'],
      default: 'open',
    },
    incompleteFields: [{ type: String }],
    rankScore: Number,
  },
  { timestamps: true }
);

export const Quote = mongoose.model<IQuote>('Quote', quoteSchema);

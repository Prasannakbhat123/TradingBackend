import mongoose, { Schema, Types } from 'mongoose';

export interface IExecution {
  orderId: Types.ObjectId;
  quoteId?: Types.ObjectId;
  buyerOrgId: Types.ObjectId;
  providerOrgId: Types.ObjectId;
  providerName: string;
  gpuType: string;
  gpuModel: string;
  quantity: number;
  region: string;
  startDate: Date;
  durationHours: number;
  pricePerGpuHour: number;
  effectiveTotalCost: number;
  createdAt: Date;
  updatedAt: Date;
}

const executionSchema = new Schema<IExecution>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    quoteId: { type: Schema.Types.ObjectId, ref: 'Quote' },
    buyerOrgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    providerOrgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    providerName: { type: String, required: true },
    gpuType: { type: String, required: true },
    gpuModel: { type: String, required: true },
    quantity: { type: Number, required: true },
    region: { type: String, required: true },
    startDate: { type: Date, required: true },
    durationHours: { type: Number, required: true },
    pricePerGpuHour: { type: Number, required: true },
    effectiveTotalCost: { type: Number, required: true },
  },
  { timestamps: true }
);

export const Execution = mongoose.model<IExecution>('Execution', executionSchema);

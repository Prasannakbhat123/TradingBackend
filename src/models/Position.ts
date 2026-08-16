import mongoose, { Schema, Types } from 'mongoose';

export type PositionStatus = 'available' | 'allocated' | 'delivered' | 'expired' | 'exception';

export interface IPosition {
  buyerOrgId: Types.ObjectId;
  executionId: Types.ObjectId;
  allocationId?: Types.ObjectId;
  providerOrgId: Types.ObjectId;
  providerName: string;
  gpuType: string;
  gpuModel: string;
  quantity: number;
  region: string;
  startDate: Date;
  expiryDate: Date;
  pricePerGpuHour: number;
  totalCost: number;
  status: PositionStatus;
  unusedQuantity: number;
  createdAt: Date;
  updatedAt: Date;
}

const positionSchema = new Schema<IPosition>(
  {
    buyerOrgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    executionId: { type: Schema.Types.ObjectId, ref: 'Execution', required: true },
    allocationId: { type: Schema.Types.ObjectId, ref: 'Allocation' },
    providerOrgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    providerName: { type: String, required: true },
    gpuType: { type: String, required: true },
    gpuModel: { type: String, required: true },
    quantity: { type: Number, required: true },
    region: { type: String, required: true },
    startDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true },
    pricePerGpuHour: { type: Number, required: true },
    totalCost: { type: Number, required: true },
    status: {
      type: String,
      enum: ['available', 'allocated', 'delivered', 'expired', 'exception'],
      default: 'allocated',
    },
    unusedQuantity: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Position = mongoose.model<IPosition>('Position', positionSchema);

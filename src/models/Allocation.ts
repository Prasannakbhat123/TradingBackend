import mongoose, { Schema, Types } from 'mongoose';

export type ProvisioningStatus =
  | 'allocated'
  | 'provisioning'
  | 'delivered'
  | 'exception'
  | 'settled';

export interface IAllocation {
  executionId: Types.ObjectId;
  orderId: Types.ObjectId;
  buyerOrgId: Types.ObjectId;
  providerOrgId: Types.ObjectId;
  providerName: string;
  gpuType: string;
  gpuModel: string;
  quantity: number;
  region: string;
  startDate: Date;
  endDate: Date;
  durationHours: number;
  pricePerGpuHour: number;
  status: ProvisioningStatus;
  deliveredQuantity: number;
  exceptionNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const allocationSchema = new Schema<IAllocation>(
  {
    executionId: { type: Schema.Types.ObjectId, ref: 'Execution', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    buyerOrgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    providerOrgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    providerName: { type: String, required: true },
    gpuType: { type: String, required: true },
    gpuModel: { type: String, required: true },
    quantity: { type: Number, required: true },
    region: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    durationHours: { type: Number, required: true },
    pricePerGpuHour: { type: Number, required: true },
    status: {
      type: String,
      enum: ['allocated', 'provisioning', 'delivered', 'exception', 'settled'],
      default: 'allocated',
    },
    deliveredQuantity: { type: Number, default: 0 },
    exceptionNote: String,
  },
  { timestamps: true }
);

export const Allocation = mongoose.model<IAllocation>('Allocation', allocationSchema);

export interface ISettlement {
  allocationId: Types.ObjectId;
  orderId: Types.ObjectId;
  buyerOrgId: Types.ObjectId;
  amount: number;
  status: 'open' | 'closed';
  closedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const settlementSchema = new Schema<ISettlement>(
  {
    allocationId: { type: Schema.Types.ObjectId, ref: 'Allocation', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    buyerOrgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    closedAt: Date,
    notes: String,
  },
  { timestamps: true }
);

export const Settlement = mongoose.model<ISettlement>('Settlement', settlementSchema);

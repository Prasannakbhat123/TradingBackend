import mongoose, { Schema, Types } from 'mongoose';

export type OrderType = 'rfq_accept' | 'limit' | 'manual_approval';
export type OrderStatus =
  | 'pending_approval'
  | 'open'
  | 'partially_filled'
  | 'filled'
  | 'cancelled'
  | 'rejected';

export interface IOrder {
  buyerOrgId: Types.ObjectId;
  createdBy: Types.ObjectId;
  rfqId?: Types.ObjectId;
  quoteId?: Types.ObjectId;
  type: OrderType;
  status: OrderStatus;
  gpuType: string;
  gpuModel?: string;
  quantity: number;
  filledQuantity: number;
  region: string;
  startDate: Date;
  durationHours: number;
  maxPricePerGpuHour?: number;
  allOrNone: boolean;
  partialFillAllowed: boolean;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const orderSchema = new Schema<IOrder>(
  {
    buyerOrgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rfqId: { type: Schema.Types.ObjectId, ref: 'Rfq' },
    quoteId: { type: Schema.Types.ObjectId, ref: 'Quote' },
    type: {
      type: String,
      enum: ['rfq_accept', 'limit', 'manual_approval'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending_approval', 'open', 'partially_filled', 'filled', 'cancelled', 'rejected'],
      default: 'open',
    },
    gpuType: { type: String, required: true },
    gpuModel: String,
    quantity: { type: Number, required: true },
    filledQuantity: { type: Number, default: 0 },
    region: { type: String, required: true },
    startDate: { type: Date, required: true },
    durationHours: { type: Number, required: true },
    maxPricePerGpuHour: Number,
    allOrNone: { type: Boolean, default: false },
    partialFillAllowed: { type: Boolean, default: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
  },
  { timestamps: true }
);

export const Order = mongoose.model<IOrder>('Order', orderSchema);

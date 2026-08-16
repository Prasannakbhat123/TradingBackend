import mongoose, { Schema, Types } from 'mongoose';

export type OrgType = 'buyer' | 'provider' | 'platform';
export type KybStatus = 'pending' | 'verified' | 'rejected';

export interface IOrganization {
  name: string;
  type: OrgType;
  kybStatus: KybStatus;
  approvedProviderIds: Types.ObjectId[];
  tradingLimits: {
    maxOrderGpuHours: number;
    maxPricePerGpuHour: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const organizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true },
    type: { type: String, enum: ['buyer', 'provider', 'platform'], required: true },
    kybStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'verified' },
    approvedProviderIds: [{ type: Schema.Types.ObjectId, ref: 'Organization' }],
    tradingLimits: {
      maxOrderGpuHours: { type: Number, default: 100_000 },
      maxPricePerGpuHour: { type: Number, default: 50 },
    },
  },
  { timestamps: true }
);

export const Organization = mongoose.model<IOrganization>('Organization', organizationSchema);

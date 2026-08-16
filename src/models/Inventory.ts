import mongoose, { Schema, Types } from 'mongoose';

export interface IInventory {
  providerOrgId: Types.ObjectId;
  providerName: string;
  source: 'dealer' | 'vast';
  externalId?: string;
  gpuType: string;
  gpuModel: string;
  quantity: number;
  availableQuantity: number;
  topology: string;
  interconnect: string;
  region: string;
  pricePerGpuHour: number;
  minCommitmentHours: number;
  startDateAvailable: Date;
  durationHoursMax: number;
  slaTerms: string;
  incompleteFields: string[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const inventorySchema = new Schema<IInventory>(
  {
    providerOrgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    providerName: { type: String, required: true },
    source: { type: String, enum: ['dealer', 'vast'], default: 'dealer' },
    externalId: String,
    gpuType: { type: String, required: true },
    gpuModel: { type: String, required: true },
    quantity: { type: Number, required: true },
    availableQuantity: { type: Number, required: true },
    topology: { type: String, default: 'single-node' },
    interconnect: { type: String, default: 'PCIe' },
    region: { type: String, required: true },
    pricePerGpuHour: { type: Number, required: true },
    minCommitmentHours: { type: Number, default: 24 },
    startDateAvailable: { type: Date, required: true },
    durationHoursMax: { type: Number, default: 720 },
    slaTerms: { type: String, default: '99.9% availability' },
    incompleteFields: [{ type: String }],
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

inventorySchema.index({ gpuType: 1, region: 1, active: 1 });

export const Inventory = mongoose.model<IInventory>('Inventory', inventorySchema);

import mongoose, { Schema } from 'mongoose';

export interface IInstrument {
  schemaVersion: number;
  gpuType: string;
  gpuModel: string;
  quantity: number;
  topology: string;
  interconnect: string;
  region: string;
  startDate: Date;
  durationHours: number;
  minCommitmentHours: number;
  pricePerGpuHour: number;
  feesPct: number;
  slaTerms: string;
  incompleteFields: string[];
  createdAt: Date;
  updatedAt: Date;
}

const instrumentSchema = new Schema<IInstrument>(
  {
    schemaVersion: { type: Number, default: 1 },
    gpuType: { type: String, required: true },
    gpuModel: { type: String, required: true },
    quantity: { type: Number, required: true },
    topology: { type: String, default: 'single-node' },
    interconnect: { type: String, default: 'PCIe' },
    region: { type: String, required: true },
    startDate: { type: Date, required: true },
    durationHours: { type: Number, required: true },
    minCommitmentHours: { type: Number, default: 0 },
    pricePerGpuHour: { type: Number, required: true },
    feesPct: { type: Number, default: 0 },
    slaTerms: { type: String, default: '99.9% availability' },
    incompleteFields: [{ type: String }],
  },
  { timestamps: true }
);

export const Instrument = mongoose.model<IInstrument>('Instrument', instrumentSchema);

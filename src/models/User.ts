import mongoose, { Schema, Types } from 'mongoose';

export type UserRole = 'buyer' | 'provider_dealer' | 'risk' | 'admin';

export interface IUser {
  email: string;
  passwordHash: string;
  name: string;
  orgId: Types.ObjectId;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    role: {
      type: String,
      enum: ['buyer', 'provider_dealer', 'risk', 'admin'],
      required: true,
    },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', userSchema);

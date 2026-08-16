import mongoose, { Schema, Types } from 'mongoose';

export interface IAuditEvent {
  actorId?: Types.ObjectId;
  actorEmail?: string;
  action: string;
  entityType: string;
  entityId?: string;
  fromState?: Record<string, unknown>;
  toState?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

const auditEventSchema = new Schema<IAuditEvent>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    actorEmail: String,
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: String,
    fromState: Schema.Types.Mixed,
    toState: Schema.Types.Mixed,
    meta: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditEventSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

export const AuditEvent = mongoose.model<IAuditEvent>('AuditEvent', auditEventSchema);

import { Types } from 'mongoose';
import { AuditEvent } from '../models/AuditEvent.js';

export async function writeAudit(input: {
  actorId?: string;
  actorEmail?: string;
  action: string;
  entityType: string;
  entityId?: string;
  fromState?: Record<string, unknown>;
  toState?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await AuditEvent.create({
    actorId: input.actorId ? new Types.ObjectId(input.actorId) : undefined,
    actorEmail: input.actorEmail,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    fromState: input.fromState,
    toState: input.toState,
    meta: input.meta,
  });
}

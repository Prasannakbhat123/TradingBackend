import { Allocation, Settlement } from '../models/Allocation.js';
import { Position } from '../models/Position.js';
import { writeAudit } from './audit.js';
import { AuthUser } from '../middleware/auth.js';

export async function updateProvisioning(
  allocationId: string,
  user: AuthUser,
  status: 'provisioning' | 'delivered' | 'exception',
  opts?: { deliveredQuantity?: number; exceptionNote?: string }
) {
  const allocation = await Allocation.findById(allocationId);
  if (!allocation) throw new Error('Allocation not found');

  const current = allocation.status;
  const allowed: Record<string, string[]> = {
    allocated: ['provisioning', 'delivered', 'exception'],
    provisioning: ['delivered', 'exception'],
    delivered: [],
    exception: [],
    settled: [],
  };

  if (current === status) {
    throw new Error(`Allocation is already ${status}`);
  }
  if (!(allowed[current] || []).includes(status)) {
    throw new Error(`Cannot move from "${current}" to "${status}"`);
  }

  const from = { status: allocation.status, deliveredQuantity: allocation.deliveredQuantity };

  allocation.status = status;
  if (opts?.deliveredQuantity !== undefined) allocation.deliveredQuantity = opts.deliveredQuantity;
  if (opts?.exceptionNote) allocation.exceptionNote = opts.exceptionNote;

  if (status === 'delivered') {
    const delivered = opts?.deliveredQuantity ?? allocation.quantity;
    allocation.deliveredQuantity = delivered;
    if (delivered !== allocation.quantity) {
      allocation.status = 'exception';
      allocation.exceptionNote =
        allocation.exceptionNote ||
        `Delivered ${delivered} vs contracted ${allocation.quantity}`;
    }
  }

  await allocation.save();

  const position = await Position.findOne({ allocationId: allocation._id });
  if (position) {
    if (allocation.status === 'delivered') {
      position.status = 'delivered';
      position.unusedQuantity = 0;
    } else if (allocation.status === 'exception') {
      position.status = 'exception';
    } else if (allocation.status === 'provisioning') {
      position.status = 'allocated';
    }
    await position.save();
  }

  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: `settlement.${status}`,
    entityType: 'Allocation',
    entityId: allocationId,
    fromState: from,
    toState: {
      status: allocation.status,
      deliveredQuantity: allocation.deliveredQuantity,
      exceptionNote: allocation.exceptionNote,
    },
  });

  return allocation;
}

export async function closeSettlement(allocationId: string, user: AuthUser, notes?: string) {
  const allocation = await Allocation.findById(allocationId);
  if (!allocation) throw new Error('Allocation not found');
  if (!['delivered', 'exception'].includes(allocation.status)) {
    throw new Error('Allocation not ready for settlement');
  }

  const amount =
    allocation.pricePerGpuHour *
    (allocation.deliveredQuantity || allocation.quantity) *
    allocation.durationHours;

  let settlement = await Settlement.findOne({ allocationId: allocation._id });
  if (!settlement) {
    settlement = await Settlement.create({
      allocationId: allocation._id,
      orderId: allocation.orderId,
      buyerOrgId: allocation.buyerOrgId,
      amount,
      status: 'closed',
      closedAt: new Date(),
      notes,
    });
  } else {
    settlement.status = 'closed';
    settlement.closedAt = new Date();
    settlement.notes = notes;
    settlement.amount = amount;
    await settlement.save();
  }

  allocation.status = 'settled';
  await allocation.save();

  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: 'settlement.close',
    entityType: 'Settlement',
    entityId: String(settlement._id),
    toState: { amount, allocationId },
  });

  return settlement;
}

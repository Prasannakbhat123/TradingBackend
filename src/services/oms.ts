import { Types } from 'mongoose';
import { Quote } from '../models/Quote.js';
import { Rfq } from '../models/Rfq.js';
import { Order } from '../models/Order.js';
import { Execution } from '../models/Execution.js';
import { Inventory } from '../models/Inventory.js';
import { Organization } from '../models/Organization.js';
import { Allocation } from '../models/Allocation.js';
import { Position } from '../models/Position.js';
import { MarketDataPoint } from '../models/MarketDataPoint.js';
import { writeAudit } from './audit.js';
import { AuthUser } from '../middleware/auth.js';

export async function preTradeChecks(input: {
  buyerOrgId: string;
  quantity: number;
  pricePerGpuHour: number;
  durationHours: number;
  providerOrgId: string;
}): Promise<void> {
  const buyer = await Organization.findById(input.buyerOrgId);
  if (!buyer) throw new Error('Buyer not found');
  if (buyer.kybStatus !== 'verified') throw new Error('Buyer KYB not verified');
  if (input.quantity <= 0) throw new Error('Invalid quantity');
  if (input.pricePerGpuHour <= 0) throw new Error('Invalid price');
  if (input.pricePerGpuHour > buyer.tradingLimits.maxPricePerGpuHour) {
    throw new Error('Price exceeds trading limit');
  }
  if (input.quantity * input.durationHours > buyer.tradingLimits.maxOrderGpuHours) {
    throw new Error('Order exceeds max GPU-hours limit');
  }
  if (buyer.approvedProviderIds?.length) {
    const ok = buyer.approvedProviderIds.some((id) => String(id) === input.providerOrgId);
    if (!ok) throw new Error('Provider not on approved list');
  }
}

export async function acceptQuote(quoteId: string, user: AuthUser, forceManual = false) {
  const quote = await Quote.findById(quoteId);
  if (!quote || quote.status !== 'open') throw new Error('Quote not found or not open');
  if (quote.expiresAt < new Date()) {
    quote.status = 'expired';
    await quote.save();
    throw new Error('Quote expired');
  }

  await preTradeChecks({
    buyerOrgId: user.orgId,
    quantity: quote.quantity,
    pricePerGpuHour: quote.pricePerGpuHour,
    durationHours: quote.durationHours,
    providerOrgId: String(quote.providerOrgId),
  });

  const needsApproval = forceManual;
  const order = await Order.create({
    buyerOrgId: new Types.ObjectId(user.orgId),
    createdBy: new Types.ObjectId(user.id),
    rfqId: quote.rfqId,
    quoteId: quote._id,
    type: needsApproval ? 'manual_approval' : 'rfq_accept',
    status: needsApproval ? 'pending_approval' : 'open',
    gpuType: quote.gpuType,
    gpuModel: quote.gpuModel,
    quantity: quote.quantity,
    filledQuantity: 0,
    region: quote.region,
    startDate: quote.startDate,
    durationHours: quote.durationHours,
    maxPricePerGpuHour: quote.pricePerGpuHour,
    allOrNone: true,
    partialFillAllowed: false,
  });

  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: 'order.create',
    entityType: 'Order',
    entityId: String(order._id),
    toState: order.toObject() as unknown as Record<string, unknown>,
  });

  if (needsApproval) return { order, execution: null, allocation: null, position: null };

  return fillOrderFromQuote(String(order._id), String(quote._id), user);
}

export async function approveOrder(orderId: string, user: AuthUser) {
  const order = await Order.findById(orderId);
  if (!order || order.status !== 'pending_approval') throw new Error('Order not pending approval');
  if (!order.quoteId) throw new Error('Order missing quote');
  order.status = 'open';
  order.approvedBy = new Types.ObjectId(user.id);
  order.approvedAt = new Date();
  await order.save();
  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: 'order.approve',
    entityType: 'Order',
    entityId: orderId,
  });
  return fillOrderFromQuote(orderId, String(order.quoteId), user);
}

export async function fillOrderFromQuote(orderId: string, quoteId: string, user: AuthUser) {
  const order = await Order.findById(orderId);
  const quote = await Quote.findById(quoteId);
  if (!order || !quote) throw new Error('Order or quote not found');

  if (quote.inventoryId) {
    const inv = await Inventory.findById(quote.inventoryId);
    if (!inv || inv.availableQuantity < quote.quantity) throw new Error('Insufficient inventory');
    inv.availableQuantity -= quote.quantity;
    await inv.save();
  }

  quote.status = 'accepted';
  await quote.save();

  if (quote.rfqId) {
    await Rfq.findByIdAndUpdate(quote.rfqId, { status: 'accepted' });
    await Quote.updateMany(
      { rfqId: quote.rfqId, _id: { $ne: quote._id }, status: 'open' },
      { $set: { status: 'withdrawn' } }
    );
  }

  const execution = await Execution.create({
    orderId: order._id,
    quoteId: quote._id,
    buyerOrgId: order.buyerOrgId,
    providerOrgId: quote.providerOrgId,
    providerName: quote.providerName,
    gpuType: quote.gpuType,
    gpuModel: quote.gpuModel,
    quantity: quote.quantity,
    region: quote.region,
    startDate: quote.startDate,
    durationHours: quote.durationHours,
    pricePerGpuHour: quote.pricePerGpuHour,
    effectiveTotalCost: quote.effectiveTotalCost,
  });

  const endDate = new Date(quote.startDate.getTime() + quote.durationHours * 3600 * 1000);
  const allocation = await Allocation.create({
    executionId: execution._id,
    orderId: order._id,
    buyerOrgId: order.buyerOrgId,
    providerOrgId: quote.providerOrgId,
    providerName: quote.providerName,
    gpuType: quote.gpuType,
    gpuModel: quote.gpuModel,
    quantity: quote.quantity,
    region: quote.region,
    startDate: quote.startDate,
    endDate,
    durationHours: quote.durationHours,
    pricePerGpuHour: quote.pricePerGpuHour,
    status: 'allocated',
    deliveredQuantity: 0,
  });

  const position = await Position.create({
    buyerOrgId: order.buyerOrgId,
    executionId: execution._id,
    allocationId: allocation._id,
    providerOrgId: quote.providerOrgId,
    providerName: quote.providerName,
    gpuType: quote.gpuType,
    gpuModel: quote.gpuModel,
    quantity: quote.quantity,
    region: quote.region,
    startDate: quote.startDate,
    expiryDate: endDate,
    pricePerGpuHour: quote.pricePerGpuHour,
    totalCost: quote.effectiveTotalCost,
    status: 'allocated',
    unusedQuantity: quote.quantity,
  });

  order.filledQuantity = quote.quantity;
  order.status = 'filled';
  await order.save();

  await MarketDataPoint.create({
    source: 'lattice',
    instrumentKey: `${quote.gpuType}|${quote.region}`,
    label: `Execution ${quote.providerName}`,
    pricePerGpuHour: quote.pricePerGpuHour,
    provider: quote.providerName,
    region: quote.region,
    asOf: new Date(),
    meta: { kind: 'execution', executionId: String(execution._id) },
  });

  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: 'execution.create',
    entityType: 'Execution',
    entityId: String(execution._id),
    toState: { orderId, quoteId, quantity: quote.quantity },
  });

  return { order, execution, allocation, position };
}

export async function cancelOrder(orderId: string, user: AuthUser) {
  const order = await Order.findById(orderId);
  if (!order) throw new Error('Order not found');
  if (!['open', 'pending_approval'].includes(order.status)) {
    throw new Error('Order cannot be cancelled');
  }
  const from = { status: order.status };
  order.status = 'cancelled';
  await order.save();
  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: 'order.cancel',
    entityType: 'Order',
    entityId: orderId,
    fromState: from,
    toState: { status: 'cancelled' },
  });
  return order;
}

import { Types } from 'mongoose';
import { Inventory } from '../models/Inventory.js';
import { Organization } from '../models/Organization.js';
import { Quote } from '../models/Quote.js';
import { IRfq } from '../models/Rfq.js';
import { MarketDataPoint } from '../models/MarketDataPoint.js';
import { writeAudit } from './audit.js';

function effectiveCost(price: number, qty: number, hours: number, feesPct: number): number {
  return price * qty * hours * (1 + feesPct / 100);
}

export async function routeRfq(rfq: IRfq & { _id: Types.ObjectId }, actor?: { id: string; email: string }) {
  const buyer = await Organization.findById(rfq.buyerOrgId);
  if (!buyer) throw new Error('Buyer organization not found');

  const inventory = await Inventory.find({
    active: true,
    availableQuantity: { $gte: rfq.instructions.allOrNone ? rfq.quantity : 1 },
    gpuType: new RegExp(rfq.gpuType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
    region: new RegExp(rfq.region === 'ANY' ? '.*' : rfq.region, 'i'),
    startDateAvailable: { $lte: rfq.startDate },
    durationHoursMax: { $gte: rfq.durationHours },
  }).limit(200);

  const approved = new Set((buyer.approvedProviderIds || []).map((id) => String(id)));
  const preferred = new Set((rfq.instructions.preferredProviders || []).map((p) => p.toLowerCase()));

  const candidates = inventory.filter((inv) => {
    if (approved.size && !approved.has(String(inv.providerOrgId))) return false;
    if (rfq.gpuModel && !inv.gpuModel.toLowerCase().includes(rfq.gpuModel.toLowerCase())) return false;
    if (rfq.topology && inv.topology !== rfq.topology) return false;
    if (rfq.interconnect && inv.interconnect !== rfq.interconnect) return false;
    if (inv.minCommitmentHours > rfq.durationHours) return false;
    if (rfq.maxPricePerGpuHour && inv.pricePerGpuHour > rfq.maxPricePerGpuHour) return false;
    if (buyer.tradingLimits.maxPricePerGpuHour && inv.pricePerGpuHour > buyer.tradingLimits.maxPricePerGpuHour)
      return false;
    const gpuHours = Math.min(inv.availableQuantity, rfq.quantity) * rfq.durationHours;
    if (gpuHours > buyer.tradingLimits.maxOrderGpuHours) return false;
    return true;
  });

  const ornnRef = await MarketDataPoint.findOne({
    source: 'ornn',
    instrumentKey: new RegExp(rfq.gpuType.split(/\s+/)[0], 'i'),
  })
    .sort({ asOf: -1 })
    .lean();

  const gcpRef = await MarketDataPoint.findOne({
    source: 'gpucloudprices',
    instrumentKey: new RegExp(rfq.gpuType.split(/\s+/)[0], 'i'),
  })
    .sort({ asOf: -1 })
    .lean();

  const quotes = [];
  for (const inv of candidates) {
    const qty = Math.min(inv.availableQuantity, rfq.quantity);
    if (rfq.instructions.allOrNone && qty < rfq.quantity) continue;
    const cost = effectiveCost(inv.pricePerGpuHour, qty, rfq.durationHours, 0);
    let score = 1000 - inv.pricePerGpuHour * 100;
    if (preferred.has(inv.providerName.toLowerCase())) score += 50;
    if (ornnRef?.pricePerGpuHour) {
      score += Math.max(-50, Math.min(50, (ornnRef.pricePerGpuHour - inv.pricePerGpuHour) * 20));
    }
    const quote = await Quote.create({
      rfqId: rfq._id,
      inventoryId: inv._id,
      providerOrgId: inv.providerOrgId,
      providerName: inv.providerName,
      gpuType: inv.gpuType,
      gpuModel: inv.gpuModel,
      quantity: qty,
      region: inv.region,
      topology: inv.topology,
      interconnect: inv.interconnect,
      startDate: rfq.startDate,
      durationHours: rfq.durationHours,
      pricePerGpuHour: inv.pricePerGpuHour,
      feesPct: 0,
      effectiveTotalCost: cost,
      slaTerms: inv.slaTerms,
      firmness: 'firm',
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      status: 'open',
      incompleteFields: inv.incompleteFields || [],
      rankScore: score,
    });
    quotes.push(quote);

    await MarketDataPoint.create({
      source: 'lattice',
      instrumentKey: `${inv.gpuType}|${inv.region}`,
      label: `Quote ${inv.providerName}`,
      pricePerGpuHour: inv.pricePerGpuHour,
      provider: inv.providerName,
      region: inv.region,
      asOf: new Date(),
      meta: { kind: 'quote', quoteId: String(quote._id), rfqId: String(rfq._id) },
    });
  }

  quotes.sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0));
  const routerLog = {
    evaluated: inventory.length,
    eligible: candidates.length,
    quoted: quotes.length,
    ornnRef: ornnRef?.pricePerGpuHour ?? null,
    gpuCloudRef: gcpRef?.pricePerGpuHour ?? null,
    inputs: {
      gpuType: rfq.gpuType,
      region: rfq.region,
      quantity: rfq.quantity,
      durationHours: rfq.durationHours,
      allOrNone: rfq.instructions.allOrNone,
      maxPrice: rfq.maxPricePerGpuHour,
    },
  };

  await writeAudit({
    actorId: actor?.id,
    actorEmail: actor?.email,
    action: 'router.decide',
    entityType: 'Rfq',
    entityId: String(rfq._id),
    meta: routerLog,
  });

  return { quotes, routerLog, references: { ornn: ornnRef, gpucloudprices: gcpRef } };
}

import { Router } from 'express';
import { Types } from 'mongoose';
import { Rfq } from '../models/Rfq.js';
import { Order } from '../models/Order.js';
import { Allocation } from '../models/Allocation.js';
import { Quote } from '../models/Quote.js';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

export type PipelineStage =
  | 'leads'
  | 'negotiating'
  | 'agreed'
  | 'out_for_signing'
  | 'signed'
  | 'complete';

export type PipelineDeal = {
  id: string;
  codename: string;
  stage: PipelineStage;
  side: 'BUY' | 'SELL';
  gpuType: string;
  gpuModel?: string;
  quantity: number;
  durationMonths: number;
  region: string;
  totalValue: number;
  pricePerGpuHour: number;
  providerName?: string;
  engagement?: string;
  assignee?: { name: string; initials: string };
  entityType: 'rfq' | 'order' | 'allocation';
  createdAt: string;
};

const ADJECTIVES = [
  'funny',
  'amber',
  'verdant',
  'swift',
  'quiet',
  'bold',
  'calm',
  'bright',
  'keen',
  'lucky',
];
const NOUNS = ['skink', 'fox', 'otter', 'hawk', 'lynx', 'crane', 'wolf', 'bear', 'finch', 'pike'];

function codenameFromId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i) * (i + 1)) % 9973;
  const adj = ADJECTIVES[hash % ADJECTIVES.length];
  const noun = NOUNS[Math.floor(hash / ADJECTIVES.length) % NOUNS.length];
  return `${adj}-${noun}`;
}

function formatValue(n: number): number {
  return Math.round(n * 100) / 100;
}

function monthsFromHours(h: number): number {
  return Math.max(1, Math.round(h / (24 * 30)));
}

export const pipelineRouter = Router();

pipelineRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const deals: PipelineDeal[] = [];
    const orderIdsWithAlloc = new Set<string>();
    const rfqIdsWithOrder = new Set<string>();

    const allocations = await Allocation.find(
      req.user!.role === 'provider_dealer'
        ? { providerOrgId: new Types.ObjectId(req.user!.orgId) }
        : req.user!.role === 'admin' || req.user!.role === 'risk'
          ? {}
          : { buyerOrgId: new Types.ObjectId(req.user!.orgId) }
    )
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    for (const alloc of allocations) {
      orderIdsWithAlloc.add(String(alloc.orderId));
    }

    const orders = await Order.find(
      req.user!.role === 'provider_dealer'
        ? { status: { $in: ['pending_approval', 'open', 'partially_filled', 'filled'] } }
        : {
            buyerOrgId: new Types.ObjectId(req.user!.orgId),
            status: { $in: ['pending_approval', 'open', 'partially_filled', 'filled'] },
          }
    )
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    for (const order of orders) {
      if (order.rfqId) rfqIdsWithOrder.add(String(order.rfqId));
    }

    const rfqFilter =
      req.user!.role === 'provider_dealer'
        ? { status: { $in: ['open', 'quoted'] } }
        : {
            buyerOrgId: new Types.ObjectId(req.user!.orgId),
            status: { $in: ['open', 'quoted'] },
            _id: { $nin: [...rfqIdsWithOrder].map((id) => new Types.ObjectId(id)) },
          };

    const rfqs = await Rfq.find(rfqFilter).sort({ createdAt: -1 }).limit(50).lean();
    for (const rfq of rfqs) {
      const quoteCount = await Quote.countDocuments({ rfqId: rfq._id, status: 'open' });
      const user = await User.findById(rfq.createdBy).lean();
      const price = rfq.maxPricePerGpuHour || 2.5;
      const total = formatValue(price * rfq.quantity * rfq.durationHours);
      const side: 'BUY' | 'SELL' = req.user!.role === 'provider_dealer' ? 'SELL' : 'BUY';
      deals.push({
        id: String(rfq._id),
        codename: codenameFromId(String(rfq._id)),
        stage: rfq.status === 'open' ? 'leads' : 'negotiating',
        side,
        gpuType: rfq.gpuType,
        gpuModel: rfq.gpuModel,
        quantity: rfq.quantity,
        durationMonths: monthsFromHours(rfq.durationHours),
        region: rfq.region,
        totalValue: total,
        pricePerGpuHour: price,
        engagement:
          req.user!.role === 'provider_dealer'
            ? quoteCount
              ? `${quoteCount} competing quote${quoteCount > 1 ? 's' : ''}`
              : 'New inbound RFQ'
            : quoteCount
              ? `${quoteCount} seller${quoteCount > 1 ? 's' : ''} engaged`
              : undefined,
        assignee: user
          ? { name: user.name, initials: user.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase() }
          : undefined,
        entityType: 'rfq',
        createdAt: rfq.createdAt.toISOString(),
      });
    }

    for (const order of orders) {
      if (orderIdsWithAlloc.has(String(order._id))) continue;
      const user = await User.findById(order.createdBy).lean();
      let quote = order.quoteId ? await Quote.findById(order.quoteId).lean() : null;
      const price = quote?.pricePerGpuHour || order.maxPricePerGpuHour || 2.5;
      const qty = order.filledQuantity || order.quantity;
      const total = formatValue(price * qty * order.durationHours);
      const stage: PipelineStage =
        order.status === 'filled' ? 'agreed' : 'negotiating';

      deals.push({
        id: String(order._id),
        codename: codenameFromId(String(order._id)),
        stage,
        side: 'BUY',
        gpuType: order.gpuType,
        gpuModel: order.gpuModel,
        quantity: qty,
        durationMonths: monthsFromHours(order.durationHours),
        region: order.region,
        totalValue: total,
        pricePerGpuHour: price,
        providerName: quote?.providerName,
        assignee: user
          ? { name: user.name, initials: user.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase() }
          : undefined,
        entityType: 'order',
        createdAt: order.createdAt.toISOString(),
      });
    }

    for (const alloc of allocations) {
      const total = formatValue(alloc.pricePerGpuHour * alloc.quantity * alloc.durationHours);
      let stage: PipelineStage = 'agreed';
      if (alloc.status === 'provisioning') stage = 'out_for_signing';
      else if (alloc.status === 'delivered' || alloc.status === 'exception') stage = 'signed';
      else if (alloc.status === 'settled') stage = 'complete';

      const side: 'BUY' | 'SELL' =
        req.user!.role === 'provider_dealer' ? 'SELL' : 'BUY';

      deals.push({
        id: String(alloc._id),
        codename: codenameFromId(String(alloc._id)),
        stage,
        side,
        gpuType: alloc.gpuType,
        gpuModel: alloc.gpuModel,
        quantity: alloc.quantity,
        durationMonths: monthsFromHours(alloc.durationHours),
        region: alloc.region,
        totalValue: total,
        pricePerGpuHour: alloc.pricePerGpuHour,
        providerName: alloc.providerName,
        assignee: {
          name: alloc.providerName.split(' ')[0] || alloc.providerName,
          initials: alloc.providerName.slice(0, 2).toUpperCase(),
        },
        entityType: 'allocation',
        createdAt: alloc.createdAt.toISOString(),
      });
    }

    const stages: PipelineStage[] = [
      'leads',
      'negotiating',
      'agreed',
      'out_for_signing',
      'signed',
      'complete',
    ];

    const columns = stages.map((stage) => {
      const items = deals.filter((d) => d.stage === stage);
      const totalValue = items.reduce((s, d) => s + d.totalValue, 0);
      return {
        stage,
        label: stage.replace(/_/g, ' ').toUpperCase(),
        count: items.length,
        totalValue,
        totalLabel: totalValue >= 1_000_000 ? `$${(totalValue / 1_000_000).toFixed(1)}M` : `$${Math.round(totalValue).toLocaleString()}`,
        deals: items,
      };
    });

    res.json({ columns, deals });
  })
);

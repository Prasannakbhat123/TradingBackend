import { Router } from 'express';
import { Types } from 'mongoose';
import { Rfq } from '../models/Rfq.js';
import { Quote } from '../models/Quote.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { routeRfq } from '../services/router.js';
import { writeAudit } from '../services/audit.js';

export const rfqRouter = Router();

rfqRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const filter =
      req.user!.role === 'buyer' || req.user!.role === 'risk'
        ? { buyerOrgId: req.user!.orgId }
        : {};
    const rfqs = await Rfq.find(filter).sort({ createdAt: -1 }).limit(100).lean();
    const ids = rfqs.map((r) => r._id);
    const counts = await Quote.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { rfqId: { $in: ids } } },
      { $group: { _id: '$rfqId', n: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.n]));
    res.json({
      rfqs: rfqs.map((r) => ({ ...r, quoteCount: countMap.get(String(r._id)) || 0 })),
    });
  })
);

rfqRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rfq = await Rfq.findById(req.params.id);
    if (!rfq) {
      res.status(404).json({ error: 'RFQ not found' });
      return;
    }
    const quotes = await Quote.find({ rfqId: rfq._id }).sort({ rankScore: -1 });
    res.json({ rfq, quotes });
  })
);

rfqRouter.post(
  '/',
  requireAuth,
  requireRoles('buyer', 'admin'),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      gpuType: string;
      gpuModel?: string;
      quantity: number;
      region: string;
      topology?: string;
      interconnect?: string;
      startDate: string;
      durationHours: number;
      maxPricePerGpuHour?: number;
      instructions?: {
        bestPrice?: boolean;
        allOrNone?: boolean;
        preferredProviders?: string[];
        manualApproval?: boolean;
      };
    };

    const rfq = await Rfq.create({
      buyerOrgId: new Types.ObjectId(req.user!.orgId),
      createdBy: new Types.ObjectId(req.user!.id),
      gpuType: body.gpuType,
      gpuModel: body.gpuModel,
      quantity: body.quantity,
      region: body.region || 'ANY',
      topology: body.topology,
      interconnect: body.interconnect,
      startDate: new Date(body.startDate || Date.now()),
      durationHours: body.durationHours,
      maxPricePerGpuHour: body.maxPricePerGpuHour,
      instructions: {
        bestPrice: body.instructions?.bestPrice ?? true,
        allOrNone: body.instructions?.allOrNone ?? false,
        preferredProviders: body.instructions?.preferredProviders || [],
        manualApproval: body.instructions?.manualApproval ?? false,
      },
      status: 'open',
    });

    const { quotes, routerLog, references } = await routeRfq(rfq, req.user!);
    rfq.status = quotes.length ? 'quoted' : 'open';
    rfq.rankedQuoteIds = quotes.map((q) => q._id as Types.ObjectId);
    rfq.routerLog = routerLog;
    await rfq.save();

    await writeAudit({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'rfq.create',
      entityType: 'Rfq',
      entityId: String(rfq._id),
      toState: { gpuType: rfq.gpuType, quantity: rfq.quantity },
    });

    res.status(201).json({ rfq, quotes, references });
  })
);

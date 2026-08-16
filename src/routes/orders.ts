import { Router } from 'express';
import { Order } from '../models/Order.js';
import { Quote } from '../models/Quote.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { acceptQuote, approveOrder, cancelOrder, preTradeChecks } from '../services/oms.js';
import { writeAudit } from '../services/audit.js';

export const ordersRouter = Router();

ordersRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const filter =
      req.user!.role === 'provider_dealer'
        ? {}
        : { buyerOrgId: req.user!.orgId };
    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(100);
    res.json({ orders });
  })
);

ordersRouter.post(
  '/',
  requireAuth,
  requireRoles('buyer', 'admin'),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      quoteId?: string;
      type?: 'rfq_accept' | 'limit' | 'manual_approval';
      manualApproval?: boolean;
      gpuType?: string;
      quantity?: number;
      region?: string;
      startDate?: string;
      durationHours?: number;
      maxPricePerGpuHour?: number;
      allOrNone?: boolean;
    };

    if (body.quoteId) {
      const result = await acceptQuote(
        body.quoteId,
        req.user!,
        body.manualApproval || body.type === 'manual_approval'
      );
      res.status(201).json(result);
      return;
    }

    // Limit order against cheapest matching open quote/inventory via live quotes
    const quote = await Quote.findOne({
      status: 'open',
      gpuType: new RegExp(body.gpuType || 'H100', 'i'),
      region: new RegExp(body.region === 'ANY' ? '.*' : body.region || '.*', 'i'),
      pricePerGpuHour: { $lte: body.maxPricePerGpuHour || 999 },
      expiresAt: { $gt: new Date() },
    }).sort({ pricePerGpuHour: 1 });

    if (!quote) {
      res.status(404).json({ error: 'No matching live quote for limit order' });
      return;
    }

    await preTradeChecks({
      buyerOrgId: req.user!.orgId,
      quantity: body.quantity || quote.quantity,
      pricePerGpuHour: quote.pricePerGpuHour,
      durationHours: body.durationHours || quote.durationHours,
      providerOrgId: String(quote.providerOrgId),
    });

    const result = await acceptQuote(String(quote._id), req.user!, !!body.manualApproval);
    res.status(201).json(result);
  })
);

ordersRouter.post(
  '/:id/approve',
  requireAuth,
  requireRoles('buyer', 'risk', 'admin'),
  asyncHandler(async (req, res) => {
    const result = await approveOrder(String(req.params.id), req.user!);
    res.json(result);
  })
);

ordersRouter.post(
  '/:id/cancel',
  requireAuth,
  requireRoles('buyer', 'admin'),
  asyncHandler(async (req, res) => {
    const order = await cancelOrder(String(req.params.id), req.user!);
    res.json({ order });
  })
);

ordersRouter.patch(
  '/:id',
  requireAuth,
  requireRoles('buyer', 'admin'),
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    if (!['open', 'pending_approval'].includes(order.status)) {
      res.status(400).json({ error: 'Order not amendable' });
      return;
    }
    const from = order.toObject() as unknown as Record<string, unknown>;
    const body = req.body as { maxPricePerGpuHour?: number; quantity?: number };
    if (body.maxPricePerGpuHour !== undefined) order.maxPricePerGpuHour = body.maxPricePerGpuHour;
    if (body.quantity !== undefined) order.quantity = body.quantity;
    await order.save();
    await writeAudit({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'order.amend',
      entityType: 'Order',
      entityId: String(order._id),
      fromState: from,
      toState: order.toObject() as unknown as Record<string, unknown>,
    });
    res.json({ order });
  })
);

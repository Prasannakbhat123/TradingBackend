import { Router } from 'express';
import { Execution } from '../models/Execution.js';
import { Position } from '../models/Position.js';
import { Allocation, Settlement } from '../models/Allocation.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { closeSettlement, updateProvisioning } from '../services/settlement.js';

export const executionsRouter = Router();
export const portfolioRouter = Router();
export const settlementRouter = Router();

executionsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const filter =
      req.user!.role === 'provider_dealer' ? {} : { buyerOrgId: req.user!.orgId };
    const executions = await Execution.find(filter).sort({ createdAt: -1 }).limit(100);
    res.json({ executions });
  })
);

portfolioRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.user!.role !== 'admin' && req.user!.role !== 'provider_dealer') {
      filter.buyerOrgId = req.user!.orgId;
    }
    if (req.query.gpuType) filter.gpuType = new RegExp(String(req.query.gpuType), 'i');
    if (req.query.region) filter.region = new RegExp(String(req.query.region), 'i');
    if (req.query.provider) filter.providerName = new RegExp(String(req.query.provider), 'i');

    const positions = await Position.find(filter).sort({ expiryDate: 1 });
    const now = Date.now();
    for (const p of positions) {
      if (p.expiryDate.getTime() < now && p.status !== 'expired') {
        p.status = 'expired';
        await p.save();
      }
    }

    const totalCost = positions.reduce((s, p) => s + p.totalCost, 0);
    const totalQty = positions.reduce((s, p) => s + p.quantity, 0);
    const avgPrice =
      positions.length === 0
        ? 0
        : positions.reduce((s, p) => s + p.pricePerGpuHour * p.quantity, 0) / Math.max(1, totalQty);

    const byProvider: Record<string, number> = {};
    for (const p of positions) {
      byProvider[p.providerName] = (byProvider[p.providerName] || 0) + p.quantity;
    }

    const alerts = positions
      .filter((p) => p.expiryDate.getTime() - now < 7 * 24 * 3600 * 1000 && p.status !== 'expired')
      .map((p) => ({
        type: 'expiry',
        positionId: p._id,
        message: `${p.gpuType} x${p.quantity} expires ${p.expiryDate.toISOString().slice(0, 10)}`,
      }));

    res.json({
      positions,
      summary: { totalCost, totalQty, avgPricePerGpuHour: avgPrice, concentration: byProvider },
      alerts,
    });
  })
);

settlementRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const allocations = await Allocation.find(
      req.user!.role === 'provider_dealer' ? { providerOrgId: req.user!.orgId } : { buyerOrgId: req.user!.orgId }
    ).sort({ createdAt: -1 });
    const settlements = await Settlement.find({
      buyerOrgId: req.user!.orgId,
    }).sort({ createdAt: -1 });
    res.json({ allocations, settlements });
  })
);

settlementRouter.post(
  '/:allocationId/provisioning',
  requireAuth,
  requireRoles('provider_dealer', 'admin'),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      status: 'provisioning' | 'delivered' | 'exception';
      deliveredQuantity?: number;
      exceptionNote?: string;
    };
    const allocation = await updateProvisioning(req.params.allocationId!, req.user!, body.status, {
      deliveredQuantity: body.deliveredQuantity,
      exceptionNote: body.exceptionNote,
    });
    res.json({ allocation });
  })
);

settlementRouter.post(
  '/:allocationId/close',
  requireAuth,
  requireRoles('provider_dealer', 'buyer', 'admin', 'risk'),
  asyncHandler(async (req, res) => {
    const settlement = await closeSettlement(
      req.params.allocationId!,
      req.user!,
      (req.body as { notes?: string }).notes
    );
    res.json({ settlement });
  })
);

import { Router } from 'express';
import { Inventory } from '../models/Inventory.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

export const inventoryRouter = Router();

inventoryRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = { active: true };
    if (req.query.gpuType) filter.gpuType = new RegExp(String(req.query.gpuType), 'i');
    if (req.query.region) filter.region = new RegExp(String(req.query.region), 'i');
    if (req.query.source) filter.source = String(req.query.source);
    const items = await Inventory.find(filter).sort({ pricePerGpuHour: 1 }).limit(200);
    res.json({ items });
  })
);

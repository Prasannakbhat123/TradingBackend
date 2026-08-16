import bcrypt from 'bcryptjs';
import { connectDb } from '../db/connect.js';
import { Organization } from '../models/Organization.js';
import { User } from '../models/User.js';
import { Inventory } from '../models/Inventory.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { Rfq } from '../models/Rfq.js';
import { Quote } from '../models/Quote.js';
import { Order } from '../models/Order.js';
import { Execution } from '../models/Execution.js';
import { Allocation, Settlement } from '../models/Allocation.js';

async function seed() {
  await connectDb();

  await Promise.all([
    Organization.deleteMany({}),
    User.deleteMany({}),
    Inventory.deleteMany({ source: 'dealer' }),
    AuditEvent.deleteMany({}),
    Rfq.deleteMany({}),
    Quote.deleteMany({}),
    Order.deleteMany({}),
    Execution.deleteMany({}),
    Allocation.deleteMany({}),
    Settlement.deleteMany({}),
  ]);

  const buyer = await Organization.create({
    name: 'Northstar AI Labs',
    type: 'buyer',
    kybStatus: 'verified',
    tradingLimits: { maxOrderGpuHours: 500_000, maxPricePerGpuHour: 25 },
  });

  const neo = await Organization.create({
    name: 'NeoCloud Compute',
    type: 'provider',
    kybStatus: 'verified',
  });

  const apex = await Organization.create({
    name: 'Apex GPU Partners',
    type: 'provider',
    kybStatus: 'verified',
  });

  const lattice = await Organization.create({
    name: 'Lattice Platform',
    type: 'platform',
    kybStatus: 'verified',
  });

  buyer.approvedProviderIds = [neo._id, apex._id];
  await buyer.save();

  const passwordHash = await bcrypt.hash('password123', 10);

  const users = [
    {
      email: 'buyer@lattice.dev',
      name: 'Alex Buyer',
      orgId: buyer._id,
      role: 'buyer' as const,
    },
    {
      email: 'dealer@neocloud.dev',
      name: 'Sam Dealer',
      orgId: neo._id,
      role: 'provider_dealer' as const,
    },
    {
      email: 'dealer@apex.dev',
      name: 'Riley Dealer',
      orgId: apex._id,
      role: 'provider_dealer' as const,
    },
    {
      email: 'risk@lattice.dev',
      name: 'Jordan Risk',
      orgId: lattice._id,
      role: 'risk' as const,
    },
    {
      email: 'admin@lattice.dev',
      name: 'Casey Admin',
      orgId: lattice._id,
      role: 'admin' as const,
    },
  ];

  for (const u of users) {
    await User.create({ ...u, passwordHash });
  }

  const buyerUser = await User.findOne({ email: 'buyer@lattice.dev' });
  if (!buyerUser) throw new Error('Buyer user missing');
  const buyerUserId = buyerUser._id;

  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);

  const duration12mo = 24 * 30 * 12;
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000);

  const rfqLead1 = await Rfq.create({
    buyerOrgId: buyer._id,
    createdBy: buyerUser._id,
    gpuType: 'H100 SXM',
    gpuModel: 'H100 SXM 80GB',
    quantity: 512,
    region: 'US-EAST',
    startDate: start,
    durationHours: duration12mo,
    maxPricePerGpuHour: 2.45,
    instructions: { bestPrice: true, allOrNone: false, preferredProviders: [], manualApproval: false },
    status: 'open',
  });

  await Rfq.create({
    buyerOrgId: buyer._id,
    createdBy: buyerUser._id,
    gpuType: 'A100',
    gpuModel: 'A100 80GB',
    quantity: 256,
    region: 'US-WEST',
    startDate: start,
    durationHours: duration12mo,
    maxPricePerGpuHour: 1.35,
    instructions: { bestPrice: true, allOrNone: false, preferredProviders: [], manualApproval: false },
    status: 'open',
  });

  const rfqQuoted = await Rfq.create({
    buyerOrgId: buyer._id,
    createdBy: buyerUser._id,
    gpuType: 'H100 SXM',
    gpuModel: 'H100 SXM 80GB',
    quantity: 128,
    region: 'EU-WEST',
    startDate: start,
    durationHours: duration12mo,
    maxPricePerGpuHour: 2.65,
    instructions: { bestPrice: true, allOrNone: false, preferredProviders: [], manualApproval: false },
    status: 'quoted',
  });

  const quoteNeo = await Quote.create({
    rfqId: rfqQuoted._id,
    providerOrgId: neo._id,
    providerName: 'NeoCloud Compute',
    gpuType: 'H100 SXM',
    gpuModel: 'H100 SXM 80GB',
    quantity: 128,
    region: 'EU-WEST',
    startDate: start,
    durationHours: duration12mo,
    pricePerGpuHour: 2.55,
    effectiveTotalCost: 2.55 * 128 * duration12mo,
    expiresAt: expires,
    status: 'open',
    incompleteFields: [],
  });

  await Quote.create({
    rfqId: rfqQuoted._id,
    providerOrgId: apex._id,
    providerName: 'Apex GPU Partners',
    gpuType: 'H100 SXM',
    gpuModel: 'H100 SXM 80GB',
    quantity: 128,
    region: 'EU-WEST',
    startDate: start,
    durationHours: duration12mo,
    pricePerGpuHour: 2.62,
    effectiveTotalCost: 2.62 * 128 * duration12mo,
    expiresAt: expires,
    status: 'open',
    incompleteFields: [],
  });

  rfqQuoted.rankedQuoteIds = [quoteNeo._id];
  await rfqQuoted.save();

  await Order.create({
    buyerOrgId: buyer._id,
    createdBy: buyerUser._id,
    type: 'limit',
    status: 'pending_approval',
    gpuType: 'H100 SXM',
    gpuModel: 'H100 SXM 80GB',
    quantity: 64,
    filledQuantity: 0,
    region: 'US-EAST',
    startDate: start,
    durationHours: duration12mo,
    maxPricePerGpuHour: 2.45,
    allOrNone: false,
    partialFillAllowed: true,
  });

  void rfqLead1;

  async function seedAllocation(
    gpuType: string,
    gpuModel: string,
    quantity: number,
    price: number,
    providerOrgId: typeof neo._id,
    providerName: string,
    status: 'allocated' | 'provisioning' | 'delivered' | 'settled'
  ) {
    const order = await Order.create({
      buyerOrgId: buyer._id,
      createdBy: buyerUserId,
      type: 'rfq_accept',
      status: 'filled',
      gpuType,
      gpuModel,
      quantity,
      filledQuantity: quantity,
      region: 'US-EAST',
      startDate: start,
      durationHours: duration12mo,
      allOrNone: false,
      partialFillAllowed: true,
    });

    const total = price * quantity * duration12mo;
    const execution = await Execution.create({
      orderId: order._id,
      buyerOrgId: buyer._id,
      providerOrgId,
      providerName,
      gpuType,
      gpuModel,
      quantity,
      region: 'US-EAST',
      startDate: start,
      durationHours: duration12mo,
      pricePerGpuHour: price,
      effectiveTotalCost: total,
    });

    const endDate = new Date(start.getTime() + duration12mo * 3600 * 1000);
    const allocation = await Allocation.create({
      executionId: execution._id,
      orderId: order._id,
      buyerOrgId: buyer._id,
      providerOrgId,
      providerName,
      gpuType,
      gpuModel,
      quantity,
      region: 'US-EAST',
      startDate: start,
      endDate,
      durationHours: duration12mo,
      pricePerGpuHour: price,
      status,
      deliveredQuantity: status === 'delivered' || status === 'settled' ? quantity : 0,
    });

    if (status === 'settled') {
      await Settlement.create({
        allocationId: allocation._id,
        orderId: order._id,
        buyerOrgId: buyer._id,
        amount: total,
        status: 'closed',
        closedAt: new Date(),
      });
    }
  }

  await seedAllocation('H100 SXM', 'H100 SXM 80GB', 64, 2.45, neo._id, 'NeoCloud Compute', 'allocated');
  await seedAllocation('B200', 'B200 SXM', 16, 4.2, apex._id, 'Apex GPU Partners', 'provisioning');
  await seedAllocation('H200', 'H200 SXM', 32, 3.1, neo._id, 'NeoCloud Compute', 'delivered');
  await seedAllocation('A100', 'A100 80GB', 80, 1.35, apex._id, 'Apex GPU Partners', 'settled');

  const inventorySeed = [
    {
      providerOrgId: neo._id,
      providerName: 'NeoCloud Compute',
      gpuType: 'H100 SXM',
      gpuModel: 'H100 SXM 80GB',
      quantity: 64,
      availableQuantity: 64,
      topology: '8x NVLink',
      interconnect: 'NVLink',
      region: 'US-EAST',
      pricePerGpuHour: 2.45,
      minCommitmentHours: 168,
      durationHoursMax: 2160,
    },
    {
      providerOrgId: neo._id,
      providerName: 'NeoCloud Compute',
      gpuType: 'H200',
      gpuModel: 'H200 SXM',
      quantity: 32,
      availableQuantity: 32,
      topology: '8x NVLink',
      interconnect: 'NVLink',
      region: 'US-WEST',
      pricePerGpuHour: 3.1,
      minCommitmentHours: 168,
      durationHoursMax: 2160,
    },
    {
      providerOrgId: apex._id,
      providerName: 'Apex GPU Partners',
      gpuType: 'H100 SXM',
      gpuModel: 'H100 SXM 80GB',
      quantity: 48,
      availableQuantity: 48,
      topology: '8x NVLink',
      interconnect: 'NVLink',
      region: 'EU-WEST',
      pricePerGpuHour: 2.65,
      minCommitmentHours: 72,
      durationHoursMax: 1440,
    },
    {
      providerOrgId: apex._id,
      providerName: 'Apex GPU Partners',
      gpuType: 'A100',
      gpuModel: 'A100 80GB',
      quantity: 80,
      availableQuantity: 80,
      topology: '4x NVLink',
      interconnect: 'NVLink',
      region: 'US-EAST',
      pricePerGpuHour: 1.35,
      minCommitmentHours: 24,
      durationHoursMax: 720,
    },
    {
      providerOrgId: apex._id,
      providerName: 'Apex GPU Partners',
      gpuType: 'B200',
      gpuModel: 'B200 SXM',
      quantity: 16,
      availableQuantity: 16,
      topology: '8x NVLink',
      interconnect: 'NVLink',
      region: 'US-EAST',
      pricePerGpuHour: 4.2,
      minCommitmentHours: 168,
      durationHoursMax: 2160,
      incompleteFields: [],
    },
  ];

  for (const row of inventorySeed) {
    await Inventory.create({
      ...row,
      source: 'dealer',
      startDateAvailable: start,
      slaTerms: '99.9% availability, 4h replacement SLA',
      incompleteFields: row.incompleteFields || [],
      active: true,
    });
  }

  console.log('Seed complete.');
  console.log('Demo logins (password: password123):');
  for (const u of users) console.log(`  ${u.email} (${u.role})`);
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});

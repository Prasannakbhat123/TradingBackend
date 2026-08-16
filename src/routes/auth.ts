import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { Organization } from '../models/Organization.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

export const authRouter = Router();

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: 'email and password required' });
      return;
    }
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    const org = await Organization.findById(user.orgId);
    const token = signToken({
      id: String(user._id),
      email: user.email,
      orgId: String(user.orgId),
      role: user.role,
      name: user.name,
    });
    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        orgId: user.orgId,
        orgName: org?.name,
        orgType: org?.type,
      },
    });
  })
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user!.id);
    const org = user ? await Organization.findById(user.orgId) : null;
    res.json({
      user: user
        ? {
            id: user._id,
            email: user.email,
            name: user.name,
            role: user.role,
            orgId: user.orgId,
            orgName: org?.name,
            orgType: org?.type,
          }
        : null,
    });
  })
);

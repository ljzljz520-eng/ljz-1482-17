import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError } from '../utils/http.js';
import { signToken, requireAuth } from '../middleware/auth.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberships: { where: { status: 'ACTIVE' }, include: { tenant: true } } }
  });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, '邮箱或密码错误');
  }
  if (user.memberships.length === 0) throw new HttpError(403, '当前账号没有可访问的团队');
  const membership = user.memberships[0];
  const sessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    tenantId: membership.tenantId,
    role: membership.role
  };
  res.json({
    token: signToken(sessionUser),
    user: sessionUser,
    tenant: { id: membership.tenant.id, name: membership.tenant.name }
  });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: req.user!.tenantId } });
  res.json({ user: req.user, tenant: { id: tenant.id, name: tenant.name } });
}));

export default router;

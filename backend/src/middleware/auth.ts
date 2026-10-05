import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma.js';
import { HttpError } from '../utils/http.js';
import type { AuthenticatedUser } from '../types.js';

const JWT_SECRET = process.env.JWT_SECRET ?? 'local-development-secret';

export const signToken = (user: AuthenticatedUser) =>
  jwt.sign(user, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN ?? '12h' });

const fail = (next: NextFunction, status: number, message: string) => next(new HttpError(status, message));

export const requireAuth = async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) return fail(next, 401, '请先登录');
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as AuthenticatedUser;
    const membership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: payload.id, tenantId: payload.tenantId } },
      include: { user: true }
    });
    if (!membership || membership.status !== 'ACTIVE') {
      return fail(next, 403, '你已退出该团队，无法继续访问');
    }
    req.user = {
      id: membership.userId,
      email: membership.user.email,
      name: membership.user.name,
      tenantId: membership.tenantId,
      role: membership.role
    };
    return next();
  } catch {
    return fail(next, 401, '登录状态已失效，请重新登录');
  }
};

export const requireRole = (...roles: Array<'OWNER' | 'ADMIN' | 'MEMBER'>) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, '请先登录'));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, '当前成员无权执行该操作'));
    return next();
  };

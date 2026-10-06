import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { HttpError } from "../utils/errors.js";

export const requireAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      throw new HttpError(401, "请先登录");
    }

    const payload = jwt.verify(token, env.jwtSecret);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        memberships: {
          where: { status: "ACTIVE" },
          include: { tenant: true }
        }
      }
    });

    if (!user) {
      throw new HttpError(401, "登录状态已失效");
    }

    const membership =
      user.memberships.find((item) => item.tenantId === user.activeTenantId) ||
      user.memberships[0] ||
      null;

    if (!membership) {
      throw new HttpError(403, "当前账号不属于任何团队");
    }

    req.user = user;
    req.membership = membership;
    req.tenantId = membership.tenantId;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new HttpError(401, "登录状态已失效"));
      return;
    }
    next(error);
  }
};

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.membership || !roles.includes(req.membership.role)) {
    next(new HttpError(403, "需要团队管理员权限"));
    return;
  }
  next();
};

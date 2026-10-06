import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { asyncHandler } from "../utils/errors.js";
import { HttpError } from "../utils/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { serializeUser } from "../utils/serializers.js";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
      include: {
        memberships: {
          where: { status: "ACTIVE" },
          include: { tenant: true }
        }
      }
    });

    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new HttpError(401, "邮箱或密码错误");
    }

    const currentMembership =
      user.memberships.find((item) => item.tenantId === user.activeTenantId) ||
      user.memberships[0];
    if (!currentMembership) {
      throw new HttpError(403, "账号已退出全部团队，不能登录工作区");
    }
    if (currentMembership.tenantId !== user.activeTenantId) {
      await prisma.user.update({
        where: { id: user.id },
        data: { activeTenantId: currentMembership.tenantId }
      });
    }
    const membership = currentMembership;

    const token = jwt.sign({ sub: user.id, tid: membership.tenantId }, env.jwtSecret, {
      expiresIn: "12h"
    });

    res.json({ token, user: serializeUser(user, membership) });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: serializeUser(req.user, req.membership) });
  })
);

router.post(
  "/leave-team",
  requireAuth,
  asyncHandler(async (req, res) => {
    const membership = req.membership;
    if (membership.role === "OWNER") {
      throw new HttpError(409, "团队所有者不能直接退出，请先转让团队");
    }

    const openTaskCount = await prisma.exportTask.count({
      where: {
        tenantId: req.tenantId,
        requestedById: req.user.id,
        status: { in: ["QUEUED", "RUNNING", "CANCELLING"] }
      }
    });
    if (openTaskCount > 0) {
      throw new HttpError(409, `仍有 ${openTaskCount} 个未结任务，请等待结算或取消后再退出`);
    }

    await prisma.membership.update({
      where: { id: membership.id },
      data: { status: "LEFT", leftAt: new Date() }
    });

    res.json({ message: "已退出团队；服务端成员关系已终止，旧令牌将无法继续访问该租户" });
  })
);

export default router;

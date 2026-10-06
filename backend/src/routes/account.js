import { Router } from "express";
import { prisma } from "../config/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/errors.js";
import { serializeAccount, serializeLedger } from "../utils/serializers.js";

const router = Router();
router.use(requireAuth);

router.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const [tenant, account, openTaskCount, projectCount, favoriteCount, openTasks] =
      await Promise.all([
        prisma.tenant.findUniqueOrThrow({ where: { id: req.tenantId } }),
        prisma.billingAccount.findUniqueOrThrow({ where: { tenantId: req.tenantId } }),
        prisma.exportTask.count({
          where: {
            tenantId: req.tenantId,
            status: { in: ["QUEUED", "RUNNING", "CANCELLING"] }
          }
        }),
        prisma.project.count({ where: { tenantId: req.tenantId, deletedAt: null } }),
        prisma.templateFavorite.count({
          where: {
            userId: req.user.id,
            template: { tenantId: req.tenantId }
          }
        }),
        prisma.exportTask.findMany({
          where: {
            tenantId: req.tenantId,
            status: { in: ["QUEUED", "RUNNING", "CANCELLING"] }
          },
          orderBy: { createdAt: "desc" },
          take: 8,
          include: { project: true }
        })
      ]);

    res.json({
      account: serializeAccount(account, tenant),
      storage: {
        used: Number(tenant.storageUsed),
        limit: Number(tenant.storageLimit),
        available: Number(tenant.storageLimit) - Number(tenant.storageUsed)
      },
      stats: {
        projects: projectCount,
        favorites: favoriteCount,
        openTasks: openTaskCount
      },
      openTasks: openTasks.map((task) => ({
        id: task.id,
        projectName: task.project?.name,
        status: task.status,
        estimatedUnits: task.estimatedUnits,
        updatedAt: task.updatedAt
      }))
    });
  })
);

router.get(
  "/ledger",
  asyncHandler(async (req, res) => {
    const ledger = await prisma.billingLedger.findMany({
      where: { tenantId: req.tenantId },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    res.json({ entries: ledger.map(serializeLedger) });
  })
);

export default router;

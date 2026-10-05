import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../utils/http.js';

const router = Router();
router.use(requireAuth);

router.get('/current', asyncHandler(async (req, res) => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: req.user!.tenantId } });
  const reserved = await prisma.ledgerEntry.aggregate({
    where: { tenantId: tenant.id },
    _sum: { reservationDelta: true }
    });
  const members = await prisma.membership.count({
    where: { tenantId: tenant.id, status: 'ACTIVE' }
  });
  const openTaskCount = await prisma.exportTask.count({
    where: { tenantId: tenant.id, status: { in: ['PENDING', 'RUNNING'] } }
  });
  res.json({
    ...tenant,
    reservedUnits: reserved._sum.reservationDelta ?? 0,
    availableUnits: tenant.balance - (reserved._sum.reservationDelta ?? 0),
    memberCount: members,
    openTaskCount
  });
}));

router.post('/leave', asyncHandler(async (req, res) => {
  if (req.user!.role === 'OWNER') {
    throw new HttpError(409, '团队所有者不能直接退出，请先转让团队或联系管理员');
  }
  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: req.user!.id, tenantId: req.user!.tenantId } }
  });
  if (!membership || membership.status !== 'ACTIVE') throw new HttpError(404, '成员关系不存在或已退出');

  const [, , unfinished] = await prisma.$transaction([
    prisma.membership.update({
      where: { id: membership.id },
      data: { status: 'LEFT', leftAt: new Date(), role: 'MEMBER' }
    }),
    prisma.projectCursor.deleteMany({ where: { userId: req.user!.id } }),
    prisma.exportTask.count({
      where: { createdByUserId: req.user!.id, status: { in: ['PENDING', 'RUNNING'] } }
    })
  ]);

  res.json({
    message: unfinished > 0
      ? '已退出团队；该成员此前创建的未结任务仍按租户任务继续结算并保留审计记录'
      : '已退出团队，成员关系已归档'
  });
}));

router.get('/members', asyncHandler(async (req, res) => {
  const members = await prisma.membership.findMany({
    where: { tenantId: req.user!.tenantId },
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }]
  });
  res.json(members);
}));


export default router;

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../utils/http.js';

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  name: z.string().min(1).max(80),
  templateFavoriteId: z.string().uuid().optional()
});

const ownedProject = async (projectId: string, tenantId: string) => {
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId, status: 'ACTIVE' },
    include: {
      sourceTemplate: { select: { id: true, name: true, isDeleted: true } },
      sourceVersion: { select: { id: true, version: true, changeNote: true } }
    }
  });
  if (!project) throw new HttpError(404, '项目不存在、已删除或不属于当前团队');
  return project;
};

router.get('/', asyncHandler(async (req, res) => {
  const projects = await prisma.project.findMany({
    where: { tenantId: req.user!.tenantId, status: 'ACTIVE' },
    include: {
      sourceTemplate: { select: { id: true, name: true, isDeleted: true } },
      sourceVersion: { select: { id: true, version: true } },
      tasks: {
        where: { status: { in: ['PENDING', 'RUNNING'] } },
        select: { id: true, status: true, estimatedUnits: true }
      },
      cursors: {
        where: { userId: req.user!.id },
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: { data: true, deviceId: true, updatedAt: true }
      }
    },
    orderBy: { updatedAt: 'desc' }
  });
  res.json(projects);
}));

router.post('/', asyncHandler(async (req, res) => {
  const body = createSchema.parse(req.body);
  let source: { templateId?: string; versionId?: string; snapshot?: string } = {};

  if (body.templateFavoriteId) {
    const favorite = await prisma.templateFavorite.findFirst({
      where: {
        id: body.templateFavoriteId,
        userId: req.user!.id,
        template: { tenantId: req.user!.tenantId, isDeleted: false }
      },
      include: { template: true, version: true }
    });
    if (!favorite) throw new HttpError(404, '收藏模板不存在');
    const version = favorite.mode === 'PINNED'
      ? favorite.version
      : await prisma.templateVersion.findFirst({
        where: { templateId: favorite.templateId, version: favorite.template.currentVersion }
      });
    if (!version) throw new HttpError(409, '模板版本缺失，无法创建项目');
    source = {
      templateId: favorite.templateId,
      versionId: version.id,
      snapshot: JSON.stringify({
        templateName: favorite.template.name,
        version: version.version,
        body: version.body,
        copiedAt: new Date().toISOString()
      })
    };
  }

  const project = await prisma.project.create({
    data: { tenantId: req.user!.tenantId, name: body.name, ...source }
  });
  res.status(201).json(project);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const project = await ownedProject(String(req.params.id), req.user!.tenantId);
  res.json(project);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const project = await ownedProject(String(req.params.id), req.user!.tenantId);
  await prisma.$transaction(async (tx) => {
    const running = await tx.exportTask.count({
      where: { projectId: project.id, status: 'RUNNING' }
    });
    if (running > 0) throw new HttpError(409, '仍有工作器正在处理导出，请先取消并等待租约释放后再删除云端项目');

    const pending = await tx.exportTask.findMany({
      where: { projectId: project.id, status: 'PENDING' },
      select: { id: true, estimatedUnits: true, reservedUnits: true, artifactSize: true }
    });
    const releaseUnits = pending.reduce((sum, task) => sum + task.reservedUnits, 0);
    const releaseStorage = pending.reduce((sum, task) => sum + Number(task.artifactSize ?? 0), 0);
    const tenant = await tx.tenant.update({
      where: { id: project.tenantId },
      data: { storageUsed: { decrement: releaseStorage } }
    });

    if (pending.length > 0) {
      await tx.exportTask.updateMany({
        where: { id: { in: pending.map(task => task.id) }, status: 'PENDING' },
        data: { status: 'CANCELLED', reservedUnits: 0, finalizedAt: new Date() }
      });
      await tx.ledgerEntry.create({
        data: {
          tenantId: project.tenantId,
          kind: 'RELEASE',
          units: releaseUnits,
          amount: 0,
          reservationDelta: -releaseUnits,
          storageDelta: -releaseStorage,
          balanceAfter: tenant.balance,
          note: `删除云端项目时取消未领取任务，释放 ${releaseUnits} 个预留单位`
        }
      });
    }

    await tx.projectCursor.deleteMany({ where: { projectId: project.id } });
    await tx.project.update({ where: { id: project.id }, data: { status: 'DELETED', deletedAt: new Date() } });
  });
  res.json({ message: '云端项目已删除；本机浏览器数据不会因此清除' });
}));

router.put('/:id/cursor', asyncHandler(async (req, res) => {
  const schema = z.object({
    deviceId: z.string().min(1).max(80),
    data: z.string().min(1).max(20000)
  });
  const body = schema.parse(req.body);
  await ownedProject(String(req.params.id), req.user!.tenantId);
  const cursor = await prisma.projectCursor.upsert({
    where: {
      projectId_userId_deviceId: {
        projectId: String(req.params.id),
        userId: req.user!.id,
        deviceId: body.deviceId
      }
    },
    update: { data: body.data },
    create: { projectId: String(req.params.id), userId: req.user!.id, deviceId: body.deviceId, data: body.data }
  });
  res.json(cursor);
}));

router.get('/:id/cursors', asyncHandler(async (req, res) => {
  await ownedProject(String(req.params.id), req.user!.tenantId);
  const cursors = await prisma.projectCursor.findMany({
    where: { projectId: String(req.params.id), userId: req.user!.id },
    orderBy: { updatedAt: 'desc' }
  });
  res.json(cursors);
}));

export default router;

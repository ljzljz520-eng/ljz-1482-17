import { Router } from 'express';
import { z } from 'zod';
import { TemplateMode } from '@prisma/client';
import { prisma } from '../prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../utils/http.js';

const router = Router();
router.use(requireAuth);

const favoriteSchema = z.object({
  templateId: z.string().uuid(),
  mode: z.enum([TemplateMode.PINNED, TemplateMode.FOLLOW_LATEST]).default(TemplateMode.PINNED)
});

router.get('/', asyncHandler(async (req, res) => {
  const templates = await prisma.template.findMany({
    where: { tenantId: req.user!.tenantId, isDeleted: false },
    include: {
      versions: { orderBy: { version: 'desc' }, take: 3 },
      favorites: { where: { userId: req.user!.id }, include: { version: true } }
    },
    orderBy: { updatedAt: 'desc' }
  });
  res.json(templates);
}));

router.get('/favorites', asyncHandler(async (req, res) => {
  const favorites = await prisma.templateFavorite.findMany({
    where: { userId: req.user!.id, template: { tenantId: req.user!.tenantId } },
    include: {
      template: { include: { versions: { orderBy: { version: 'desc' }, take: 1 } } },
      version: true
    },
    orderBy: { createdAt: 'desc' }
  });
  res.json(favorites);
}));

router.post('/favorites', asyncHandler(async (req, res) => {
  const body = favoriteSchema.parse(req.body);
  const template = await prisma.template.findFirst({
    where: { id: body.templateId, tenantId: req.user!.tenantId, isDeleted: false },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } }
  });
  if (!template) throw new HttpError(404, '模板不存在或已删除');
  const latest = template.versions[0];
  if (!latest) throw new HttpError(409, '模板没有可用版本');
  const favorite = await prisma.templateFavorite.upsert({
    where: { userId_templateId: { userId: req.user!.id, templateId: template.id } },
    update: { mode: body.mode, versionId: body.mode === 'PINNED' ? latest.id : null },
    create: {
      userId: req.user!.id,
      templateId: template.id,
      mode: body.mode,
      versionId: body.mode === 'PINNED' ? latest.id : null
    }
  });
  res.status(201).json(favorite);
}));

router.put('/favorites/:id', asyncHandler(async (req, res) => {
  const body = z.object({ mode: z.enum([TemplateMode.PINNED, TemplateMode.FOLLOW_LATEST]) }).parse(req.body);
  const favorite = await prisma.templateFavorite.findFirst({
    where: { id: String(req.params.id), userId: req.user!.id, template: { tenantId: req.user!.tenantId } },
    include: { template: { include: { versions: { orderBy: { version: 'desc' }, take: 1 } } } }
  });
  if (!favorite) throw new HttpError(404, '收藏不存在');
  const updated = await prisma.templateFavorite.update({
    where: { id: favorite.id },
    data: {
      mode: body.mode,
      versionId: body.mode === 'PINNED'
        ? (favorite.versionId ?? favorite.template.versions[0]?.id)
        : null
    }
  });
  res.json(updated);
}));

router.delete('/favorites/:id', asyncHandler(async (req, res) => {
  const result = await prisma.templateFavorite.deleteMany({
    where: { id: String(req.params.id), userId: req.user!.id, template: { tenantId: req.user!.tenantId } }
  });
  if (result.count === 0) throw new HttpError(404, '收藏不存在');
  res.status(204).end();
}));

const createVersionSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).default(''),
  body: z.string().min(1).max(10000),
  changeNote: z.string().min(1).max(200)
});

router.post('/', requireRole('OWNER', 'ADMIN'), asyncHandler(async (req, res) => {
  const body = createVersionSchema.parse(req.body);
  const template = await prisma.$transaction(async (tx) => {
    const created = await tx.template.create({
      data: {
        tenantId: req.user!.tenantId,
        name: body.name,
        description: body.description,
        currentVersion: 1,
        versions: { create: { version: 1, body: body.body, changeNote: body.changeNote } }
      },
      include: { versions: true }
    });
    return created;
  });
  res.status(201).json(template);
}));

router.post('/:id/publish', requireRole('OWNER', 'ADMIN'), asyncHandler(async (req, res) => {
  const body = z.object({
    body: z.string().min(1).max(10000),
    changeNote: z.string().min(1).max(200)
  }).parse(req.body);
  const template = await prisma.template.findFirst({
    where: { id: String(req.params.id), tenantId: req.user!.tenantId, isDeleted: false }
  });
  if (!template) throw new HttpError(404, '模板不存在');
  const next = await prisma.templateVersion.create({
    data: { templateId: template.id, version: template.currentVersion + 1, body: body.body, changeNote: body.changeNote }
  });
  await prisma.template.update({ where: { id: template.id }, data: { currentVersion: next.version } });
  res.status(201).json(next);
}));

router.delete('/:id', requireRole('OWNER', 'ADMIN'), asyncHandler(async (req, res) => {
  const result = await prisma.template.updateMany({
    where: { id: String(req.params.id), tenantId: req.user!.tenantId, isDeleted: false },
    data: { isDeleted: true }
  });
  if (result.count === 0) throw new HttpError(404, '模板不存在');
  res.json({ message: '模板已从模板库移除；已创建项目保留独立来源快照，不会被抹掉' });
}));

export default router;

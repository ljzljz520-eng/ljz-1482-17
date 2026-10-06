import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/errors.js";
import { getTemplateForTenant } from "../services/authorization.js";
import { serializeTemplate } from "../utils/serializers.js";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).default(""),
  version: z.string().trim().min(1).max(30),
  changelog: z.string().trim().max(300).default("初始发布")
});

const publishSchema = z.object({
  version: z.string().trim().min(1).max(30),
  changelog: z.string().trim().max(300).default("")
});

const favoriteSchema = z.object({
  templateId: z.string().uuid(),
  mode: z.enum(["PINNED", "FOLLOWING"]),
  pinnedVersionId: z.string().uuid().optional()
});

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const templates = await prisma.template.findMany({
      where: { tenantId: req.tenantId },
      orderBy: [{ deletedAt: "asc" }, { createdAt: "desc" }],
      include: { versions: true }
    });
    const favorites = await prisma.templateFavorite.findMany({
      where: { userId: req.user.id, template: { tenantId: req.tenantId } }
    });
    res.json({
      templates: templates.map((template) =>
        serializeTemplate(
          template,
          favorites.find((favorite) => favorite.templateId === template.id) || null
        )
      )
    });
  })
);

router.post(
  "/",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const template = await prisma.template.create({
      data: {
        tenantId: req.tenantId,
        name: body.name,
        description: body.description,
        versions: { create: { version: body.version, changelog: body.changelog } }
      },
      include: { versions: true }
    });
    res.status(201).json({ template: serializeTemplate(template) });
  })
);

router.post(
  "/:id/publish",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const body = publishSchema.parse(req.body);
    const existing = await getTemplateForTenant(req.tenantId, req.params.id);
    if (existing.deletedAt) {
      return res.status(409).json({ message: "模板已删除，不能继续发布" });
    }
    const version = await prisma.templateVersion.create({
      data: { templateId: existing.id, version: body.version, changelog: body.changelog }
    });
    res.status(201).json({ version });
  })
);

router.put(
  "/favorite",
  asyncHandler(async (req, res) => {
    const body = favoriteSchema.parse(req.body);
    const template = await getTemplateForTenant(req.tenantId, body.templateId);
    if (template.deletedAt) {
      return res.status(409).json({ message: "模板已删除，不能新增或更改收藏；既有项目来源仍保留" });
    }
    let pinnedVersionId = null;
    if (body.mode === "PINNED") {
      pinnedVersionId = body.pinnedVersionId;
      if (!pinnedVersionId) {
        pinnedVersionId = [...template.versions].sort(
          (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)
        )[0]?.id;
      }
      if (!pinnedVersionId || !template.versions.some((item) => item.id === pinnedVersionId)) {
        return res.status(400).json({ message: "固定版本不存在" });
      }
    }

    const favorite = await prisma.templateFavorite.upsert({
      where: { userId_templateId: { userId: req.user.id, templateId: template.id } },
      create: {
        userId: req.user.id,
        templateId: template.id,
        mode: body.mode,
        pinnedVersionId
      },
      update: {
        templateId: template.id,
        mode: body.mode,
        pinnedVersionId
      }
    });
    res.json({ favorite });
  })
);

router.delete(
  "/:id",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const template = await getTemplateForTenant(req.tenantId, req.params.id);
    await prisma.template.update({
      where: { id: template.id },
      data: { deletedAt: new Date(), name: `${template.name}（已删除）` }
    });
    res.json({ message: "模板已标记删除；既有项目保存的 templateSnapshot 和版本关系不会被抹掉" });
  })
);

export default router;

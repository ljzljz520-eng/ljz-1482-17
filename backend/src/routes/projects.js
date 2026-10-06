import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler, HttpError } from "../utils/errors.js";
import { getProjectForTenant, getTemplateForTenant } from "../services/authorization.js";
import { serializeProject, serializeVisit } from "../utils/serializers.js";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  summary: z.string().trim().max(240).default(""),
  content: z.string().max(20000).default(""),
  templateId: z.string().uuid().optional(),
  mode: z.enum(["PINNED", "FOLLOWING"]).optional()
});

const cursorSchema = z.object({
  cursor: z.string().trim().min(1).max(120),
  content: z.string().max(20000).default("")
});

const projectUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  summary: z.string().trim().max(240).optional(),
  content: z.string().max(20000).optional()
});

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const projects = await prisma.project.findMany({
      where: { tenantId: req.tenantId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      include: { visits: { where: { userId: req.user.id } } }
    });
    res.json({ projects: projects.map(serializeProjectWithVisit) });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    let templateSnapshot = "空白项目";
    let templateId = null;
    let templateVersionId = null;

    if (body.templateId) {
      const template = await getTemplateForTenant(req.tenantId, body.templateId);
      if (template.deletedAt) {
        throw new HttpError(409, "模板已删除；可从既有项目来源继续查看快照，但不能新建项目");
      }
      const sortedVersions = [...template.versions].sort(
        (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)
      );
      const favorite = await prisma.templateFavorite.findFirst({
        where: { userId: req.user.id, templateId: template.id }
      });
      const followMode = body.mode || favorite?.mode || "FOLLOWING";
      const chosenVersion =
        followMode === "PINNED" && favorite?.pinnedVersionId
          ? sortedVersions.find((item) => item.id === favorite.pinnedVersionId) || sortedVersions[0]
          : sortedVersions[0];
      if (!chosenVersion) {
        throw new HttpError(409, "模板尚无发布版本");
      }
      templateId = template.id;
      templateVersionId = chosenVersion.id;
      templateSnapshot = `${template.name}@${chosenVersion.version}`;
    }

    const project = await prisma.project.create({
      data: {
        tenantId: req.tenantId,
        name: body.name,
        summary: body.summary,
        content: body.content,
        createdById: req.user.id,
        templateId,
        templateVersionId,
        templateSnapshot
      }
    });
    res.status(201).json({ project: serializeProject(project) });
  })
);

router.get(
  "/:id/open",
  asyncHandler(async (req, res) => {
    const project = await getProjectForTenant(req.tenantId, req.params.id);
    const visit = await prisma.projectVisit.findUnique({
      where: { userId_projectId: { userId: req.user.id, projectId: project.id } }
    });
    res.json({
      project: serializeProject(project),
      cloudCursor: visit ? serializeVisit(visit) : null,
      hint: "云端游标用于跨设备恢复；是否覆盖本机未保存草稿由前端基于本地版本明确询问。"
    });
  })
);

router.put(
  "/:id/cursor",
  asyncHandler(async (req, res) => {
    const body = cursorSchema.parse(req.body);
    const project = await getProjectForTenant(req.tenantId, req.params.id);
    const visit = await prisma.projectVisit.upsert({
      where: { userId_projectId: { userId: req.user.id, projectId: project.id } },
      create: {
        tenantId: req.tenantId,
        userId: req.user.id,
        projectId: project.id,
        cursor: body.cursor,
        content: body.content
      },
      update: {
        cursor: body.cursor,
        content: body.content,
        visitedAt: new Date()
      }
    });
    res.json({ visit: serializeVisit(visit) });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = projectUpdateSchema.parse(req.body);
    const project = await getProjectForTenant(req.tenantId, req.params.id);
    const updated = await prisma.project.update({
      where: { id: project.id },
      data: body
    });
    res.json({ project: serializeProject(updated) });
  })
);

router.delete(
  "/:id",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const project = await getProjectForTenant(req.tenantId, req.params.id);
    await prisma.project.update({
      where: { id: project.id },
      data: {
        deletedAt: new Date(),
        name: `${project.name}（已删除）`
      }
    });
    res.json({ message: "云端项目已移入删除状态；历史账目和导出记录仍按租户保留" });
  })
);

function serializeProjectWithVisit(project) {
  return {
    ...serializeProject(project),
    lastVisit: project.visits[0] ? serializeVisit(project.visits[0]) : null
  };
}

export default router;

import { prisma } from "../config/prisma.js";
import { HttpError } from "../utils/errors.js";

export async function getProjectForTenant(tenantId, projectId, { allowDeleted = false } = {}) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId, ...(allowDeleted ? {} : { deletedAt: null }) }
  });
  if (!project) {
    throw new HttpError(404, "项目不存在或已被删除");
  }
  return project;
}

export async function getTemplateForTenant(tenantId, templateId, { allowDeleted = true } = {}) {
  const template = await prisma.template.findFirst({
    where: { id: templateId, tenantId, ...(allowDeleted ? {} : { deletedAt: null }) },
    include: { versions: true }
  });
  if (!template) {
    throw new HttpError(404, "模板不存在");
  }
  return template;
}

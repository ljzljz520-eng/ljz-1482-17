import { Prisma, TaskStatus, TaskScenario } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { HttpError } from "../utils/errors.js";
import { getProjectForTenant } from "./authorization.js";
import { billingService } from "./billing.js";
import { logger } from "../config/logger.js";

const ACTIVE_STATUSES = [TaskStatus.QUEUED, TaskStatus.RUNNING, TaskStatus.CANCELLING];
const STORAGE_BUFFER_BYTES = 512;

const createSchemaShape = {
  projectId: (z) => z.string().uuid(),
  estimatedUnits: (z) => z.coerce.number().int().min(1).max(1000),
  scenario: (z) => z.nativeEnum(TaskScenario).default(TaskScenario.NORMAL),
  clientRequestId: (z) => z.string().trim().min(8).max(120)
};

export async function createExportTask({ tenantId, userId, body }) {
  const { z } = await import("zod");
  const schema = z.object(Object.fromEntries(Object.entries(createSchemaShape).map(([k, fn]) => [k, fn(z)])));
  const input = schema.parse(body);
  await getProjectForTenant(tenantId, input.projectId);

  const existing = await prisma.exportTask.findUnique({
    where: { clientRequestId: input.clientRequestId },
    include: { project: true }
  });
  if (existing) {
    if (existing.tenantId !== tenantId) {
      throw new HttpError(403, "不能访问其他租户的导出请求");
    }
    return existing;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const task = await tx.exportTask.create({
        data: {
          tenantId,
          projectId: input.projectId,
          requestedById: userId,
          clientRequestId: input.clientRequestId,
          estimatedUnits: input.estimatedUnits,
          scenario: input.scenario,
          attempt: 0,
          status: TaskStatus.QUEUED
        }
      });

      await billingService.reserveUnits(tx, tenantId, task, input.estimatedUnits);
      logger.info({ taskId: task.id, units: input.estimatedUnits }, "Export quota reserved");
      return task;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.exportTask.findUnique({
        where: { clientRequestId: input.clientRequestId },
        include: { project: true }
      });
      if (!duplicate || duplicate.tenantId !== tenantId) {
        throw new HttpError(403, "不能访问其他租户的导出请求");
      }
      logger.info({ taskId: duplicate.id }, "Idempotent duplicate export request returned");
      return duplicate;
    }
    throw error;
  }
}

export async function listTasks(tenantId, filters = {}) {
  return prisma.exportTask.findMany({
    where: {
      tenantId,
      ...(filters.status ? { status: filters.status } : {})
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { project: true }
  });
}

export async function getTaskForUser(tenantId, taskId) {
  const task = await prisma.exportTask.findFirst({
    where: { id: taskId, tenantId },
    include: { project: true }
  });
  if (!task) {
    throw new HttpError(404, "导出任务不存在");
  }
  return task;
}

function assertTaskActor(task, actor) {
  const isAdministrator = actor.role === "OWNER" || actor.role === "ADMIN";
  if (task.requestedById !== actor.id && !isAdministrator) {
    throw new HttpError(403, "只能操作本人发起的导出任务，或请团队管理员处理");
  }
}

export async function cancelTask(tenantId, taskId, actor) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.exportTask.findFirst({ where: { id: taskId, tenantId } });
    if (!task) {
      throw new HttpError(404, "导出任务不存在");
    }
    assertTaskActor(task, actor);

    if (task.status === TaskStatus.CANCELED || task.status === TaskStatus.SUCCEEDED) {
      return task;
    }
    if (task.status === TaskStatus.FAILED) {
      throw new HttpError(409, "失败任务未继续扣费，请使用重试重新预留");
    }
    if (task.status === TaskStatus.QUEUED) {
      const updated = await tx.exportTask.updateMany({
        where: { id: task.id, status: TaskStatus.QUEUED },
        data: { status: TaskStatus.CANCELED, cancelRequestedAt: new Date(), completedAt: new Date() }
      });
      if (updated.count === 1) {
        await billingService.releaseReservation(tx, tenantId, task, "排队中取消，释放全部预留");
      }
      return tx.exportTask.findUniqueOrThrow({ where: { id: task.id }, include: { project: true } });
    }

    if (task.status === TaskStatus.RUNNING) {
      const requested = await tx.exportTask.updateMany({
        where: { id: task.id, status: TaskStatus.RUNNING },
        data: { status: TaskStatus.CANCELLING, cancelRequestedAt: new Date() }
      });
      if (requested.count === 0) {
        const latest = await tx.exportTask.findUniqueOrThrow({ where: { id: task.id }, include: { project: true } });
        return latest;
      }
    }

    return tx.exportTask.findUniqueOrThrow({ where: { id: task.id }, include: { project: true } });
  });
}

export async function retryTask(tenantId, taskId, actor) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.exportTask.findFirst({ where: { id: taskId, tenantId } });
    if (!task) {
      throw new HttpError(404, "导出任务不存在");
    }
    assertTaskActor(task, actor);
    if (task.status !== TaskStatus.FAILED) {
      throw new HttpError(409, "只有失败任务可以重试");
    }
    if (task.actualUnits !== null) {
      throw new HttpError(409, "任务已结算，不能按失败重试");
    }

    const nextAttempt = task.attempt + 1;
    await tx.exportTask.update({
      where: { id: task.id },
      data: {
        attempt: nextAttempt,
        scenario: TaskScenario.NORMAL,
        status: TaskStatus.QUEUED,
        failureReason: null,
        workerId: null,
        leasedAt: null,
        lastHeartbeatAt: null,
        resultUrl: null,
        resultName: null,
        resultBytes: null
      }
    });
    const refreshed = await tx.exportTask.findUniqueOrThrow({ where: { id: task.id } });
    await billingService.reserveUnits(tx, tenantId, refreshed, refreshed.estimatedUnits);
    return tx.exportTask.findUniqueOrThrow({ where: { id: task.id }, include: { project: true } });
  });
}

export async function claimQueuedTask(workerId) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.exportTask.findFirst({
      where: { status: TaskStatus.QUEUED },
      orderBy: { createdAt: "asc" }
    });
    if (!task) return null;

    const claimed = await tx.exportTask.updateMany({
      where: { id: task.id, tenantId: task.tenantId, status: TaskStatus.QUEUED },
      data: {
        status: TaskStatus.RUNNING,
        workerId,
        leasedAt: new Date(),
        lastHeartbeatAt: new Date()
      }
    });
    return claimed.count === 1
      ? tx.exportTask.findUniqueOrThrow({ where: { id: task.id }, include: { project: true } })
      : null;
  });
}

export async function heartbeatTask(taskId, workerId) {
  const updated = await prisma.exportTask.updateMany({
    where: { id: taskId, workerId, status: { in: [TaskStatus.RUNNING, TaskStatus.CANCELLING] } },
    data: { lastHeartbeatAt: new Date() }
  });
  if (updated.count === 0) {
    throw new HttpError(409, "任务租约已失效");
  }
}

export async function completeTask(taskId, workerId, payload = {}) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.exportTask.findFirst({ where: { id: taskId, workerId } });
    if (!task) {
      throw new HttpError(404, "任务租约不存在");
    }
    if ([TaskStatus.SUCCEEDED, TaskStatus.CANCELED, TaskStatus.FAILED].includes(task.status)) {
      return task;
    }
    if (task.status === TaskStatus.CANCELLING && task.scenario !== TaskScenario.CANCEL_RACE) {
      throw new HttpError(409, "任务已取消，完成结果被拒绝");
    }
    if (task.status !== TaskStatus.RUNNING &&
        !(task.status === TaskStatus.CANCELLING && task.scenario === TaskScenario.CANCEL_RACE)) {
      throw new HttpError(409, "任务不在可完成状态");
    }

    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: task.tenantId } });
    const actualUnits = Math.max(1, Math.min(task.estimatedUnits, Number(payload.actualUnits || task.estimatedUnits)));
    const resultBytes = BigInt(Math.max(0, Number(payload.resultBytes || estimateResultBytes(task, actualUnits))));

    const storageClaimed = await tx.tenant.updateMany({
      where: { id: tenant.id, storageUsed: { lte: tenant.storageLimit - resultBytes } },
      data: { storageUsed: { increment: resultBytes } }
    });
    if (storageClaimed.count !== 1) {
      throw new HttpError(409, "存储空间不足，导出结果无法落盘");
    }

    try {
      await billingService.settleUnits(tx, task.tenantId, task, actualUnits);
    } catch (error) {
      await tx.tenant.update({
        where: { id: tenant.id },
        data: { storageUsed: { decrement: resultBytes } }
      });
      throw error;
    }
    const resultName = `${task.project?.name || "project"}-export-${Date.now()}.txt`;
    await tx.exportTask.update({
      where: { id: task.id },
      data: {
        status: TaskStatus.SUCCEEDED,
        actualUnits,
        resultName,
        resultUrl: `/api/exports/${task.id}/download`,
        resultBytes,
        completedAt: new Date(),
        lastHeartbeatAt: new Date()
      }
    });
    return tx.exportTask.findUniqueOrThrow({ where: { id: task.id }, include: { project: true } });
  });
}

export async function failTask(taskId, workerId, reason) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.exportTask.findFirst({ where: { id: taskId, workerId } });
    if (!task) {
      throw new HttpError(404, "任务租约不存在");
    }
    if ([TaskStatus.SUCCEEDED, TaskStatus.CANCELED, TaskStatus.FAILED].includes(task.status)) {
      return task;
    }
    if (task.status === TaskStatus.CANCELLING) {
      const claimed = await tx.exportTask.updateMany({
        where: { id: task.id, workerId, status: TaskStatus.CANCELLING },
        data: { status: TaskStatus.CANCELED, completedAt: new Date(), failureReason: reason }
      });
      if (claimed.count !== 1) {
        return tx.exportTask.findUniqueOrThrow({ where: { id: task.id }, include: { project: true } });
      }
      await billingService.releaseReservation(tx, task.tenantId, task, "取消竞争中工作器终止，释放预留");
      return tx.exportTask.findUniqueOrThrow({ where: { id: task.id }, include: { project: true } });
    }

    const claimed = await tx.exportTask.updateMany({
      where: {
        id: task.id,
        workerId,
        status: { in: [TaskStatus.QUEUED, TaskStatus.RUNNING] }
      },
      data: {
        status: TaskStatus.FAILED,
        failureReason: reason,
        completedAt: new Date(),
        lastHeartbeatAt: new Date()
      }
    });
    if (claimed.count !== 1) {
      return tx.exportTask.findUniqueOrThrow({ where: { id: task.id }, include: { project: true } });
    }
    await billingService.releaseReservation(tx, task.tenantId, task, "执行失败，释放预留");
    return tx.exportTask.findUniqueOrThrow({ where: { id: task.id }, include: { project: true } });
  });
}

export async function reapLostTasks(timeoutMs) {
  const cutoff = new Date(Date.now() - timeoutMs);
  const staleTasks = await prisma.exportTask.findMany({
    where: {
      status: { in: [TaskStatus.RUNNING, TaskStatus.CANCELLING] },
      lastHeartbeatAt: { lt: cutoff }
    },
    take: 10
  });

  for (const task of staleTasks) {
    try {
      // State transition and accounting are one transaction so a release cannot outlive a failed claim.
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.exportTask.updateMany({
          where: { id: task.id, status: task.status, lastHeartbeatAt: { lt: cutoff } },
          data: {
            status: TaskStatus.FAILED,
            failureReason: "工作器心跳超时，已判定失联",
            completedAt: new Date()
          }
        });
        if (claimed.count !== 1) return;
        await billingService.releaseReservation(tx, task.tenantId, task, "工作器失联，释放未结算预留");
      });
      logger.warn({ taskId: task.id, workerId: task.workerId }, "Lost worker reservation released");
    } catch (error) {
      logger.error({ err: error, taskId: task.id }, "Failed to reap lost task");
    }
  }
}

function estimateResultBytes(task, actualUnits) {
  if (task.scenario === TaskScenario.STORAGE_FULL) {
    return 11 * 1024 * 1024 * 1024;
  }
  return Math.max(STORAGE_BUFFER_BYTES, actualUnits * 1024);
}

export { ACTIVE_STATUSES };

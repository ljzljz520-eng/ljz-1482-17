import { Prisma, type TaskStatus } from '@prisma/client';
import { prisma } from '../prisma.js';
import { HttpError } from '../utils/http.js';

export type Quality = 'DRAFT' | 'STANDARD' | 'PREMIUM';
export type FailureMode = 'NONE' | 'FAIL_ONCE' | 'WORKER_LOST';

export interface CreateTaskInput {
  tenantId: string;
  projectId: string;
  userId: string;
  idempotencyKey: string;
  quality: Quality;
  failureMode?: FailureMode;
}

export const LEASE_SECONDS = Number(process.env.TASK_LEASE_SECONDS ?? 45);
const QUALITY_UNITS: Record<Quality, number> = { DRAFT: 4, STANDARD: 10, PREMIUM: 18 };
const QUALITY_BYTES: Record<Quality, number> = { DRAFT: 1200, STANDARD: 3200, PREMIUM: 6800 };

const assertProject = async (tenantId: string, projectId: string) => {
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId, status: 'ACTIVE' } });
  if (!project) throw new HttpError(404, '项目不存在、已删除或不属于当前团队');
  return project;
};

export const getTaskById = async (tenantId: string, taskId: string) => {
  const task = await prisma.exportTask.findFirst({
    where: { id: taskId, tenantId },
    include: {
      project: { select: { id: true, name: true, sourceTemplate: { select: { name: true } } } },
      artifacts: true,
      attempts: { orderBy: { startedAt: 'desc' }, take: 3 }
    }
  });
  if (!task) throw new HttpError(404, '导出任务不存在或不属于当前团队');
  return task;
};

interface TenantLockRow {
  balance: number;
  storageused: number;
  storagequota: number;
}

const lockTenant = (tx: Prisma.TransactionClient, tenantId: string) =>
  tx.$queryRaw<TenantLockRow[]>`
    SELECT balance, "storageUsed", "storageQuota"
    FROM "Tenant" WHERE id = ${tenantId} FOR UPDATE
  `;

export const createExportTask = async (input: CreateTaskInput) => {
  await assertProject(input.tenantId, input.projectId);
  const estimatedUnits = QUALITY_UNITS[input.quality];
  const artifactSize = QUALITY_BYTES[input.quality];

  try {
    const task = await prisma.$transaction(async (tx) => {
      const [tenant] = await lockTenant(tx, input.tenantId);
      if (!tenant) throw new HttpError(404, '团队不存在');
      const sums = await tx.ledgerEntry.aggregate({
        where: { tenantId: input.tenantId },
        _sum: { reservationDelta: true, storageDelta: true }
      });
      const reservedUnits = sums._sum.reservationDelta ?? 0;
      const reservedStorage = sums._sum.storageDelta ?? 0;
      if (tenant.balance - reservedUnits < estimatedUnits) {
        throw new HttpError(402, '配额余额不足：未建立预留，也未扣减任何额度');
      }
      if (tenant.storageused + reservedStorage + artifactSize > tenant.storagequota) {
        throw new HttpError(507, '团队存储空间不足：无法预留导出文件');
      }

      const created = await tx.exportTask.create({
        data: {
          tenantId: input.tenantId,
          projectId: input.projectId,
          createdByUserId: input.userId,
          idempotencyKey: input.idempotencyKey,
          requestedUnits: estimatedUnits,
          estimatedUnits,
          reservedUnits: estimatedUnits,
          artifactSize,
          failureMode: input.failureMode ?? 'NONE',
          status: 'PENDING'
        }
      });
      await tx.tenant.update({
        where: { id: input.tenantId },
        data: { storageUsed: { increment: artifactSize } }
      });
      await tx.ledgerEntry.create({
        data: {
          tenantId: input.tenantId,
          taskId: created.id,
          kind: 'RESERVE',
          units: estimatedUnits,
          amount: 0,
          reservationDelta: estimatedUnits,
          storageDelta: artifactSize,
          balanceAfter: tenant.balance,
          note: `提交导出并预留 ${estimatedUnits} 个计费单位（提交时不实际扣减）`
        }
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { task, replayed: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const replayed = await prisma.exportTask.findUniqueOrThrow({
        where: { tenantId_projectId_idempotencyKey: {
          tenantId: input.tenantId,
          projectId: input.projectId,
          idempotencyKey: input.idempotencyKey
        }}
      });
      return { task: replayed, replayed: true };
    }
    throw error;
  }
};

const leaseExpiry = () => new Date(Date.now() + LEASE_SECONDS * 1000);

export const leaseTask = async (tenantId: string, taskId: string, workerId: string) => {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const current = await tx.exportTask.findFirst({ where: { id: taskId, tenantId } });
    if (!current) throw new HttpError(404, '导出任务不存在或不属于当前团队');
    const leasable = await tx.exportTask.updateMany({
      where: {
        id: taskId,
        tenantId,
        OR: [{ status: 'PENDING' }, { status: 'RUNNING', leaseExpiresAt: { lt: now } }]
      },
      data: {
        status: 'RUNNING',
        leasedBy: workerId,
        leasedAt: now,
        leaseExpiresAt: leaseExpiry(),
        leaseToken: { increment: 1 },
        cancelRequestedAt: null
      }
    });
    if (leasable.count === 0) throw new HttpError(409, '任务已被其他工作器领取或已结束');
    const leased = await tx.exportTask.findUniqueOrThrow({ where: { id: taskId } });
    await tx.taskAttempt.create({ data: { taskId, workerId, fenceVersion: leased.leaseToken } });
    return getTaskById(tenantId, taskId);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
};

const settleReservation = async (
  tx: Prisma.TransactionClient,
  taskId: string,
  tenantId: string,
  finalStatus: TaskStatus,
  actualUnits?: number
) => {
  const task = await tx.exportTask.findUniqueOrThrow({ where: { id: taskId } });
  const succeeded = finalStatus === 'SUCCEEDED';
  const releasedStorage = succeeded ? 0 : Number(task.artifactSize ?? 0);
  const tenant = await tx.tenant.update({
    where: { id: tenantId },
    data: {
      ...(actualUnits ? { balance: { decrement: actualUnits } } : {}),
      ...(releasedStorage ? { storageUsed: { decrement: releasedStorage } } : {})
    }
  });
  await tx.ledgerEntry.create({
    data: {
      tenantId,
      taskId,
      kind: succeeded ? 'CONSUME' : 'RELEASE',
      units: actualUnits ?? task.estimatedUnits,
      amount: actualUnits ? -actualUnits : 0,
      reservationDelta: -task.reservedUnits,
      storageDelta: -releasedStorage,
      balanceAfter: tenant.balance,
      note: succeeded
        ? `任务完成，按实际消费结算 ${actualUnits} 个单位`
        : `任务结束为 ${finalStatus}，释放全部预留且不扣费`
    }
  });
  return tx.exportTask.update({
    where: { id: taskId },
    data: {
      status: finalStatus,
      actualUnits: actualUnits ?? null,
      reservedUnits: 0,
      finalizedAt: new Date(),
      leaseExpiresAt: null
    }
  });
};

export const completeTask = async (tenantId: string, taskId: string, fenceToken: number, content: string) => {
  await getTaskById(tenantId, taskId);
  return prisma.$transaction(async (tx) => {
    const task = await tx.exportTask.findUniqueOrThrow({ where: { id: taskId } });
    if (task.leaseToken !== fenceToken) throw new HttpError(409, '工作器租约已失效（fencing token 不匹配），结果被拒绝');
    if (task.status === 'SUCCEEDED') return task;
    if (task.status !== 'RUNNING') throw new HttpError(409, `任务当前为 ${task.status}，旧工作器不能再完成它`);
    if (task.leaseExpiresAt && task.leaseExpiresAt < new Date()) {
      throw new HttpError(409, '工作器租约已过期，完成请求被拒绝，等待清理器释放后可重试');
    }
    const actualUnits = task.cancelRequestedAt
      ? task.estimatedUnits
      : Math.max(1, Math.round(task.estimatedUnits * 0.9));
    const updated = await settleReservation(tx, taskId, tenantId, 'SUCCEEDED', actualUnits);
    await tx.exportArtifact.create({
      data: {
        taskId,
        tenantId,
        fileName: `${task.id}.export.txt`,
        sizeBytes: Number(task.artifactSize ?? 0),
        mimeType: 'text/plain',
        content
      }
    });
    await tx.taskAttempt.updateMany({
      where: { taskId, fenceVersion: fenceToken },
      data: { endedAt: new Date(), outcome: task.cancelRequestedAt ? 'SUCCEEDED_AFTER_CANCEL' : 'SUCCEEDED' }
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
};

export const failTask = async (tenantId: string, taskId: string, fenceToken: number, reason: string) => {
  await getTaskById(tenantId, taskId);
  return prisma.$transaction(async (tx) => {
    const task = await tx.exportTask.findUniqueOrThrow({ where: { id: taskId } });
    if (task.leaseToken !== fenceToken) throw new HttpError(409, '工作器租约已失效，失败结果被拒绝');
    if (task.status === 'FAILED' || task.status === 'CANCELLED') return task;
    if (task.status !== 'RUNNING') throw new HttpError(409, `任务当前为 ${task.status}，不能上报失败`);
    if (task.leaseExpiresAt && task.leaseExpiresAt < new Date()) {
      throw new HttpError(409, '工作器租约已过期，失败上报被拒绝，等待清理器统一释放');
    }
    const finalStatus = task.cancelRequestedAt ? 'CANCELLED' : 'FAILED';
    const updated = await settleReservation(tx, taskId, tenantId, finalStatus);
    await tx.taskAttempt.updateMany({
      where: { taskId, fenceVersion: fenceToken },
      data: { endedAt: new Date(), outcome: reason }
    });
    return updated;
  });
};

export const cancelTask = async (tenantId: string, taskId: string) => {
  await getTaskById(tenantId, taskId);
  return prisma.$transaction(async (tx) => {
    const task = await tx.exportTask.findUniqueOrThrow({ where: { id: taskId } });
    if (task.status === 'SUCCEEDED') throw new HttpError(409, '导出已经完成并按实际消费结算，取消不能撤销已完成任务');
    if (['CANCELLED', 'EXPIRED', 'FAILED'].includes(task.status)) {
      return { task, accepted: false, message: '任务已结束，预留此前已释放，重复取消不会再次入账' };
    }
    if (task.status === 'PENDING' || !task.leaseExpiresAt || task.leaseExpiresAt < new Date()) {
      const updated = await settleReservation(tx, taskId, tenantId, 'CANCELLED');
      return { task: updated, accepted: true, message: '任务已取消，预留额度和存储空间已释放' };
    }
    const updated = await tx.exportTask.update({
      where: { id: taskId },
      data: { cancelRequestedAt: new Date() }
    });
    return { task: updated, accepted: true, message: '已请求取消；若工作器在不可取消点完成，则以完成结算为准' };
  });
};

export const retryTask = async (tenantId: string, taskId: string) => {
  await getTaskById(tenantId, taskId);
  return prisma.$transaction(async (tx) => {
    const task = await tx.exportTask.findUniqueOrThrow({ where: { id: taskId } });
    if (!['FAILED', 'CANCELLED', 'EXPIRED'].includes(task.status)) {
      throw new HttpError(409, '只有失败、取消或失联释放后的任务可以重试');
    }
    const [tenant] = await lockTenant(tx, tenantId);
    const sums = await tx.ledgerEntry.aggregate({ where: { tenantId }, _sum: { reservationDelta: true, storageDelta: true } });
    if (tenant.balance - (sums._sum.reservationDelta ?? 0) < task.estimatedUnits) {
      throw new HttpError(402, '配额余额不足，重试未建立新预留');
    }
    const size = Number(task.artifactSize ?? 0);
    if (tenant.storageused + (sums._sum.storageDelta ?? 0) + size > tenant.storagequota) {
      throw new HttpError(507, '存储空间不足，重试未建立新预留');
    }
    const reset = await tx.exportTask.updateMany({
      where: {
        id: taskId,
        tenantId,
        status: { in: ['FAILED', 'CANCELLED', 'EXPIRED'] },
        reservedUnits: 0
      },
      data: {
        status: 'PENDING',
        reservedUnits: task.estimatedUnits,
        actualUnits: null,
        leasedBy: null,
        leasedAt: null,
        leaseExpiresAt: null,
        leaseToken: { increment: 1 },
        finalizedAt: null,
        cancelRequestedAt: null,
        failureMode: 'NONE'
      }
    });
    if (reset.count === 0) throw new HttpError(409, '重试请求存在竞争：该任务已被其他请求重新预留，未重复扣减额度');
    await tx.tenant.update({ where: { id: tenantId }, data: { storageUsed: { increment: size } } });
    await tx.ledgerEntry.create({
      data: {
        tenantId,
        taskId,
        kind: 'RESERVE',
        units: task.estimatedUnits,
        amount: 0,
        reservationDelta: task.estimatedUnits,
        storageDelta: size,
        balanceAfter: tenant.balance,
        note: '失败后重试：旧预留已释放，此账目重新预留一次'
      }
    });
    return tx.exportTask.findUniqueOrThrow({ where: { id: taskId } });
  });
};

export const reapExpiredLeases = async () => {
  const now = new Date();
  const expired = await prisma.exportTask.findMany({
    where: { status: 'RUNNING', leaseExpiresAt: { lt: now } },
    select: { id: true, tenantId: true },
    take: 20
  });
  for (const item of expired) {
    await prisma.$transaction(async (tx) => {
      const task = await tx.exportTask.findUniqueOrThrow({ where: { id: item.id } });
      if (task.status !== 'RUNNING' || !task.leaseExpiresAt || task.leaseExpiresAt >= now) return;
      const reaped = await settleReservation(tx, item.id, item.tenantId, 'EXPIRED');
      if (reaped.status === 'EXPIRED') {
        await tx.exportTask.updateMany({
          where: { id: item.id, status: 'EXPIRED', leaseToken: reaped.leaseToken },
          data: { leasedBy: null, leaseToken: { increment: 1 } }
        });
      }
    });
  }
  return expired.length;
};

export const simulateWorkerLost = async (tenantId: string, taskId: string) => {
  await getTaskById(tenantId, taskId);
  const result = await prisma.exportTask.updateMany({
    where: { id: taskId, tenantId, status: 'RUNNING' },
    data: { leaseExpiresAt: new Date(Date.now() - 1000), leaseToken: { increment: 1 } }
  });
  if (result.count === 0) throw new HttpError(409, '只有已领取且运行中的任务可以模拟工作器失联');
  return getTaskById(tenantId, taskId);
};

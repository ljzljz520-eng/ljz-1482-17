import { prisma } from "../config/prisma.js";
import { LedgerType } from "@prisma/client";
import { HttpError } from "../utils/errors.js";
import { logger } from "../config/logger.js";

async function writeLedger(tx, tenantId, payload) {
  const { taskId, entryKey, type, amount = 0, heldDelta = 0, note } = payload;
  const account = await tx.billingAccount.findUniqueOrThrow({ where: { tenantId } });
  const balanceAfter = account.availableBalance + amount;
  const heldAfter = account.heldAmount + heldDelta;

  if (balanceAfter < 0 || heldAfter < 0) {
    throw new HttpError(409, "账目余额不能为负，操作已拒绝");
  }
  if (type === "RELEASE" && heldDelta < 0 && Math.abs(heldDelta) > account.heldAmount) {
    throw new HttpError(409, "释放额度不能超过当前冻结预留");
  }

  const updated = await tx.billingAccount.updateMany({
    where: { tenantId, version: account.version },
    data: {
      availableBalance: balanceAfter,
      heldAmount: heldAfter,
      version: { increment: 1 }
    }
  });
  if (updated.count !== 1) {
    throw new HttpError(409, "账户版本冲突，请重试");
  }

  return tx.billingLedger.create({
    data: {
      tenantId,
      taskId,
      entryKey,
      type,
      amount,
      heldDelta,
      balanceAfter,
      heldAfter,
      note
    }
  });
}

async function reserveUnits(tx, tenantId, task, units) {
  const account = await tx.billingAccount.findUniqueOrThrow({ where: { tenantId } });
  const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const remainingPlan = tenant.exportQuota - account.consumedTotal;

  if (units <= 0) {
    throw new HttpError(400, "预留额度必须大于 0");
  }
  if (remainingPlan < units) {
    throw new HttpError(409, `实际配额不足：团队剩余 ${remainingPlan}，本次需要 ${units}`);
  }
  if (account.availableBalance < units) {
    throw new HttpError(409, `余额不足：可用 ${account.availableBalance}，本次预留 ${units}`);
  }

  await writeLedger(tx, tenantId, {
    taskId: task.id,
    entryKey: `${task.id}:RESERVE:${task.attempt}`,
    type: LedgerType.RESERVE,
    amount: -units,
    heldDelta: units,
    note: "提交导出时冻结预留"
  });
}

async function settleUnits(tx, tenantId, task, actualUnits) {
  if (task.actualUnits !== null) {
    logger.warn({ taskId: task.id }, "Task was already settled");
    return null;
  }
  if (actualUnits < 0 || actualUnits > task.estimatedUnits) {
    throw new HttpError(400, "实际消费必须位于 0 到预额度之间");
  }

  const releaseUnused = task.estimatedUnits - actualUnits;
  await writeLedger(tx, tenantId, {
    taskId: task.id,
    entryKey: `${task.id}:SETTLE`,
    type: LedgerType.SETTLE,
    amount: releaseUnused,
    heldDelta: -task.estimatedUnits,
    note: `完成时结算 ${actualUnits}，释放未使用 ${releaseUnused}`
  });
  await tx.billingAccount.update({
    where: { tenantId },
    data: { consumedTotal: { increment: actualUnits } }
  });
}

async function releaseReservation(tx, tenantId, task, note) {
  if (task.actualUnits !== null) {
    logger.info({ taskId: task.id }, "Skip release because task was settled");
    return null;
  }
  return writeLedger(tx, tenantId, {
    taskId: task.id,
    entryKey: `${task.id}:RELEASE:${task.attempt}`,
    type: LedgerType.RELEASE,
    amount: task.estimatedUnits,
    heldDelta: -task.estimatedUnits,
    note
  });
}

export const billingService = {
  reserveUnits,
  settleUnits,
  releaseReservation
};

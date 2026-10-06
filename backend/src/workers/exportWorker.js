import { randomUUID } from "crypto";
import { TaskScenario } from "@prisma/client";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import {
  claimQueuedTask,
  completeTask,
  failTask,
  heartbeatTask,
  reapLostTasks
} from "../services/tasks.js";

const workerId = `worker-${randomUUID()}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function delayFor(scenario) {
  switch (scenario) {
    case TaskScenario.WORKER_LOST:
      return 9000;
    case TaskScenario.CANCEL_RACE:
      return 5000;
    default:
      return 3500;
  }
}

async function runTask(task) {
  const startedAt = Date.now();
  const duration = delayFor(task.scenario);
  const heartbeat = setInterval(async () => {
    try {
      if (task.scenario !== TaskScenario.WORKER_LOST) {
        await heartbeatTask(task.id, workerId);
      }
    } catch (error) {
      logger.warn({ err: error.message, taskId: task.id }, "Heartbeat stopped");
      clearInterval(heartbeat);
    }
  }, 1500);

  try {
    await sleep(duration);
    const latest = await heartbeatTask(task.id, workerId).then(
      () => "alive",
      () => "lost"
    );
    if (latest === "lost") {
      logger.warn({ taskId: task.id }, "Worker stops because lease was lost");
      return;
    }
    if (task.scenario === TaskScenario.FAIL_ONCE) {
      await failTask(task.id, workerId, "模拟一次性失败：冻结已释放，可点击重试");
      return;
    }
    if (task.scenario === TaskScenario.STORAGE_FULL) {
      try {
        await completeTask(task.id, workerId, {});
      } catch (error) {
        await failTask(task.id, workerId, `存储空间不足或结果无法落盘：${error.message}`);
      }
      return;
    }

    const actualUnits = Math.max(1, Math.round(task.estimatedUnits * 0.75));
    await completeTask(task.id, workerId, {
      actualUnits,
      resultBytes: Math.max(512, actualUnits * 1024)
    });
    logger.info(
      { taskId: task.id, durationMs: Date.now() - startedAt },
      "Export task completed and settled"
    );
  } catch (error) {
    logger.error({ err: error, taskId: task.id }, "Export worker failed");
    try {
      await failTask(task.id, workerId, error.message);
    } catch (finalError) {
      logger.error({ err: finalError, taskId: task.id }, "Unable to mark worker failure");
    }
  } finally {
    clearInterval(heartbeat);
  }
}

export async function startWorker() {
  logger.info({ workerId }, "Export worker started");
  let running = false;

  const tick = async () => {
    try {
      await reapLostTasks(env.heartbeatTimeoutMs);
      if (!running) {
        running = true;
        const task = await claimQueuedTask();
        if (task) {
          await runTask(task);
        }
        running = false;
      }
    } catch (error) {
      running = false;
      logger.error({ err: error }, "Worker tick failed");
    } finally {
      setTimeout(tick, 700);
    }
  };

  tick();
}

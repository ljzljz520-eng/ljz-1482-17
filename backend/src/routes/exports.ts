import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../utils/http.js';
import {
  LEASE_SECONDS,
  cancelTask,
  completeTask,
  createExportTask,
  failTask,
  getTaskById,
  leaseTask,
  reapExpiredLeases,
  retryTask,
  simulateWorkerLost
} from '../services/taskService.js';

const router = Router();
router.use(requireAuth);

const createTaskSchema = z.object({
  projectId: z.string().uuid(),
  quality: z.enum(['DRAFT', 'STANDARD', 'PREMIUM']).default('STANDARD'),
  failureMode: z.enum(['NONE', 'FAIL_ONCE', 'WORKER_LOST']).default('NONE'),
  idempotencyKey: z.string().min(8).max(120).optional()
});

const queryString = (value: unknown) => (typeof value === 'string' ? value : undefined);

router.get('/tasks', asyncHandler(async (req, res) => {
  const projectId = queryString(req.query.projectId);
  const tasks = await prisma.exportTask.findMany({
    where: { tenantId: req.user!.tenantId, ...(projectId ? { projectId } : {}) },
    include: {
      project: { select: { name: true } },
      artifacts: { select: { id: true, fileName: true, sizeBytes: true, createdAt: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
  res.json(tasks);
}));

router.get('/ledger', asyncHandler(async (req, res) => {
  const taskId = queryString(req.query.taskId);
  const entries = await prisma.ledgerEntry.findMany({
    where: { tenantId: req.user!.tenantId, ...(taskId ? { taskId } : {}) },
    include: { task: { select: { id: true, project: { select: { name: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: 200
  });
  res.json(entries);
}));

router.post('/tasks', asyncHandler(async (req, res) => {
  const body = createTaskSchema.parse(req.body);
  const result = await createExportTask({
    tenantId: req.user!.tenantId,
    projectId: body.projectId,
    userId: req.user!.id,
    idempotencyKey: body.idempotencyKey ?? randomUUID(),
    quality: body.quality,
    failureMode: body.failureMode
  });
  res.status(result.replayed ? 200 : 201).json({ ...result.task, replayed: result.replayed });
}));

router.get('/tasks/:id', asyncHandler(async (req, res) => {
  const task = await getTaskById(req.user!.tenantId, String(req.params.id));
  res.json(task);
}));

router.post('/tasks/:id/lease', asyncHandler(async (req, res) => {
  const task = await leaseTask(req.user!.tenantId, String(req.params.id), req.user!.id);
  res.status(202).json({ task, workerId: req.user!.id, leaseSeconds: LEASE_SECONDS, fenceToken: task.leaseToken });
}));

router.post('/tasks/:id/complete', asyncHandler(async (req, res) => {
  const body = z.object({
    fenceToken: z.number().int().positive(),
    content: z.string().min(1).max(20000)
  }).parse(req.body);
  const task = await completeTask(req.user!.tenantId, String(req.params.id), body.fenceToken, body.content);
  res.json({ task, message: task.cancelRequestedAt ? '取消后工作器已越过不可取消点，任务仍完成并按实际消费结算' : '导出完成' });
}));

router.post('/tasks/:id/fail', asyncHandler(async (req, res) => {
  const body = z.object({
    fenceToken: z.number().int().positive(),
    reason: z.string().min(1).max(200).default('模拟处理失败')
  }).parse(req.body);
  const task = await failTask(req.user!.tenantId, String(req.params.id), body.fenceToken, body.reason);
  res.json({ task, message: '失败结果已入账，预留已释放，可安全重试' });
}));

router.post('/tasks/:id/cancel', asyncHandler(async (req, res) => {
  const result = await cancelTask(req.user!.tenantId, String(req.params.id));
  res.json(result);
}));

router.post('/tasks/:id/retry', asyncHandler(async (req, res) => {
  const task = await retryTask(req.user!.tenantId, String(req.params.id));
  res.status(201).json({ task, message: '已安全重试：仅存在一笔新的预留账目' });
}));

router.post('/tasks/:id/simulate-lost', asyncHandler(async (req, res) => {
  const task = await simulateWorkerLost(req.user!.tenantId, String(req.params.id));
  res.json({ task, message: '工作器心跳已停止且租约立即过期，可运行清理器验证旧结果被拒绝' });
}));

router.post('/reaper/run', asyncHandler(async (_req, res) => {
  const count = await reapExpiredLeases();
  res.json({ released: count, message: `已清理 ${count} 个失联工作器租约` });
}));

router.get('/artifacts/:id/download', asyncHandler(async (req, res) => {
  const artifact = await prisma.exportArtifact.findFirst({
    where: { id: String(req.params.id), tenantId: req.user!.tenantId },
    include: { task: true }
  });
  if (!artifact) throw new HttpError(404, '文件不存在或不属于当前团队');
  if (artifact.task.status !== 'SUCCEEDED') throw new HttpError(409, '任务未成功，文件尚不可下载');
  res.setHeader('Content-Type', artifact.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${artifact.fileName}"`);
  res.send(artifact.content);
}));

export default router;

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { workspaceApi } from "@/api/workspace";
import { useAuth } from "@/context/AuthContext";
import { useAsync } from "@/hooks/useAsync";
import { Card, CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { downloadWithAuth, getApiErrorMessage } from "@/api/client";
import { formatBytes, formatDateTime } from "@/lib/format";
import type { ExportTask, Project, TaskScenario, TaskStatus } from "@/types/domain";

const scenarioLabels: Record<TaskScenario, string> = {
  NORMAL: "正常完成（实际少于预留）",
  FAIL_ONCE: "模拟失败后重试",
  CANCEL_RACE: "取消后仍完成（竞争）",
  WORKER_LOST: "工作器失联",
  STORAGE_FULL: "存储空间不足"
};

const statusTone: Record<TaskStatus, "blue" | "green" | "orange" | "red" | "slate" | "purple"> = {
  QUEUED: "slate",
  RUNNING: "blue",
  CANCELLING: "orange",
  SUCCEEDED: "green",
  FAILED: "red",
  CANCELED: "purple"
};

export default function ExportsPage() {
  const { user } = useAuth();
  const canActOn = (task: ExportTask) =>
    task.requestedById === user?.id || user?.role === "OWNER" || user?.role === "ADMIN";
  const projectsState = useAsync(() => workspaceApi.projects(), []);
  const tasksState = useAsync(() => workspaceApi.exports(), [], { pollMs: 1800 });
  const [projectId, setProjectId] = useState("");
  const [units, setUnits] = useState(8);
  const [scenario, setScenario] = useState<TaskScenario>("NORMAL");
  const [submitting, setSubmitting] = useState(false);

  const projects: Project[] = projectsState.data?.projects || [];
  const tasks = tasksState.data?.tasks || [];
  const effectiveProjectId = projectId || projects[0]?.id || "";
  const clientRequestId = useMemo(
    () => `${crypto.randomUUID()}-${effectiveProjectId}`,
    [effectiveProjectId, units, scenario]
  );

  const createExport = async () => {
    if (!effectiveProjectId) {
      toast.error("请先创建项目");
      return;
    }
    setSubmitting(true);
    try {
      await workspaceApi.createExport({
        projectId: effectiveProjectId,
        estimatedUnits: Number(units),
        scenario,
        clientRequestId
      });
      toast.success("已提交或返回同一幂等导出请求；请观察冻结、实际消费和释放");
      tasksState.reload();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const act = async (task: ExportTask, action: "cancel" | "retry") => {
    try {
      const result = action === "cancel"
        ? await workspaceApi.cancelExport(task.id)
        : await workspaceApi.retryExport(task.id);
      toast.success(result.message);
      tasksState.reload();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const download = async (task: ExportTask) => {
    if (!task.resultUrl) return;
    try {
      const response = await downloadWithAuth(task.resultUrl);
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = task.resultName || "export.txt";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "下载授权失败"));
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="发起导出与额度预留" description="按钮可连续点击：同一 clientRequestId 在服务端只创建一个任务、一笔预留。完成时按 75% 左右实际消费结算并返还未用冻结。" />
        <div className="grid gap-4 p-5 lg:grid-cols-[1.5fr_0.7fr_1.5fr_auto]">
          <label className="text-sm font-bold text-slate-700">
            项目
            <select className="input mt-2" value={effectiveProjectId} onChange={(event) => { setProjectId(event.target.value); }}>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-bold text-slate-700">
            预留 units
            <input className="input mt-2" type="number" min={1} max={1000} value={units} onChange={(event) => { setUnits(Number(event.target.value)); }} />
          </label>
          <label className="text-sm font-bold text-slate-700">
            验收场景
            <select className="input mt-2" value={scenario} onChange={(event) => { setScenario(event.target.value as TaskScenario); }}>
              {Object.entries(scenarioLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <Button className="self-end" disabled={submitting || projects.length === 0} onClick={createExport}>
            {submitting ? "提交中..." : "提交导出（可连续点击）"}
          </Button>
        </div>
        <p className="px-5 pb-5 text-xs leading-5 text-slate-500">
          幂等键在当前表单参数下保持不变；失败任务已释放冻结，重试会重新预留。工作器失联约 7 秒后由心跳巡检释放。
        </p>
      </Card>

      <Card>
        <CardHeader title="导出历史（强制租户过滤）" description="接口只返回当前 JWT 所属团队；即使知道其他团队任务 ID，下载接口也会返回 404/403。" />
        {tasksState.loading ? <TableSkeleton /> : tasksState.error ? (
          <div className="p-5 text-sm text-rose-700">{tasksState.error}</div>
        ) : (
          <div className="overflow-x-auto p-5">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400">
                  <th className="pb-3">项目 / 时间</th>
                  <th>状态</th>
                  <th>场景</th>
                  <th>预留/实际</th>
                  <th>结果</th>
                  <th>说明</th>
                  <th className="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id} className="border-b border-slate-50 align-top">
                    <td className="py-4 pr-4">
                      <p className="font-bold text-slate-900">{task.projectName || task.projectId}</p>
                      <p className="mt-1 text-xs text-slate-400">{formatDateTime(task.createdAt)} · 第 {task.attempt + 1} 次尝试</p>
                    </td>
                    <td className="py-4 pr-4"><Badge tone={statusTone[task.status]}>{task.status}</Badge></td>
                    <td className="py-4 pr-4 text-slate-600">{scenarioLabels[task.scenario]}</td>
                    <td className="py-4 pr-4 font-bold text-slate-800">{task.estimatedUnits} / {task.actualUnits ?? "—"}</td>
                    <td className="py-4 pr-4 text-slate-500">{task.resultName ? `${task.resultName} · ${formatBytes(task.resultBytes)}` : "—"}</td>
                    <td className="max-w-xs py-4 pr-4 text-xs leading-5 text-slate-500">
                      {task.failureReason || (task.cancelRequestedAt ? `取消请求 ${formatDateTime(task.cancelRequestedAt)}` : "—")}
                    </td>
                    <td className="py-4 text-right">
                      <div className="inline-flex flex-wrap justify-end gap-2">
                        {canActOn(task) && ["QUEUED", "RUNNING", "CANCELLING"].includes(task.status) && <Button variant="secondary" onClick={() => act(task, "cancel")}>取消</Button>}
                        {canActOn(task) && task.status === "FAILED" && <Button onClick={() => act(task, "retry")}>失败重试</Button>}
                        {task.status === "SUCCEEDED" && <Button variant="secondary" onClick={() => download(task)}>授权下载</Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

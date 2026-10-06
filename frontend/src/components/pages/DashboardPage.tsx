import { Link } from "react-router-dom";
import { workspaceApi } from "@/api/workspace";
import { useAsync } from "@/hooks/useAsync";
import { Card, CardHeader } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { formatBytes, formatDateTime } from "@/lib/format";
import type { TaskStatus } from "@/types/domain";

const statusTone: Record<TaskStatus, "blue" | "green" | "orange" | "red" | "slate" | "purple"> = {
  QUEUED: "slate",
  RUNNING: "blue",
  CANCELLING: "orange",
  SUCCEEDED: "green",
  FAILED: "red",
  CANCELED: "purple"
};

export default function DashboardPage() {
  const { data, loading, error, reload } = useAsync(() => workspaceApi.overview(), [], { pollMs: 2500 });

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28" />
        <div className="grid gap-5 md:grid-cols-4"><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const storagePercent = Math.round((data.storage.used / data.storage.limit) * 100);

  return (
    <div className="space-y-6">
      {error && <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">{error} <button className="font-bold underline" onClick={reload}>重试</button></div>}
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 p-8 text-white shadow-2xl">
        <p className="text-sm font-semibold text-blue-200">统一授权 · 租户隔离 · 事务账目</p>
        <h1 className="mt-3 text-3xl font-bold md:text-4xl">真实余额、冻结预留和未结任务实时可见</h1>
        <p className="mt-3 max-w-3xl leading-7 text-blue-100">
          提交导出只冻结预留，完成时按实际消费结算，取消或工作器失联释放未用冻结。任何历史和下载请求均由服务端按租户过滤。
        </p>
      </section>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="真实可用余额" value={data.account.availableBalance} suffix=" units" tone="blue" hint={`已消费 ${data.account.consumedTotal}`} />
        <MetricCard label="冻结/预留" value={data.account.heldAmount} suffix=" units" tone="orange" hint={`实际配额 ${data.account.actualQuota}`} />
        <MetricCard label="当前可导出" value={data.account.exportableNow} suffix=" units" tone="green" hint="同时受余额和实际配额限制" />
        <MetricCard label="未结任务" value={data.stats.openTasks} suffix=" 个" tone="purple" hint="排队 / 运行 / 取消中" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader title="未结任务" description="多次点击只返回同一 clientRequestId 任务；取消后若工作器仍完成，服务端依据取消状态和场景竞争结果只结算一次。" action={<Link className="text-sm font-semibold text-blue-600 hover:underline" to="/exports">查看全部</Link>} />
          <div className="p-5">
            {data.openTasks.length === 0 ? (
              <EmptyState title="暂无未结任务" description="可以在导出历史页发起新的验收任务。" />
            ) : (
              <div className="space-y-3">
                {data.openTasks.map((task) => (
                  <div key={task.id} className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-bold text-slate-900">{task.projectName}</p>
                      <p className="text-xs text-slate-500">更新于 {formatDateTime(task.updatedAt)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-slate-600">预留 {task.estimatedUnits}</span>
                      <Badge tone={statusTone[task.status]}>{task.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="存储空间" description="完成导出时检查落盘空间；空间不足失败并释放预留。" />
          <div className="space-y-5 p-5">
            <div>
              <div className="mb-2 flex justify-between text-sm font-semibold">
                <span>{formatBytes(data.storage.used)}</span>
                <span className="text-slate-400">{formatBytes(data.storage.limit)}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${storagePercent > 90 ? "bg-rose-500" : "bg-gradient-to-r from-blue-500 to-indigo-500"}`} style={{ width: `${Math.min(storagePercent, 100)}%` }} />
              </div>
              <p className="mt-2 text-sm text-slate-500">剩余 {formatBytes(data.storage.available)}（{storagePercent}% 已用）</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="项目" value={data.stats.projects} />
              <MiniStat label="收藏模板" value={data.stats.favorites} />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ label, value, suffix, tone, hint }: { label: string; value: number; suffix: string; tone: string; hint: string }) {
  const colors: Record<string, string> = {
    blue: "from-blue-500/10 text-blue-700",
    orange: "from-orange-500/10 text-orange-700",
    green: "from-emerald-500/10 text-emerald-700",
    purple: "from-violet-500/10 text-violet-700"
  };
  return (
    <Card className={`bg-gradient-to-br to-white p-5 ${colors[tone]}`}>
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-black text-slate-950">{value}<span className="text-base font-bold text-slate-400">{suffix}</span></p>
      <p className="mt-2 text-xs text-slate-500">{hint}</p>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl bg-slate-50 p-4 text-center"><p className="text-2xl font-black text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{label}</p></div>;
}
